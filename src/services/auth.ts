import { loadFirebase, FIREBASE_ENABLED, NotConfiguredError } from './firebase';

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

function toAuthUser(raw: Record<string, unknown> | null): AuthUser | null {
  if (!raw || !raw.uid) return null;
  const providerData = Array.isArray(raw.providerData) ? raw.providerData[0] : undefined;
  const providerId =
    (providerData as { providerId?: string } | undefined)?.providerId ??
    (typeof raw.providerId === 'string' ? raw.providerId : null);
  return {
    uid: String(raw.uid),
    email: typeof raw.email === 'string' ? raw.email : null,
    displayName: typeof raw.displayName === 'string' ? raw.displayName : null,
    photoURL: typeof raw.photoURL === 'string' ? raw.photoURL : null,
    providerId,
  };
}

/** Mirror the signed-in person into `users` and `bloggers` (v1's collection). */
async function syncProfile(user: AuthUser) {
  const bundle = await loadFirebase();
  if (!bundle) return;
  const { fs, db } = bundle;
  const base = {
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    photoURL: user.photoURL,
    providerId: user.providerId,
    lastSeen: fs.serverTimestamp(),
  };
  try {
    await fs.setDoc(fs.doc(db, 'users', user.uid), base, { merge: true });
  } catch {
    /* profile mirroring is best effort */
  }
  try {
    await fs.setDoc(
      fs.doc(db, 'bloggers', user.uid),
      {
        uid: user.uid,
        name: user.displayName ?? (user.email ? user.email.split('@')[0] : 'Anonymous'),
        email: user.email,
        photoURL: user.photoURL,
        updatedAt: fs.serverTimestamp(),
      },
      { merge: true },
    );
  } catch {
    /* the leaderboard is best effort too */
  }
}

export async function signIn(provider: SignInProvider): Promise<AuthUser> {
  if (!FIREBASE_ENABLED) throw new NotConfiguredError();
  const bundle = await loadFirebase();
  if (!bundle) throw new NotConfiguredError();

  const authProvider =
    provider === 'google' ? new bundle.GoogleAuthProvider() : new bundle.OAuthProvider('microsoft.com');
  authProvider.setCustomParameters?.({ prompt: 'select_account' });

  try {
    const result = await bundle.signInWithPopup(bundle.auth, authProvider);
    const user = toAuthUser(result.user);
    if (user) void syncProfile(user);
    return user ?? (await waitForUser());
  } catch (error) {
    const code = (error as { code?: string })?.code ?? '';
    // Popups are blocked in some in-app browsers: fall back to a redirect.
    if (code === 'auth/popup-blocked' || code === 'auth/operation-not-supported-in-this-environment') {
      await bundle.signInWithRedirect(bundle.auth, authProvider);
      return waitForUser();
    }
    throw error;
  }
}

function waitForUser(): Promise<AuthUser> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const timer = setTimeout(() => {
      if (!settled) {
        settled = true;
        reject(new Error('Sign-in timed out. Please try again.'));
      }
    }, 120000);
    void loadFirebase().then((bundle) => {
      if (!bundle) {
        clearTimeout(timer);
        reject(new NotConfiguredError());
        return;
      }
      const stop = bundle.onAuthStateChanged(bundle.auth, (raw) => {
        const user = toAuthUser(raw);
        if (user && !settled) {
          settled = true;
          clearTimeout(timer);
          stop();
          void syncProfile(user);
          resolve(user);
        }
      });
    });
  });
}

export async function completeRedirectSignIn(): Promise<AuthUser | null> {
  if (!FIREBASE_ENABLED) return null;
  const bundle = await loadFirebase();
  if (!bundle) return null;
  const result = await bundle.getRedirectResult(bundle.auth);
  const user = toAuthUser(result?.user ?? null);
  if (user) void syncProfile(user);
  return user;
}

export async function signOut(): Promise<void> {
  const bundle = await loadFirebase();
  if (!bundle) return;
  await bundle.signOut(bundle.auth);
}

export function subscribeToAuth(next: (user: AuthUser | null) => void): () => void {
  let stop = () => {};
  void loadFirebase().then((bundle) => {
    if (!bundle) {
      next(null);
      return;
    }
    stop = bundle.onAuthStateChanged(bundle.auth, (raw) => next(toAuthUser(raw)));
  });
  return () => stop();
}

/* ------------------------------------------------------------------ */
/* Clerk → Firebase token exchange                                      */
/* ------------------------------------------------------------------ */

/**
 * Where our own serverless function lives. In production Vercel serves
 * `api/clerk-firebase-token.ts` here; in `vite dev` a small plugin mounts the
 * same handler so local development behaves identically.
 */
export const TOKEN_ENDPOINT = '/api/clerk-firebase-token';

/**
 * The Clerk user id we last exchanged. Clerk and Firebase sessions are both
 * long-lived, so without this the bridge would re-mint a token on every
 * render pass that touched auth.
 */
let exchangedFor: string | null = null;

