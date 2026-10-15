/**
 * Clerk configuration.
 *
 * Clerk owns sign-in, sessions, MFA and the user profile — it is the only
 * identity in the whole stack. The session token Clerk hands out is presented
 * directly to the two databases that need one:
 *
 *   • Postgres, through Supabase's third-party auth, where `auth.jwt()->>'sub'`
 *     is the Clerk user id and the row policies in supabase/schema.sql read it
 *   • Convex, through the `convex` JWT template, for presence and activity
 *
 * Turso needs no token at all: it is a read-only copy of published work, served
 * by /api/library, and it never learns who is asking.
 *
 * So there is exactly one sign-in, one user id, and no credential that has to
 * mint anything else. If the publishable key is absent the whole layer is inert
 * and the app stays fully readable; nothing here throws.
 */

const env = import.meta.env ?? ({} as ImportMetaEnv);

const RAW_KEY = (env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined)?.trim() ?? '';

/**
 * Clerk publishable keys look like pk_test_<base64 of the frontend API host>$
 * or pk_live_<...>$. The trailing `$` is part of the key, not a typo.
 *
 * We validate the shape rather than just checking for a non-empty string,
 * because the single most common misconfiguration is pasting the *secret*
 * key (sk_...) into the VITE_ variable. That would publish the secret into
 * the browser bundle, so we refuse it outright and say why.
 */
function validatePublishableKey(key: string): { key: string; error: string | null } {
  if (!key) return { key: '', error: null };

  if (key.startsWith('sk_')) {
    return {
      key: '',
      error:
        'VITE_CLERK_PUBLISHABLE_KEY holds a SECRET key (sk_...). That value must never be bundled into the browser. Move it to CLERK_SECRET_KEY (no VITE_ prefix) and put the pk_... value here.',
    };
  }

  if (!/^pk_(test|live)_[A-Za-z0-9+/=$_-]+$/.test(key)) {
    return {
      key: '',
      error:
        'VITE_CLERK_PUBLISHABLE_KEY is not shaped like a Clerk publishable key (expected pk_test_... or pk_live_...).',
    };
  }

  return { key, error: null };
}

const validated = validatePublishableKey(RAW_KEY);

export const CLERK_PUBLISHABLE_KEY = validated.key;
export const CLERK_KEY_ERROR = validated.error;

/** True when Clerk is configured well enough to attempt a real sign-in. */
export const CLERK_ENABLED = Boolean(CLERK_PUBLISHABLE_KEY);

/** True once the site is running on live keys rather than development ones. */
export const CLERK_IS_LIVE = CLERK_PUBLISHABLE_KEY.startsWith('pk_live_');

/**
 * The Frontend API host this build actually talks to, decoded from the
 * publishable key itself.
 *
 * A Clerk publishable key is the literal text `pk_test_` or `pk_live_`
 * followed by the base64 of "<frontend-api-host>$". Decoding it here is the
 * single fastest way to answer the question every "signed in but signed out"
 * report comes down to: *which Clerk instance is this page really using?*
 * A live site still holding a `pk_test_` key is talking to a development
 * instance, whose session cookies live on a third-party domain — and browsers
 * that block those make a completed sign-in evaporate. Printing the decoded
 * host makes that visible instead of mysterious.
 */
export const CLERK_FRONTEND_API = (() => {
  if (!CLERK_PUBLISHABLE_KEY) return '';
  try {
    if (typeof atob !== 'function') return '';
    const body = CLERK_PUBLISHABLE_KEY.replace(/^pk_(test|live)_/, '');
    const b64 = body.replace(/-/g, '+').replace(/_/g, '/');
    const padded = b64 + '='.repeat((4 - (b64.length % 4)) % 4);
    return atob(padded).replace(/\$$/, '');
  } catch {
    return '';
  }
})();

/** Human label for the instance type, for diagnostics. */
export const CLERK_INSTANCE = CLERK_IS_LIVE ? 'production (pk_live_)' : 'development (pk_test_)';

