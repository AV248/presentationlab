import { loadFirebase, FIREBASE_ENABLED, NotConfiguredError } from './firebase';

export type SignInProvider = 'google' | 'microsoft';

export interface AuthUser {
  uid: string;
  email: string | null;
  displayName: string | null;
  photoURL: string | null;
  providerId: string | null;
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
