/**
 * The environment, audited from inside the app.
 *
 * Deleting and re-adding environment variables is the one operation where a
 * single typo produces a site that looks broken in a dozen unrelated ways — a
 * public profiles missing, a sign-in sheet that says "not switched on", or a
 * Turso reading room answering 503 without saying what is missing. This module turns all of
 * that into one
 * honest list: every variable the app reads, whether this build actually has
 * it, what it powers, and what stops working without it.
 *
 * Two rules hold this together:
 *
 *   • **Presence, never values.** Client variables are public by design (they
 *     identify infrastructure in the browser), but there is no reason for the
 *     UI to print them. The audit reports `set` / `missing` / `placeholder`,
 *     plus a short fingerprint where it helps tell two keys apart.
 *
 *   • **Every read is written out literally.** Next.js inlines `process.env.*`
 *     at build time by textual substitution — a loop over `process.env`
 *     would see nothing. So each variable below names itself, exactly once,
 *     which also makes this file the canonical list of what the app needs.
 */

import { env } from '../lib/env';

type Status = 'set' | 'missing' | 'placeholder' | 'danger';

interface VarReport {
  /** The name as it must appear in Vercel, character for character. */
  name: string;
  status: Status;
  /** What it powers, in one line. */
  what: string;
  /** What silently stops working when it is missing. */
  breaks: string;
  /** A safe, non-secret fingerprint — never the value itself. */
  hint: string;
}

interface GroupReport {
  id: string;
  title: string;
  /** `critical` stops sign-in or the cloud; `optional` degrades gently. */
  weight: 'critical' | 'important' | 'optional';
  vars: VarReport[];
  ok: boolean;
}

/** Values that are still the template text from .env.example. */
function looksLikePlaceholder(value: string): boolean {
  return /your[-_]|_your|xxx|changeme|placeholder|^pk_test_your|^sk_test_your/i.test(value);
}

function report(
  name: string,
  raw: string | undefined,
  what: string,
  breaks: string,
  fingerprint?: (value: string) => string,
): VarReport {
  const value = (raw ?? '').trim();
  if (!value) return { name, status: 'missing', what, breaks, hint: '' };
  if (looksLikePlaceholder(value)) return { name, status: 'placeholder', what, breaks, hint: 'template value' };
  return { name, status: 'set', what, breaks, hint: fingerprint ? fingerprint(value) : 'set' };
}

/** `pk_live_…` → `pk_live_ (42 chars)`: distinguishes keys without exposing one. */
const keyFingerprint = (value: string) => `${value.slice(0, 8)}… (${value.length} chars)`;

/**
 * Clerk's publishable key deserves its own check: a `sk_` value here would
 * publish a live secret, and a `pk_test_` key on a production domain is the
 * single most common cause of "sign-in returns and nothing happens".
 */
function clerkKeyReport(): VarReport {
  const name = 'VITE_CLERK_PUBLISHABLE_KEY';
  const value = (env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined)?.trim() ?? '';
  const what = 'Identifies your Clerk instance; owns sign-in, sessions and usernames.';
  const breaks = 'Sign-in is offered only as a fallback, and every Clerk flow disappears.';
  if (!value) return { name, status: 'missing', what, breaks, hint: '' };
  if (value.startsWith('sk_')) {
    return {
      name,
      status: 'danger',
      what,
      breaks: 'A SECRET key is in a public variable — it is in the browser bundle. Rotate it and use the pk_ value.',
      hint: 'sk_… — wrong kind of key',
    };
  }
  if (value.startsWith('pk_test_')) {
    return {
      name,
      status: 'danger',
      what,
      breaks:
        'Development instance: sessions live in third-party cookies, every provider round trip can come back empty, and your configured provider credentials are ignored.',
      hint: keyFingerprint(value),
    };
  }
  if (!value.startsWith('pk_live_')) {
    return { name, status: 'placeholder', what, breaks, hint: 'not a Clerk publishable key' };
  }
  return { name, status: 'set', what, breaks, hint: keyFingerprint(value) };
}

