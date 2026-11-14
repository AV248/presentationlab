/**
 * Is this deployment actually working?
 *
 * ── Why presence is not enough ──────────────────────────────────────────────
 * `envCheck.ts` answers "is the variable there?". That is a different question
 * from "does the database answer?", and the two look identical from a dashboard:
 * a truncated token, a token from another database, a key rotated in one place
 * but not the other, a project that was paused — all of them are *present* and
 * broken. The only way to tell is to ask each service and listen for its reply.
 *
 * So this file talks to every service the app depends on, over the same
 * credentials the app uses, and reports what came back. It runs on the server,
 * which is the only place the secrets exist.
 *
 * ── What it never does ──────────────────────────────────────────────────────
 * It never returns a value. Not a token, not a URL, not a key — a caller learns
 * `configured` or `absent`, and nothing that would be worth stealing. The one
 * exception is the last four characters of the Clerk publishable key, which is
 * public by design (`pk_…` ships in every browser) and is the only way to tell
 * two projects apart at a glance.
 */
import { TURSO_CONFIGURED, TURSO_URL, libraryTableExists, turso } from './turso';
import { serverEnv, serverEnvAny } from './env';

/** How long any one service gets before it counts as not answering. */
const PROBE_TIMEOUT_MS = 4000;

export type CheckStatus = 'ok' | 'optional' | 'missing' | 'broken';

export interface Check {
  id: 'site' | 'clerk' | 'profiles' | 'reading-room' | 'live';
  title: string;
  /**
   * Can the site do its job without this? Filled in by `healthReport`, from
   * one table rather than by every return statement — see `CRITICAL` below.
   * Optional on the individual check functions, always present in the report.
   */
  critical?: boolean;
  status: CheckStatus;
  /** One sentence a person can act on. */
  detail: string;
  /** The variable names involved, present or not — never their values. */
  vars: string[];
  /** What to do about it, when there is something to do. */
  fix?: string;
  /** How long the probe took, when it made a request at all. */
  ms?: number;
}

export interface HealthReport {
  /** `ready` — everything critical works; `degraded` — optional things are off;
   *  `broken` — something critical is not answering. */
  verdict: 'ready' | 'degraded' | 'broken';
  /** A sentence for the top of the panel. */
  summary: string;
  checks: Check[];
  /** When the probe ran. */
  at: string;
}

/** Run `fn` with a short timeout, reporting how long it took either way. */
async function timed<T>(fn: () => Promise<T>): Promise<{ value: T | null; ms: number; error: string }> {
  const started = Date.now();
  try {
    const value = await fn();
    return { value, ms: Date.now() - started, error: '' };
  } catch (error) {
    return { value: null, ms: Date.now() - started, error: (error as Error)?.message ?? 'no answer' };
  }
}

/* ------------------------------------------------------------------ */
/* The checks                                                          */
/* ------------------------------------------------------------------ */

/**
 * Clerk — the thing everybody hits first.
 *
 * The publishable key is checked for its shape because a wrong *kind* of key is
 * the most common mistake: a secret key pasted into the public slot signs
 * nothing and looks perfectly configured.
 */