/**
 * Set just before leaving for a provider, cleared when a session arrives.
 * If it is still there when Clerk says "signed out", the round trip came
 * back empty — and the sign-in sheet says so in words instead of leaving
 * the visitor wondering.
 */
export const SIGNIN_PENDING_KEY = 'pb.signin.pending';

/**
 * Where Clerk sends people after they sign out. Relative, so it works on
 * preview deployments and the production domain alike.
 */
export const CLERK_AFTER_SIGN_OUT_URL = '/';

/**
 * Where Clerk returns people when a redirect-based sign-in finishes.
 * Prerendered (see src/data/routes.ts) so no static host can 404 the
 * handshake, and never indexed.
 */
export const CLERK_SSO_CALLBACK_PATH = '/sso-callback';

/** Clerk's error shapes vary by version; read whichever one arrived. */
interface ClerkishError {
  code?: string;
  message?: string;
  longMessage?: string;
  errors?: { code?: string; message?: string; longMessage?: string }[];
}

/** Codes we can explain better than Clerk can, in this app's own words. */
const AUTH_HINTS: Record<string, string> = {
  oauth_not_enabled: 'That sign-in method is not switched on yet — use Continue instead.',
  strategy_for_user_invalid: 'That sign-in method is not available for this account — use Continue instead.',
  external_account_not_found: 'No account here uses that provider yet — create one first.',
  oauth_account_not_found: 'That provider is not linked to an account here yet — create one first.',
  session_exists: 'You are already signed in.',
  form_identifier_not_found: 'No account matches that address — create one instead.',
  form_password_incorrect: 'That password does not match. If you signed up with Google or Microsoft, use that button instead.',
  verification_expired: 'That code expired — request a fresh one.',
};

/**
 * One sentence a person can act on. Clerk's `longMessage` is good when it is
 * ours to show; for the handful of codes whose text assumes a developer, we
 * say something friendlier.
 */
export function clerkAuthMessage(error: unknown): string {
  const detail = error as ClerkishError | null;
  const first = detail?.errors?.[0];
  const code = first?.code ?? detail?.code ?? '';
  if (code && AUTH_HINTS[code]) return AUTH_HINTS[code];
  return (
    first?.longMessage ??
    first?.message ??
    detail?.longMessage ??
    detail?.message ??
    'Sign-in did not start. Please try again — or use Continue instead.'
  );
}

/** How long to wait for the token exchange before giving up on it. */
export const TOKEN_EXCHANGE_TIMEOUT_MS = 15_000;

/**
 * How long to wait for Clerk's script before assuming it is not coming.
 *
 * That script is third-party. An ad blocker, a corporate proxy, a strict CSP
 * or simply being offline can all stop it loading — and when that happens
 * Clerk's `isLoaded` stays false forever. Anything gated on auth readiness
 * (notably the admin workspace) would otherwise sit on a spinner for good.
 * After this timeout the app continues signed out.
 */
export const CLERK_LOAD_TIMEOUT_MS = 10_000;

/* ------------------------------------------------------------------ */
/* Bridging Clerk's React context to the rest of the app                 */
/* ------------------------------------------------------------------ */

/**
 * Signing out has to be reachable from a plain zustand action (the sidebar
 * menu, the settings page, the command palette) but Clerk's `signOut` only
 * exists inside its React context. The bridge component registers it here on
 * mount; the store calls through this indirection.
 *
 * This is a single nullable reference to a function, not to user data —
 * nothing about the signed-in person is held at module scope.
 */
interface ClerkHandlers {
  signOut: () => Promise<void>;
  /** Sets the Clerk username — Clerk is where the username lives. */
  updateUsername?: (username: string) => Promise<void>;
  /** The current Clerk session token, for calls to our own API. */
  getSessionToken?: () => Promise<string | null>;
  /** Present the Clerk session to the databases again. */
  retryExchange?: () => Promise<boolean>;
}

let handlers: ClerkHandlers | null = null;