/** Canonical-origin check: this value is baked into SEO tags and links. */
function siteUrlReport(): VarReport {
  const name = 'VITE_SITE_URL';
  const value = (env.VITE_SITE_URL as string | undefined)?.trim() ?? '';
  const what = 'The canonical origin: canonical tags, sitemap, Open Graph and structured data.';
  const breaks = 'Search engines may index every page as a duplicate of the wrong domain.';
  if (!value) return { name, status: 'missing', what, breaks, hint: '' };
  const problems: string[] = [];
  if (!/^https:\/\//.test(value)) problems.push('must start with https://');
  if (value.endsWith('/')) problems.push('no trailing slash');
  if (typeof window !== 'undefined' && window.location.origin !== value) {
    problems.push(`this page is on ${window.location.origin}`);
  }
  if (problems.length) {
    return { name, status: 'placeholder', what, breaks, hint: problems.join('; ') };
  }
  return { name, status: 'set', what, breaks, hint: value };
}

/**
 * The anon key is public by design — it only ever unlocks what the row policies
 * allow. A *secret* key in a `VITE_` variable is the one mistake here that is
 * worth shouting about, because it is in the browser bundle and it bypasses
 * every policy in supabase/schema.sql.
 */
function anonKeyReport(): VarReport {
  const name = 'VITE_SUPABASE_ANON_KEY';
  const value = (env.VITE_SUPABASE_ANON_KEY as string | undefined)?.trim() ?? '';
  const what = 'The public key the browser presents, paired with the signed-in session.';
  const breaks = 'Writes are refused and nothing can be published.';
  if (!value) return { name, status: 'missing', what, breaks, hint: '' };
  if (value.startsWith('sb_secret_') || value.startsWith('service_role')) {
    return {
      name,
      status: 'danger',
      what,
      breaks: 'A SECRET key is in a public variable — it is in the browser bundle and it ignores every row policy. Rotate it and use the anon/publishable key.',
      hint: 'secret key — wrong kind',
    };
  }
  // A legacy anon key is a JWT whose payload carries `"role":"anon"`.
  if (value.split('.').length === 3) {
    try {
      const payload = JSON.parse(atob(value.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))) as { role?: string };
      if (payload.role === 'service_role') {
        return {
          name,
          status: 'danger',
          what,
          breaks: 'A service-role JWT is in a public variable — it is in the browser bundle and it ignores every row policy. Rotate it.',
          hint: 'service_role — wrong kind of key',
        };
      }
    } catch {
      /* not a JWT we can read; the shape checks below still apply */
    }
  }
  return { name, status: 'set', what, breaks, hint: keyFingerprint(value) };
}

/** Supabase — profiles, usernames and account-backed data. */
function dataGroup(): GroupReport {
  const vars: VarReport[] = [
    report(
      'VITE_SUPABASE_URL',
      env.VITE_SUPABASE_URL as string | undefined,
      'The Supabase project that owns profiles, usernames and account-backed data.',
      'Profile and username features cannot work; presentations remain in Turso.',
      keyFingerprint,
    ),
    anonKeyReport(),
  ];
  // Half-configured is the dangerous state: the app must never half-connect.
  const url = vars[0].status === 'set';
  const key = vars[1].status === 'set';
  if (url !== key && (vars[0].status !== 'danger' || vars[1].status !== 'danger')) {
    const culprit = url ? vars[1] : vars[0];
    if (culprit.status !== 'danger') {
      culprit.status = 'danger';
      culprit.breaks = 'Half-configured: the app needs the URL and the public key together.';
    }
  }
  return {
    id: 'data',
    title: 'Supabase — profiles and account data',
    weight: 'critical',
    vars,
    ok: vars.every((v) => v.status === 'set'),
  };
}

/**
 * Convex is an optional, bounded safety mirror. Its absence never blocks a
 * read, write or rehearsal, so the environment panel treats it as optional.
 */
function liveGroup(): GroupReport {
  const vars: VarReport[] = [
    report(
      'VITE_CONVEX_URL',
      env.VITE_CONVEX_URL as string | undefined,
      'The optional Convex mirror for a capped sample of public presentations.',
      'No secondary safety snapshot is available; Turso remains the only canonical store.',
      keyFingerprint,
    ),
  ];
  return {
    id: 'live',
    title: 'Convex — bounded safety mirror (optional)',
    weight: 'optional',
    vars,
    ok: vars.every((v) => v.status === 'set'),
  };
}

/**
 * Everything this build reads, grouped by what it costs to lose.
 * Server-only variables are deliberately absent: they are never in the bundle.
 * Their state is what `probeServerEnv()` below reports.
 */
export function auditEnvironment(): GroupReport[] {
  const clerk: GroupReport = {
    id: 'clerk',
    title: 'Clerk — sign-in, sessions, usernames',
    weight: 'critical',
    vars: [clerkKeyReport()],
    ok: false,
  };
  clerk.ok = clerk.vars.every((v) => v.status === 'set');

  const site: GroupReport = {
    id: 'site',
    title: 'The site itself',
    weight: 'important',
    vars: [siteUrlReport()],
    ok: false,
  };
  site.ok = site.vars.every((v) => v.status === 'set');

  // Ads need no variables of their own: `servingads` is a table beside
  // everything else, so the group above covers them. One fewer thing to
  // configure, and one fewer way to be half-configured. The reading room needs
  // no variables here either — Turso is reached by the server, never by the
  // browser, so its two names are checked through `probeServerEnv()` instead.
  return [clerk, site, dataGroup(), liveGroup()];
}

