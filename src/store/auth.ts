import { create } from 'zustand';
import type { AuthUser, SignInProvider, ExchangeFailure } from '../services/auth';
import * as authService from '../services/auth';
import {
  CLERK_ENABLED,
  clerkSignOut,
  clerkIsMounted,
} from '../services/clerk';
import { fetchRole, fetchMyReactions, type ReactionKind, type Role } from '../services/data';

interface AuthState {
  ready: boolean;
  user: AuthUser | null;
  role: Role;
  reactions: Record<string, ReactionKind>;
  pending: SignInProvider | null;
  error: string | null;
  configured: boolean;
  /** Outcome of the last Clerk → Firebase token exchange, for diagnostics. */
  bridge: { ok: boolean; reason?: ExchangeFailure; detail?: string } | null;

  init: () => void;
  signInWith: (provider: SignInProvider) => Promise<void>;
  signOut: () => Promise<void>;
  /** Push an identity resolved elsewhere (Clerk) into the store. */
  setSession: (user: AuthUser | null) => void;
  setBridge: (bridge: { ok: boolean; reason?: ExchangeFailure; detail?: string } | null) => void;
  loadReactions: () => Promise<void>;
  setReactionLocal: (speechId: string, kind: ReactionKind | null) => void;
  refreshRole: () => Promise<void>;
  clearError: () => void;
}

let initialised = false;

export const useAuth = create<AuthState>((set, get) => ({
  ready: false,
  user: null,
  role: null,
  reactions: {},
  pending: null,
  error: null,
  // With Clerk configured, sign-in is available the moment Clerk mounts; the
  // bridge sets `ready` from Clerk's own isLoaded flag.
  configured: CLERK_ENABLED,
  bridge: null,

  init: () => {
    if (initialised) return;
    initialised = true;

    // Clerk owns identity when it is configured. Subscribing to Firebase Auth
    // here as well would fight it: Firebase starts signed out, so the listener
    // would immediately overwrite the Clerk user with null.
    if (CLERK_ENABLED) return;

    void authService
      .completeRedirectSignIn()
      .catch(() => null)
      .then(() => {
        const stop = authService.subscribeToAuth(async (user) => {
          set({ user, ready: true });
          if (user) {
            void get().loadReactions();
            void get().refreshRole();
          } else {
            set({ role: null, reactions: {} });
          }
        });
        return stop;
      });
  },

  setSession: (user) => {
    const previous = get().user;
    // Clerk re-renders often; only react when the identity actually changes.
    if (previous?.uid === user?.uid && get().ready) return;

    set({ user, ready: true });
    if (user) {
      void get().loadReactions();
      void get().refreshRole();
    } else {
      set({ role: null, reactions: {}, bridge: null });
    }
  },

  setBridge: (bridge) => set({ bridge }),

  signInWith: async (provider) => {
    set({ pending: provider, error: null });
    try {
      const user = await authService.signIn(provider);
      set({ user, pending: null, ready: true });
      void get().loadReactions();
      void get().refreshRole();
    } catch (error) {
      const message = (error as { message?: string })?.message ?? 'Sign-in failed.';
      set({ pending: null, error: message });
    }
  },

  signOut: async () => {
    if (CLERK_ENABLED && clerkIsMounted()) {
      // Clerk ends the session; the bridge clears `user` when useUser() flips.
      await clerkSignOut();
      // If Clerk's widget is unavailable (blocked script, ad-blocker) fall
      // through so the visitor is not trapped in a signed-in state.
      if (get().user === null) return;
    }
    await authService.signOut();
    set({ user: null, role: null, reactions: {}, bridge: null });
  },

  loadReactions: async () => {
    const user = get().user;
    if (!user) return;
    const reactions = await fetchMyReactions(user.uid);
    set({ reactions });
  },

  setReactionLocal: (speechId, kind) =>
    set((state) => {
      const next = { ...state.reactions };
      if (kind) next[speechId] = kind;
      else delete next[speechId];
      return { reactions: next };
    }),

  refreshRole: async () => {
    const user = get().user;
    if (!user) return;
    const role = await fetchRole(user.uid, user.email);
    set({ role });
  },

  clearError: () => set({ error: null }),
}));

/**
 * True when sign-in is offered at all.
 *
 * Clerk is preferred; Firebase's own providers remain as the fallback for an
 * installation that has Firebase config but no Clerk key.
 */
export const isSignInAvailable = () =>
  CLERK_ENABLED || Boolean(import.meta.env?.VITE_FIREBASE_API_KEY);

/** Kept for the settings page and the sign-in sheet's diagnostics. */
export const isFirebaseAvailable = () => Boolean(import.meta.env?.VITE_FIREBASE_API_KEY);
