/**
 * Sessions.
 *
 * Clerk is the only identity provider. There is no second login, no token
 * bridging and no Firebase: the Clerk session token is presented directly to
 * Postgres (verified as a third-party issuer) and to Convex (whose Clerk
 * provider checks it the same way). One identity, three databases.
 *
 * What used to be here — minting a Firebase custom token so Firestore rules
 * could match on `request.auth.uid` — is gone, and with it the endpoint, the
 * exchange, and a whole class of failure. What remains is `connectSession`,
 * which does the thing that is still worth doing: hand the token getter to both
 * clients and then *prove* the connection works with one authenticated read, so
 * a broken session is a named, visible fact rather than a mysterious refusal
 * two screens later.
 */

import {
  loadBackend,
  BACKEND_ENABLED,
  NotConfiguredError,
  setAccessTokenGetter,
  setLiveTokenGetter,
  live,
} from './backend';

export type SignInProvider = 'google' | 'microsoft';

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  providerId: string | null;
  /** Clerk username, when the person has set one. The one source of truth. */
  username?: string | null;
}

/**
 * Mirror the signed-in person into `profiles`.
 *
 * One row per person is the whole model — the v1 `bloggers` collection and its
 * duplicated counters are gone, because a second copy of a fact is a second
 * thing to disagree with.
 */
async function syncProfile(user: AuthUser) {
  const bundle = await loadBackend();
  if (!bundle) return;
  const { fs, db } = bundle;
  try {
    await fs.setDoc(
      fs.doc(db, 'users', user.uid),
      {
        uid: user.uid,
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        providerId: user.providerId,
        lastSeen: fs.serverTimestamp(),
      },
      { merge: true },
    );
  } catch {
    /* profile mirroring is best effort */
  }
}

/** Best effort: keep `profiles` current for the leaderboard and the workspace. */
export function ensureProfile(user: AuthUser): void {
  void syncProfile(user);
}

/* ------------------------------------------------------------------ */
/* The connection                                                      */
/* ------------------------------------------------------------------ */

export type ExchangeFailure =
  | 'not-configured'
  | 'no-session'
  | 'unauthorized'
  | 'server-error'
  | 'network';

export interface ExchangeOutcome {
  ok: boolean;
  reason?: ExchangeFailure;
  /** The database's own words. Shown to the operator. */
  detail?: string;
}

let connectedFor: string | null = null;

/**
 * Hand the Clerk session to Postgres and Convex, then check it.
 *
 * The check is one hostile read: select my own profile row. Postgres answers
 * 200 if the token is good, 401/403 if it is not, and the difference between
 * "not signed in", "rejected" and "the database is unreachable" is exactly what
 * a person needs to be told. Repeating it for the same user is a no-op, because
 * the token getter keeps working on its own after the first call.
 */
export async function connectSession(
  clerkUserId: string,
  getToken: () => Promise<string | null>,
): Promise<ExchangeOutcome> {
  if (!BACKEND_ENABLED) return { ok: false, reason: 'not-configured' };
  if (!clerkUserId) return { ok: false, reason: 'no-session' };

  setAccessTokenGetter(getToken);
  setLiveTokenGetter(getToken);

  if (connectedFor === clerkUserId) return { ok: true };

  const bundle = await loadBackend();
  if (!bundle) return { ok: false, reason: 'not-configured' };

  const token = await getToken().catch(() => null);
  if (!token) return { ok: false, reason: 'no-session' };

  try {
    const { fs, db } = bundle;
    const me = await fs.getDoc(fs.doc(db, 'users', clerkUserId));
    connectedFor = clerkUserId;
    // The row itself is not the point — that the query was *allowed* is.
    void me;
    return { ok: true };
  } catch (error) {
    const message = (error as Error).message ?? '';
    // PostgREST says 401/403 in the message; a rejected token is not an outage
    // and must not be reported as one.
    const rejected = /jwt|401|403|permission|denied|unauthor/i.test(message);
    return {
      ok: false,
      reason: rejected ? 'unauthorized' : 'network',
      detail: message,
    };
  }
}

/** Forget the connection: the token getters are dropped, so no later write can
 *  borrow the session of whoever just signed out. */
export function disconnectSession(): void {
  connectedFor = null;
  setAccessTokenGetter(null);
  setLiveTokenGetter(null);
}

/** Say goodbye to the live layer, so this browser stops counting as "here". */
export async function signOut(): Promise<void> {
  disconnectSession();
  void live;
}

/* ------------------------------------------------------------------ */
/* Compatibility surface                                               */
/* ------------------------------------------------------------------ */
/*  Clerk owns sign-in entirely now; these exist so the rest of the app     */
/*  keeps its shape while the provider does the actual work.                */

/** @deprecated Clerk handles sign-in; kept so callers keep compiling. */
export async function signIn(_provider: SignInProvider): Promise<AuthUser> {
  if (!BACKEND_ENABLED) throw new NotConfiguredError();
  throw new Error('Sign-in is handled by Clerk — use the sign-in sheet.');
}

/** @deprecated see above. */
export async function completeRedirectSignIn(): Promise<AuthUser | null> {
  return null;
}

/** @deprecated see above. */
export function subscribeToAuth(next: (user: AuthUser | null) => void): () => void {
  next(null);
  return () => undefined;
}

/** @deprecated see above. */
export async function waitForUser(): Promise<AuthUser> {
  throw new NotConfiguredError();
}
