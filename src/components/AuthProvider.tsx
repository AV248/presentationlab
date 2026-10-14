import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import {
  ClerkProvider,
  UserButton,
  useUser,
  useAuth as useClerkAuth,
  useClerk,
} from '@clerk/clerk-react';
import { dark } from '@clerk/themes';
import {
  CLERK_PUBLISHABLE_KEY,
  CLERK_KEY_ERROR,
  CLERK_AFTER_SIGN_OUT_URL,
  CLERK_ENABLED,
  CLERK_LOAD_TIMEOUT_MS,
  registerClerkHandlers,
} from '../services/clerk';
import {
  ensureProfile,
  exchangeClerkSessionForFirebase,
  signOutFirebaseOnly,
  type AuthUser,
} from '../services/auth';
import { useAuth } from '../store/auth';
import { useProfile } from '../store/profile';

/**
 * Authentication provider.
 *
 * Clerk owns identity when it is configured; the component below keeps the
 * app's existing `useAuth` store in step with it, so no page had to change.
 * When Clerk is not configured this is a transparent wrapper and the app
 * falls back to its previous behaviour (Firebase providers, or fully local).
 */

/** The subset of Clerk's user object the app actually reads. */
interface ClerkUserLike {
  id: string;
  fullName: string | null;
  username: string | null;
  imageUrl: string;
  primaryEmailAddress: { emailAddress: string } | null;
}

function mapClerkUser(user: ClerkUserLike): AuthUser {
  return {
    uid: user.id,
    email: user.primaryEmailAddress?.emailAddress ?? null,
    displayName: user.fullName ?? user.username ?? null,
    photoURL: user.imageUrl || null,
    providerId: 'clerk',
    username: user.username ?? null,
  };
}

/**
 * Track the app's light/dark scheme so Clerk's sign-in modal matches it.
 *
 * The theme engine writes `data-scheme` onto <html> (see design/compile.ts).
 * Watching that attribute — rather than re-reading the settings store — means
 * this stays correct for every one of the app's themes, including the ones a
 * visitor has not opened the theme studio to set.
 */
function readScheme(): 'light' | 'dark' {
  return document.documentElement.dataset.scheme === 'dark' ? 'dark' : 'light';
}

function useColorScheme(): 'light' | 'dark' {
  const [scheme, setScheme] = useState<'light' | 'dark'>(readScheme);

  useEffect(() => {
    setScheme(readScheme());
    if (typeof MutationObserver === 'undefined') return undefined;
    const observer = new MutationObserver(() => setScheme(readScheme()));
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-scheme'],
    });
    return () => observer.disconnect();
  }, []);

  return scheme;
}

/**
 * The bridge. Renders nothing; it exists to move identity from Clerk's React
 * context into the zustand store every other component already reads.
 *
 * It also performs the token exchange: once Clerk has signed somebody in, it
 * asks our serverless function for a Firebase custom token, so Firestore
 * rules keep matching on `request.auth.uid`. That step is best-effort —
 * browsing the library never required it, so a failure leaves the visitor
 * signed in to Clerk with cloud writes unavailable, and is recorded on the
 * store rather than thrown.
 */