function checkClerk(): Check {
  const publicKey = serverEnvAny('VITE_CLERK_PUBLISHABLE_KEY', 'CLERK_PUBLISHABLE_KEY');
  const secretKey = serverEnv('CLERK_SECRET_KEY');
  const parties = serverEnv('CLERK_AUTHORIZED_PARTIES');

  if (!publicKey && !secretKey) {
    return {
      id: 'clerk',
      title: 'Clerk — sign-in',
      status: 'missing',
      detail: 'Neither key is present, so nobody can sign in, publish or react. Reading still works.',
      vars: ['VITE_CLERK_PUBLISHABLE_KEY', 'CLERK_SECRET_KEY'],
      fix: 'Copy the publishable key and the secret key from the Clerk dashboard into the deployment.',
    };
  }
  if (publicKey && !publicKey.startsWith('pk_')) {
    return {
      id: 'clerk',
      title: 'Clerk — sign-in',
      status: 'broken',
      detail: `The public key does not begin with "pk_" — it ends "…${publicKey.slice(-4)}". A secret key in the publishable slot cannot sign anybody in.`,
      vars: ['VITE_CLERK_PUBLISHABLE_KEY'],
      fix: 'Use the publishable key (pk_test_… or pk_live_…) for VITE_CLERK_PUBLISHABLE_KEY.',
    };
  }
  if (publicKey && !secretKey) {
    return {
      id: 'clerk',
      title: 'Clerk — sign-in',
      status: 'broken',
      detail: 'The browser can start a sign-in, but the server has no secret key, so the username endpoint will refuse.',
      vars: ['CLERK_SECRET_KEY'],
      fix: 'Add CLERK_SECRET_KEY (sk_test_… or sk_live_…) as a server-only variable.',
    };
  }
  if (!publicKey && secretKey) {
    return {
      id: 'clerk',
      title: 'Clerk — sign-in',
      status: 'broken',
      detail: 'The server has a secret key, but the browser has no publishable key, so no sign-in can start.',
      vars: ['VITE_CLERK_PUBLISHABLE_KEY'],
      fix: 'Add VITE_CLERK_PUBLISHABLE_KEY, then redeploy — it is baked into the bundle at build time.',
    };
  }

  return {
    id: 'clerk',
    title: 'Clerk — sign-in',
    status: 'ok',
    detail: `Both keys are in place (public key ends "…${publicKey.slice(-4)}").`,
    vars: ['VITE_CLERK_PUBLISHABLE_KEY', 'CLERK_SECRET_KEY'],
    ...(parties ? {} : { fix: 'CLERK_AUTHORIZED_PARTIES is empty — add your production domain so sessions are accepted on the custom domain.' }),
  };
}

/**
 * Supabase — identity, profiles and account data.
 *
 * Presentations are authoritative in Turso; Supabase remains the public profile
 * directory and the home of usernames and account relationships. Probe the
 * same public profile endpoint the site reads, with the anon key, so a 200 is a
 * real answer rather than a presence-only check.
 */