export type ExchangeFailure =
  | 'not-configured'
  | 'no-session'
  | 'endpoint-missing'
  | 'server-misconfigured'
  /** 501 clerk_sdk_unavailable: the function is deployed but its own
   *  dependency was not shipped with it. A packaging fault, never a variable. */
  | 'sdk-unavailable'
  | 'method-rejected'
  | 'unauthorized'
  | 'server-error'
  /** Firebase Auth refused the custom token we minted (auth/invalid-custom-token
   *  and friends). Almost always a service account from another project. */
  | 'auth-rejected'
  | 'network';

export interface ExchangeOutcome {
  ok: boolean;
  reason?: ExchangeFailure;
  /**
   * The specific words behind the failure: the server's own `message`, or
   * Firebase's `auth/…` code. Shown to the operator, because "network error"
   * for a rejected token wasted days once.
   */
  detail?: string;
}

/** Read a JSON body without ever throwing — a 501 body may be anything. */
async function readBody(response: Response): Promise<{ error?: string; message?: string; token?: string }> {
  try {
    return (await response.json()) as { error?: string; message?: string; token?: string };
  } catch {
    return {};
  }
}

/**
 * Swaps a verified Clerk session for a Firebase Auth session.
 *
 * The Clerk session token is sent to *our* function, which verifies it with
 * Clerk's secret key and, only then, mints a Firebase custom token carrying
 * the same user id. The browser never sees the Admin credential, and
 * Firestore rules continue to match on `request.auth.uid`.
 *
 * Every failure mode is non-fatal and named: reading the public library
 * never depended on being signed in to Firebase, so a missing endpoint
 * degrades to "signed in to Clerk, cloud writes unavailable" rather than
 * breaking the app.
 */
export async function exchangeClerkSessionForFirebase(
  clerkUserId: string,
  getToken: () => Promise<string | null>,
): Promise<ExchangeOutcome> {
  if (!FIREBASE_ENABLED) return { ok: false, reason: 'not-configured' };
  if (exchangedFor === clerkUserId) return { ok: true };

  try {
    const sessionToken = await getToken();
    if (!sessionToken) return { ok: false, reason: 'no-session' };

    const response = await fetch(TOKEN_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      },
      // The body is empty on purpose: identity comes from the bearer token,
      // never from anything the client asserts about itself.
      body: '{}',
    });

    if (response.status === 404) return { ok: false, reason: 'endpoint-missing' };
    if (response.status === 401 || response.status === 403) {
      const body = await readBody(response);
      return { ok: false, reason: 'unauthorized', detail: body.message ?? body.error ?? `HTTP ${response.status}` };
    }
    if (response.status === 501) {
      // Two very different faults share this status: a missing/!malformed
      // server variable, and a dependency that was never packaged into the
      // function. The server names which; pass that through instead of
      // guessing.
      const body = await readBody(response);
      const packaging = body.error === 'clerk_sdk_unavailable';
      return {
        ok: false,
        reason: packaging ? 'sdk-unavailable' : 'server-misconfigured',
        detail: body.message ?? body.error ?? 'The endpoint answered 501 without a message.',
      };
    }
    // 405 means the function is alive but refused the method — almost always
    // something rewriting the request (a redirect that turns POST into GET,
    // or a proxy in front of it) rather than anything in this app, which
    // only ever sends POST.
    if (response.status === 405) return { ok: false, reason: 'method-rejected' };
    if (!response.ok) return { ok: false, reason: 'server-error' };

    const payload = await readBody(response);
    const customToken = typeof payload.token === 'string' ? payload.token : null;
    if (!customToken) {
      return { ok: false, reason: 'server-error', detail: payload.message ?? 'The endpoint returned no token.' };
    }

    const bundle = await loadFirebase();
    if (!bundle) return { ok: false, reason: 'not-configured' };

    try {
      await bundle.signInWithCustomToken(bundle.auth, customToken);
    } catch (error) {
      // This is where a project mismatch shows up: Firebase Auth verifies the
      // custom token against *its* project's keys, so a token signed by another
      // project's service account is refused outright. Reporting it as
      // "network" (as this used to) hides the one fact that identifies it.
      const code = (error as { code?: unknown }).code;
      const text = typeof code === 'string' && code ? `${code}: ${(error as Error).message}` : (error as Error).message;
      console.warn('[pb] Firebase refused the custom token', text);
      return { ok: false, reason: 'auth-rejected', detail: text };
    }

    exchangedFor = clerkUserId;
    return { ok: true };
  } catch (error) {
    return { ok: false, reason: 'network', detail: (error as Error).message };
  }
}

/** Forget the cached exchange — call after an explicit sign-out. */
export function resetTokenExchange() {
  exchangedFor = null;
}

/** Mirror the signed-in person into `users` and `bloggers`. Best effort. */
export function ensureProfile(user: AuthUser): void {
  void syncProfile(user);
}

/** Sign out of Firebase only, leaving the Clerk session alone. */
export async function signOutFirebaseOnly(): Promise<void> {
  resetTokenExchange();
  try {
    const bundle = await loadFirebase();
    if (bundle) await bundle.signOut(bundle.auth);
  } catch {
    /* nothing is signed in, or Firebase never loaded — both are fine */
  }
}
