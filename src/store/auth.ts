import { create } from 'zustand';
import type { AuthUser, SignInProvider } from '../services/auth';
import * as authService from '../services/auth';
import { fetchRole, fetchMyReactions, type ReactionKind, type Role } from '../services/data';

interface AuthState {
  ready: boolean;
  user: AuthUser | null;
  role: Role;
  reactions: Record<string, ReactionKind>;
  pending: SignInProvider | null;
  error: string | null;
  configured: boolean;

  init: () => void;
  signInWith: (provider: SignInProvider) => Promise<void>;
  signOut: () => Promise<void>;
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
  configured: true,

  init: () => {
    if (initialised) return;
    initialised = true;

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
    await authService.signOut();
    set({ user: null, role: null, reactions: {} });
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

/** True when Firebase environment variables are present. */
export const isFirebaseAvailable = () => Boolean(import.meta.env?.VITE_FIREBASE_API_KEY);
