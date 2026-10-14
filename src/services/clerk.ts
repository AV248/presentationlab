/**
 * Clerk configuration.
 *
 * Clerk owns sign-in, sessions, MFA and the user profile. Firebase Auth is
 * still used — but only as a *token exchange target*: after Clerk signs
 * somebody in, the app asks our own serverless function to mint a Firebase
 * custom token for that same person, so Firestore security rules keep
 * working exactly as they do today (`request.auth.uid`).
 *
 * That indirection is deliberate. It means:
 *   • no dual sign-in — the visitor signs in once, with Clerk
 *   • `request.auth.uid` in firestore.rules is the Clerk user id, stable
 *     across sessions and devices
 *   • the Firebase Admin credential that can mint those tokens never
 *     reaches the browser
 *
 * If the publishable key is absent the whole thing is inert: the app falls
 * back to its previous Firebase sign-in (or to being fully local), and
 * nothing here throws.
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
 * Where Clerk sends people after they sign out. Relative, so it works on
 * preview deployments and the production domain alike.
 */
export const CLERK_AFTER_SIGN_OUT_URL = '/';

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

/** Set the username in Clerk (Manage Account shows the same value). */
export async function clerkUpdateUsername(username: string): Promise<boolean> {
  if (!handlers?.updateUsername) return false;
  await handlers.updateUsername(username);
  return true;
}