/** True when the two variables that gate everything durable are both present. */
export function cloudConfigured(): boolean {
  return dataGroup().ok;
}

/* ------------------------------------------------------------------ */
/* The server side                                                     */
/* ------------------------------------------------------------------ */

export interface ServerProbe {
  /** Did the request reach our function at all? */
  reachable: boolean;
  /** Are the server-only variables in place? */
  ok: boolean;
  /** Short label for the outcome. */
  label: string;
  /** The server's own explanation, when it gave one. */
  detail: string;
  /** Variables the server named as missing, if any. */
  missing: string[];
}

/**
 * Ask the reading room to describe itself.
 *
 * `/api/library` is the server-only Turso read path, so it is also how the
 * browser learns whether the authoritative presentation store is working. A
 * plain GET answers `200` when the library schema is available, `503
 * library_unavailable` with an actionable reason when it is not, and `404` if
 * the endpoint itself has not been deployed.
 *
 * Turso is the sole presentation-content store: an unavailable library is a
 * real issue, never a signal to silently read a second database.
 *
 * Never throws. This runs on pages anyone can open.
 */
export async function probeServerEnv(): Promise<ServerProbe> {
  const blank: ServerProbe = {
    reachable: false,
    ok: false,
    label: 'Not checked',
    detail: '',
    missing: [],
  };
  if (typeof fetch !== 'function') return { ...blank, label: 'Cannot check', detail: 'This browser cannot make the request.' };

  try {
    const response = await fetch('/api/library?max=1', {
      method: 'GET',
      headers: { Accept: 'application/json' },
      credentials: 'same-origin',
    });

    const text = await response.text();
    let payload: { error?: string; message?: string } = {};
    try {
      payload = JSON.parse(text) as { error?: string; message?: string };
    } catch {
      // HTML instead of JSON is the signature of a rewrite serving index.html.
    }

    const code = payload.error ?? '';
    const named = /([A-Z][A-Z_]{3,})/.exec(payload.message ?? '')?.[1];

    if (response.ok) {
      return {
        reachable: true,
        ok: true,
        label: 'Turso library ready',
        detail:
          'The authoritative presentation library answered on the server.',
        missing: [],
      };
    }

    if (response.status === 503 && code === 'library_unavailable') {
      const message = payload.message ?? 'Turso could not answer the library query.';
      const notConfigured = /not configured/i.test(message);
      return {
        reachable: true,
        ok: false,
        label: notConfigured ? 'Turso not configured' : 'Turso library unavailable',
        detail: `Turso is the authoritative presentation store. ${message}`,
        missing: notConfigured
          ? ['TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN'].filter((name) => message.includes(name))
          : named ? [named] : [],
      };
    }

    if (response.status === 503) {
      return {
        reachable: true,
        ok: false,
        label: 'Turso library unavailable',
        detail: payload.message ?? 'The endpoint could not reach the authoritative presentation store.',
        missing: named ? [named] : [],
      };
    }

    if (response.status === 405) {
      // Reachable only if something in front of the function turns GETs into
      // something else — the app never sends anything but GET here.
      return {
        reachable: true,
        ok: false,
        label: 'Rejected the method',
        detail:
          payload.message ??
          'The endpoint refused a GET. Something in front of the function is rewriting the request.',
        missing: [],
      };
    }

    if (!response.ok && !payload.error) {
      return {
        reachable: response.status !== 404,
        ok: false,
        label: response.status === 404 ? 'Not deployed' : `HTTP ${response.status}`,
        detail:
          response.status === 404
            ? 'No function answered at /api/library. Shared presentations cannot be read until the Turso API is deployed.'
            : 'The endpoint answered something other than JSON. Check the deployment logs.',
        missing: [],
      };
    }

    return {
      reachable: true,
      ok: false,
      label: `HTTP ${response.status}`,
      detail: payload.message ?? `Unexpected answer${code ? `: ${code}` : ''}.`,
      missing: [],
    };
  } catch {
    return {
      reachable: false,
      ok: false,
      label: 'Unreachable',
      detail: 'The request never completed — offline, or something is blocking the API path.',
      missing: [],
    };
  }
}

/** The names to paste into Vercel, in the order they should be added. */
export const CLIENT_VARIABLE_NAMES = auditEnvironment().flatMap((group) => group.vars.map((v) => v.name));

/**
 * Server-only names, shown as a reminder — their values never touch the bundle.
 * The two Turso names are the ones the reading room holds; Clerk's are what
 * `/api/clerk-set-username` uses. Nothing else needs a secret, because nothing
 * else in this site talks to a service the browser is not allowed to reach.
 */
export const SERVER_VARIABLE_NAMES = [
  'CLERK_SECRET_KEY',
  'CLERK_AUTHORIZED_PARTIES',
  'TURSO_DATABASE_URL',
  'TURSO_AUTH_TOKEN',
];