export function registerClerkHandlers(next: ClerkHandlers | null) {
  handlers = next;
}

/**
 * No-op when Clerk is not mounted, so callers never need to branch.
 *
 * Clearing local state is not this function's job: Clerk's own `signOut`
 * ends the session, `useUser()` then reports nobody, and the bridge pushes
 * that into the store. Doing it here as well would race the bridge.
 */
export async function clerkSignOut(): Promise<void> {
  if (!handlers) return;
  await handlers.signOut();
}

export const clerkIsMounted = () => handlers !== null;

/** Set the username with the client SDK (Manage Account shows the same value). */
export async function clerkUpdateUsername(username: string): Promise<boolean> {
  if (!handlers?.updateUsername) return false;
  await handlers.updateUsername(username);
  return true;
}

/** Ask the app to hand the session to the databases again; false if unmounted. */
export async function retryCloudSession(): Promise<boolean> {
  if (!handlers?.retryExchange) return false;
  try {
    return await handlers.retryExchange();
  } catch {
    return false;
  }
}

/** The Clerk session token, or null when signed out / Clerk not mounted. */
export async function clerkSessionToken(): Promise<string | null> {
  if (!handlers?.getSessionToken) return null;
  try {
    return await handlers.getSessionToken();
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* Setting the username                                                */
/* ------------------------------------------------------------------ */

export interface UsernameOutcome {
  ok: boolean;
  /** Which path did it: the server (secret key) or the browser SDK. */
  via?: 'server' | 'client';
  code?: string;
  message?: string;
}

/** Clerk's own words for the one error everybody meets here. */
const IMMUTABLE_CODES = ['immutable_attribute_modification_not_allowed'];

function usernameError(error: unknown): UsernameOutcome {
  const detail = error as { code?: string; errors?: { code?: string; message?: string; longMessage?: string }[] } | null;
  const first = detail?.errors?.[0];
  const code = first?.code ?? detail?.code ?? 'client_update_failed';
  if (IMMUTABLE_CODES.includes(code)) {
    return {
      ok: false,
      code,
      message:
        'Clerk has this username locked. The owner can set it in the Clerk dashboard (Users → the person → Username), or the app can set it once the server is deployed.',
    };
  }
  return {
    ok: false,
    code,
    message:
      first?.longMessage ??
      first?.message ??
      'Clerk did not accept that username. Please try again.',
  };
}

/**
 * Set the username in Clerk, once, forever.
 *
 * The server goes first: it uses the secret key, which keeps working even when
 * the instance's **Restrict changes** toggle is on — and that toggle is
 * precisely the immutability guarantee this app wants, because with it on
 * Clerk refuses every end-user write, including the first one
 * (`immutable_attribute_modification_not_allowed`). Falling back to the
 * browser SDK keeps local development and the no-API deployment working.
 *
 * Never overwrites: the server refuses a second name, the bridge refuses a
 * second name, and this returns that refusal as a plain message.
 */
export async function setClerkUsername(username: string): Promise<UsernameOutcome> {
  const token = await clerkSessionToken();

  if (token) {
    try {
      const response = await fetch('/api/clerk-set-username', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ username }),
      });

      // 404 = the function is not deployed here; 501 = the server has no
      // secret key. Both mean "try the browser", not "fail".
      if (response.ok) {
        const payload = (await response.json().catch(() => null)) as { username?: string } | null;
        return { ok: true, via: 'server', code: payload?.username };
      }
      if (response.status !== 404 && response.status !== 501 && response.status !== 405) {
        const payload = (await response.json().catch(() => null)) as { error?: string; message?: string } | null;
        if (payload?.error) {
          return { ok: false, code: payload.error, message: payload.message ?? 'Clerk did not accept that username.' };
        }
      }
    } catch {
      /* offline or blocked: fall through to the browser SDK */
    }
  }

  try {
    await clerkUpdateUsername(username);
    return { ok: true, via: 'client' };
  } catch (error) {
    return usernameError(error);
  }
}