function ClerkAuthBridge() {
  const { isLoaded, isSignedIn, userId, getToken } = useClerkAuth();
  const { user } = useUser();
  const clerk = useClerk();

  // Clerk hands back fresh function identities on re-render. Keeping the
  // latest in a ref lets the effect below depend on things that actually
  // change — without it, the effect would re-run on every render and re-mint
  // a token each time.
  const latest = useRef({ user, getToken });
  useEffect(() => {
    latest.current = { user, getToken };
  }, [user, getToken]);

  // Give the store a way to sign out from outside React (sidebar, palette).
  useEffect(() => {
    registerClerkHandlers({
      signOut: () => clerk.signOut(),
      updateUsername: async (username: string) => {
        const current = latest.current.user;
        if (!current) throw new Error('Clerk is still loading — try again in a moment.');
        // One username per person, for life: never overwrite an existing one.
        if (current.username && current.username.toLowerCase() !== username.toLowerCase()) {
          throw new Error(`Your username is @${current.username} and cannot be changed.`);
        }
        if (!current.username) await current.update({ username });
      },
    });
    return () => registerClerkHandlers(null);
  }, [clerk]);

  // Clerk's script is third-party. If it is blocked or the device is
  // offline, `isLoaded` never flips to true — and the admin workspace waits
  // on auth readiness, so it would spin forever. After the timeout we treat
  // it as "not signed in" and let the app get on with it.
  useEffect(() => {
    if (isLoaded) return undefined;
    const timer = window.setTimeout(() => {
      if (import.meta.env.DEV) {
        console.warn(
          `[clerk] Clerk did not load within ${CLERK_LOAD_TIMEOUT_MS / 1000}s — continuing signed out.`,
        );
      }
      useAuth.getState().setSession(null);
    }, CLERK_LOAD_TIMEOUT_MS);
    return () => window.clearTimeout(timer);
  }, [isLoaded]);

  useEffect(() => {
    if (!isLoaded) return;

    const store = useAuth.getState();

    if (!isSignedIn || !userId) {
      store.setSession(null);
      // A Clerk sign-out must not leave a live Firebase session behind, or
      // Firestore would still accept writes from the previous person.
      void signOutFirebaseOnly();
      return;
    }

    const clerkUser = latest.current.user;
    if (!clerkUser) return;

    const authUser = mapClerkUser(clerkUser);
    store.setSession(authUser);
    // Mirror the profile so the leaderboard has a name to show. Best effort.
    ensureProfile(authUser);

    // Restore an already-claimed handle from Firestore (users/{uid}) so the
    // sidebar shows @username — not "Claim" — on every device.
    void import('../services/profiles').then(({ fetchOwnProfile }) =>
      fetchOwnProfile(authUser.uid).then((own) => {
        if (!own?.username) return;
        const current = useProfile.getState();
        if (!current.username) {
          useProfile.setState({
            username: own.username,
            displayName: own.displayName || current.displayName,
            bio: own.bio || current.bio,
            location: own.location || current.location,
            website: own.website || current.website,
            signature: own.signature || current.signature,
          });
        }
      }),
    ).catch(() => { /* local profile still applies */ });

    // Username created in Clerk's Manage Account but not yet claimed here?
    // Send them to /claim once per session, username already filled in.
    if (authUser.username) {
      try {
        const claimed = useProfile.getState().username;
        if (claimed.toLowerCase() !== authUser.username.toLowerCase()
          && !sessionStorage.getItem('pb.clerk-username-steered')
          && !window.location.pathname.startsWith('/claim')) {
          sessionStorage.setItem('pb.clerk-username-steered', '1');
          window.location.assign('/claim');
        }
      } catch { /* steering is a courtesy, never a blocker */ }
    }

    void exchangeClerkSessionForFirebase(clerkUser.id, () => latest.current.getToken()).then(
      (outcome) => {
        useAuth.getState().setBridge(outcome);
      },
    );
  }, [isLoaded, isSignedIn, userId]);

  return null;
}

/** Clerk's own account menu: manage profile, switch account, sign out. */
export function AccountMenu() {
  if (!CLERK_ENABLED) return null;
  return <UserButton afterSignOutUrl="/" showName={false} />;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();

  // Memoised so Clerk does not rebuild its appearance on every render of the
  // tree above it — which would re-mount the modal mid-interaction.
  const appearance = useMemo(
    () => ({
      baseTheme: scheme === 'dark' ? dark : undefined,
      variables: {
        // Inherit the app's type rather than Clerk's default stack.
        fontFamily: 'inherit',
      },
    }),
    [scheme],
  );

  if (!CLERK_ENABLED) {
    // A misconfigured key is caught at startup rather than manifesting as a
    // sign-in button that silently does nothing.
    if (CLERK_KEY_ERROR && import.meta.env.DEV) {
      console.error(`[clerk] ${CLERK_KEY_ERROR}`);
    }
    return <>{children}</>;
  }

  return (
    <ClerkProvider
      publishableKey={CLERK_PUBLISHABLE_KEY}
      afterSignOutUrl={CLERK_AFTER_SIGN_OUT_URL}
      appearance={appearance}
    >
      <ClerkAuthBridge />
      {children}
    </ClerkProvider>
  );
}