async function checkProfiles(): Promise<Check> {
  const base: Pick<Check, 'id' | 'title' | 'vars'> = {
    id: 'profiles',
    title: 'Supabase — profiles and usernames',
    vars: ['VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY'],
  };
  const url = serverEnvAny('VITE_SUPABASE_URL', 'SUPABASE_URL').replace(/\/+$/, '');
  const key = serverEnvAny('VITE_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY');

  if (!url || !key) {
    return {
      ...base,
      status: 'missing',
      detail: 'Supabase is not configured, so public profiles, usernames and account-backed actions are unavailable.',
      fix: 'Add VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY, then redeploy — both are build-time variables.',
    };
  }

  const { value, ms, error } = await timed(async () => {
    const target = new URL('/rest/v1/profiles', url);
    target.searchParams.set('select', 'uid');
    target.searchParams.set('limit', '1');
    const response = await fetch(target, {
      headers: { apikey: key, Authorization: `Bearer ${key}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      cache: 'no-store',
    });
    return { status: response.status, body: await response.text() };
  });

  if (!value) {
    return {
      ...base,
      status: 'broken',
      ms,
      detail: `Supabase did not answer within ${PROBE_TIMEOUT_MS / 1000}s (${error}).`,
      fix: 'Check the project is not paused, and that VITE_SUPABASE_URL is the project URL (https://<ref>.supabase.co).',
    };
  }
  if (value.status === 200) {
    return { ...base, status: 'ok', ms, detail: 'Supabase answered a public profile read.' };
  }
  if (value.status === 401 || value.status === 403) {
    return {
      ...base,
      status: 'broken',
      ms,
      detail: `Supabase refused the public key (HTTP ${value.status}).`,
      fix: 'The anon key does not match this project — copy it again from Settings → API, then redeploy.',
    };
  }
  if (value.status === 404 || /PGRST205|42P01/.test(value.body)) {
    return {
      ...base,
      status: 'broken',
      ms,
      detail: 'Supabase answered but the profiles table is missing.',
      fix: 'Apply supabase/schema.sql in the Supabase SQL Editor, then redeploy if the API schema cache needs a refresh.',
    };
  }
  return {
    ...base,
    status: 'broken',
    ms,
    detail: `Supabase answered with HTTP ${value.status}.`,
    fix: 'Open the Supabase project log; a 5xx usually means the project is paused or restoring.',
  };
}

/**
 * Turso — the authoritative presentation library.
 *
 * It is required for public shared reads and writes; Supabase is the profile
 * directory, not a second presentation store or a reading fallback.
 */
async function checkReadingRoom(): Promise<Check> {
  const base: Pick<Check, 'id' | 'title' | 'vars'> = {
    id: 'reading-room',
    title: 'Turso — the reading room',
    vars: ['TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN'],
  };

  if (!TURSO_CONFIGURED) {
    return {
      ...base,
      status: 'missing',
      detail: 'Turso is not configured, so the shared presentation library cannot be read or published.',
      fix: 'Add TURSO_DATABASE_URL and TURSO_AUTH_TOKEN, then redeploy — Turso is the authoritative presentation store.',
    };
  }

  const { value, ms, error } = await timed(async () => {
    const db = await turso();
    if (!db) throw new Error('the client could not be created');
    try {
      const hasTable = await libraryTableExists(db);
      if (!hasTable) return { hasTable: false, rows: 0 };
      const result = await db.execute('select count(*) as n from library');
      return { hasTable: true, rows: Number(result.rows[0]?.n ?? 0) };
    } finally {
      db.close();
    }
  });

  if (!value) {
    return {
      ...base,
      status: 'broken',
      ms,
      detail: TURSO_URL.startsWith('file:')
        ? `The reading room file could not be opened (${error}).`
        : `The reading room did not answer (${error}).`,
      fix: 'Check TURSO_DATABASE_URL (libsql://…) and that TURSO_AUTH_TOKEN is a current token for that database.',
    };
  }
  if (!value.hasTable) {
    return {
      ...base,
      status: 'missing',
      ms,
      detail: 'Turso is reachable, but the library schema is missing, so shared presentations cannot be served.',
      fix: 'Apply the additive schema with npm run db:turso, then retry the check.',
    };
  }
  return {
    ...base,
    status: 'ok',
    ms,
    detail: value.rows === 0
      ? 'Turso is reachable and ready; no presentations have been shared yet.'
      : `Turso is reachable and holds ${value.rows} published ${value.rows === 1 ? 'presentation' : 'presentations'}.`,
  };
}

/**
 * Convex — the optional safety mirror.
 *
 * Reachability only. It is never a presentation read path, and a missing
 * mirror does not affect the canonical Turso library.
 */
async function checkLive(): Promise<Check> {
  const base: Pick<Check, 'id' | 'title' | 'vars'> = {
    id: 'live',
    title: 'Convex — bounded safety mirror (optional)',
    vars: ['VITE_CONVEX_URL'],
  };
  const url = serverEnv('VITE_CONVEX_URL').replace(/\/+$/, '');

  if (!url) {
    return {
      ...base,
      status: 'optional',
      detail: 'Not configured. No optional safety snapshots are kept; Turso remains the sole canonical store.',
    };
  }

  const { value, ms } = await timed(async () => {
    const response = await fetch(`${url}/version`, {
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
      cache: 'no-store',
    });
    return response.status;
  });

  if (value === null) {
    return {
      ...base,
      status: 'optional',
      ms,
      detail: 'The safety deployment URL is set but nothing answered. Canonical presentation reads and writes still use Turso.',
      fix: 'Check that VITE_CONVEX_URL is the Convex deployment URL, then redeploy.',
    };
  }
  return {
    ...base,
    status: 'ok',
    ms,
    detail: `The deployment answered (HTTP ${value}).`,
  };
}

/**
 * The site's own address.
 *
 * Compared against the host the request actually arrived on, because that is
 * the mistake this check exists for: a canonical URL pointing at
 * `localhost:3000` or at a `*.vercel.app` preview while people are reading the
 * real domain. Search engines take that at its word.
 */
function checkSite(origin: string): Check {
  const configured = serverEnvAny('VITE_SITE_URL', 'SITE_URL').replace(/\/+$/, '');
  const base: Pick<Check, 'id' | 'title' | 'vars'> = {
    id: 'site',
    title: 'The site’s own address',
    vars: ['VITE_SITE_URL'],
  };

  if (!configured) {
    return {
      ...base,
      status: 'optional',
      detail: 'No canonical address is set, so pages fall back to the built-in default.',
      fix: 'Set VITE_SITE_URL to the production domain, then redeploy.',
    };
  }

  const sameHost = (() => {
    try {
      return new URL(configured).host === new URL(origin).host;
    } catch {
      return false;
    }
  })();

  if (!sameHost) {
    return {
      ...base,
      status: 'optional',
      detail: `This request arrived at ${origin}, while the canonical address is ${configured}. That is correct for a preview and wrong for production.`,
      fix: 'If this is the production domain, make VITE_SITE_URL match it exactly and redeploy.',
    };
  }
  return { ...base, status: 'ok', detail: `Canonical address matches the domain serving this request (${configured}).` };
}

/* ------------------------------------------------------------------ */
/* The report                                                          */
/* ------------------------------------------------------------------ */

/**
 * The services needed for the full authoring and reading experience.
 *
 * Clerk verifies sessions, Supabase owns profiles and usernames, and Turso is
 * the single presentation store. The optional Convex safety mirror and the
 * canonical origin have graceful fallbacks, so they are not counted as faults.
 */
const CRITICAL: ReadonlySet<Check['id']> = new Set<Check['id']>(['clerk', 'profiles', 'reading-room']);

/**
 * Probe everything, in parallel, and turn the answers into a verdict.
 *
 * `origin` is the address the request came in on, so the site check can compare
 * it with the configured canonical — see `checkSite`.
 */
export async function healthReport(origin: string): Promise<HealthReport> {
  const [profiles, readingRoom, live] = await Promise.all([
    checkProfiles(),
    checkReadingRoom(),
    checkLive(),
  ]);

  const checks: Check[] = [checkClerk(), checkSite(origin), profiles, readingRoom, live].map((check) => ({
    ...check,
    critical: CRITICAL.has(check.id),
  }));

  /*
   * The verdict weighs *what* is wrong, not only how much.
   *
   * A missing critical piece and a missing optional piece are both "missing",
   * and they mean different things: without Clerk, Supabase profiles or Turso,
   * sign-in, identity or the shared library cannot do their job. The optional
   * Convex safety mirror and canonical origin have graceful fallbacks; counting
   * those alongside a core outage would report a broken deployment as merely degraded.
   */
  const failing = checks.filter((check) => check.critical && check.status !== 'ok');
  const optional = checks.filter((check) => !check.critical && check.status !== 'ok');
  const verdict: HealthReport['verdict'] = failing.length ? 'broken' : optional.length ? 'degraded' : 'ready';

  const summary =
    verdict === 'ready'
      ? 'Everything this deployment needs is in place and answering.'
      : verdict === 'degraded'
        ? `The site is working. ${optional.length} optional piece${optional.length === 1 ? '' : 's'} of setup ${optional.length === 1 ? 'is' : 'are'} not in place — each one says what it costs.`
        : `${failing.length} thing${failing.length === 1 ? '' : 's'} this deployment needs ${failing.length === 1 ? 'is' : 'are'} not working. The site is running, and these are what to fix: ${failing.map((check) => check.title).join(', ')}.`;

  return { verdict, summary, checks, at: new Date().toISOString() };
}
