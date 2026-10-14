/**
 * The environment, audited from inside the app.
 *
 * Deleting and re-adding environment variables is the one operation where a
 * single typo produces a site that looks broken in a dozen unrelated ways — a
 * library with no cloud speeches, a sign-in sheet that says "not switched on",
 * a token exchange answering 501. This module turns all of that into one
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
 *   • **Every read is written out literally.** Vite inlines `import.meta.env.*`
 *     at build time by textual substitution — a loop over `import.meta.env`
 *     would see nothing. So each variable below names itself, exactly once,
 *     which also makes this file the canonical list of what the app needs.
 */

const env = import.meta.env ?? ({} as ImportMetaEnv);

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

const firebaseVar = (name: string, what: string) =>
  report(name, env[name as keyof ImportMetaEnv] as string | undefined, what, 'Cloud speeches, profiles, reactions and publishing stay local-only.', keyFingerprint);

/** The data project's web config — public by design, but required as a set. */
function dataGroup(): GroupReport {
  const vars: VarReport[] = [
    firebaseVar('VITE_FIREBASE_API_KEY', 'Identifies the data project to the browser.'),
    firebaseVar('VITE_FIREBASE_AUTH_DOMAIN', 'Firebase Auth host used by the token exchange.'),
    firebaseVar('VITE_FIREBASE_PROJECT_ID', 'Which project the cloud library reads and writes.'),
    firebaseVar('VITE_FIREBASE_STORAGE_BUCKET', 'Storage bucket for the project.'),
    firebaseVar('VITE_FIREBASE_MESSAGING_SENDER_ID', 'Sender id (web config).'),
    firebaseVar('VITE_FIREBASE_APP_ID', 'App id (web config).'),
    firebaseVar('VITE_FIREBASE_MEASUREMENT_ID', 'Analytics id, if enabled.'),
  ];
  // Partially configured is the dangerous state: the app must never half-connect.
  const apiKey = vars[0].status === 'set';
  const projectId = vars[2].status === 'set';
  if (apiKey !== projectId) {
    const culprit = apiKey ? vars[2] : vars[0];
    culprit.status = 'danger';
    culprit.breaks = 'Half-configured: the app needs the API key and the project id together.';
  }
  return {
    id: 'data',
    title: 'Firebase — the data project',
    weight: 'critical',
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

  // Ads need no variables of their own: `servingads` lives in the data
  // project, so the `data` group above covers them. One fewer thing to
  // configure, and one fewer way to be half-configured.
  return [clerk, site, dataGroup()];
}

/** True when the two variables that gate the whole cloud are both present. */
export function cloudConfigured(): boolean {
  const report = dataGroup();
  return report.ok;
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
 * Ask the token endpoint to describe itself.
 *
 * A POST with no session token is the perfect probe: a *correctly configured*
 * server answers `401 missing_session_token` (everything is present, the
 * request simply had no credentials), while a misconfigured one answers `501`
 * and names the variable it lacks. A 404 means the function is not deployed —
 * or the host is serving HTML for it, which looks identical from here.
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
    const response = await fetch('/api/clerk-firebase-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
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

    if (response.status === 401 && (code === 'missing_session_token' || code === 'invalid_session_token')) {
      return {
        reachable: true,
        ok: true,
        label: 'Ready',
        detail: 'The endpoint is deployed and both server variables are in place.',
        missing: [],
      };
    }

    if (response.status === 501) {
      // 501 covers two unrelated faults, and conflating them sent people to
      // Vercel for days. `clerk_sdk_unavailable` is the function failing to load
      // its *own* dependency — a packaging problem that no environment variable
      // can fix. Only the other codes name a variable.
      if (code === 'clerk_sdk_unavailable') {
        return {
          reachable: true,
          ok: false,
          label: 'Deployment is missing a dependency',
          detail:
            payload.message ??
            'The function could not load the Clerk SDK. That is a packaging problem in the deployment, not a missing variable.',
          missing: [],
        };
      }
      const missing = /([A-Z][A-Z_]{3,})/.exec(payload.message ?? '')?.[1];
      return {
        reachable: true,
        ok: false,
        label: 'Server variable missing',
        detail: payload.message ?? 'The endpoint is running but is not configured.',
        missing: missing ? [missing] : [],
      };
    }

    if (response.status === 405) {
      // Reachable only if something in front of the function turns POSTs into
      // GETs — the app itself never sends anything else.
      return {
        reachable: true,
        ok: false,
        label: 'Rejected the method',
        detail:
          payload.message ??
          'The endpoint refused a POST. Something in front of the function is rewriting the request.',
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
            ? 'No function answered at /api/clerk-firebase-token — the API half of the deployment is missing, so the cloud cannot be reached.'
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

/** Server-only names, shown as a reminder (their values never touch the bundle). */
export const SERVER_VARIABLE_NAMES = ['CLERK_SECRET_KEY', 'CLERK_AUTHORIZED_PARTIES', 'FIREBASE_SERVICE_ACCOUNT_JSON'];
