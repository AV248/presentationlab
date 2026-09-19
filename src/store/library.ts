import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Speech, SpeechKind, SpeechLevel } from '../data/speeches';
import { LIBRARY } from '../data/speeches';
import { slugify } from '../lib/text';

export type SpeechStatus = 'draft' | 'published';

export interface StoredSpeech extends Speech {
  source: 'user';
  status: SpeechStatus;
  updatedAt: string;
}

export interface LibraryState {
  mine: StoredSpeech[];
  hidden: string[];
  bookmarks: string[];
  likes: Record<string, boolean>;
  views: Record<string, number>;
  progress: Record<string, number>;
  history: string[];
  seeded: boolean;

  createSpeech: (partial?: Partial<Speech>) => string;
  updateSpeech: (id: string, patch: Partial<Speech & { status: SpeechStatus }>) => void;
  deleteSpeech: (id: string) => void;
  duplicateSpeech: (id: string) => string | null;
  setStatus: (id: string, status: SpeechStatus) => void;
  toggleBookmark: (id: string) => void;
  toggleLike: (id: string) => void;
  registerView: (id: string) => void;
  setProgress: (id: string, value: number) => void;
  pushHistory: (id: string) => void;
  setHidden: (id: string, hidden: boolean) => void;
  importMany: (items: Speech[]) => number;
  resetLocal: () => void;
}

const nowIso = () => new Date().toISOString();

export const TEMPLATE_BODY = `## Hook

Open with a question, a scene, or a reversal.

## The one thing you want them to remember

Write it in one plain sentence, with no jargon.

## Why it matters

Give one number, one story, and one consequence.

## The ask

What should this room do differently on Monday?

## Close

Return to the opening image, changed.`;

export const useLibrary = create<LibraryState>()(
  persist(
    (set, get) => ({
      mine: [],
      hidden: [],
      bookmarks: [],
      likes: {},
      views: {},
      progress: {},
      history: [],
      seeded: false,

      createSpeech: (partial) => {
        const id = `mine-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
        const speech: StoredSpeech = {
          id,
          kind: 'speech' as SpeechKind,
          title: partial?.title ?? 'Untitled speech',
          author: partial?.author ?? 'You',
          category: partial?.category ?? 'My speeches',
          occasion: partial?.occasion ?? 'General',
          level: (partial?.level ?? 'Standard') as SpeechLevel,
          tags: partial?.tags ?? [],
          preview: partial?.preview ?? '',
          content: partial?.content ?? TEMPLATE_BODY,
          createdAt: nowIso(),
          updatedAt: nowIso(),
          source: 'user',
          status: 'draft',
        };
        set((state) => ({ mine: [speech, ...state.mine] }));
        return id;
      },

      updateSpeech: (id, patch) =>
        set((state) => ({
          mine: state.mine.map((s) =>
            s.id === id ? { ...s, ...patch, updatedAt: nowIso() } : s,
          ),
        })),

      deleteSpeech: (id) =>
        set((state) => ({
          mine: state.mine.filter((s) => s.id !== id),
          bookmarks: state.bookmarks.filter((b) => b !== id),
          history: state.history.filter((h) => h !== id),
        })),

      duplicateSpeech: (id) => {
        const source =
          get().mine.find((s) => s.id === id) ?? LIBRARY.find((s) => s.id === id) ?? null;
        if (!source) return null;
        const newId = get().createSpeech({
          ...source,
          title: `${source.title} (copy)`,
        });
        const created = get().mine.find((s) => s.id === newId);
        if (created) get().updateSpeech(newId, { content: source.content, preview: source.preview });
        return newId;
      },

      setStatus: (id, status) =>
        set((state) => ({
          mine: state.mine.map((s) => (s.id === id ? { ...s, status, updatedAt: nowIso() } : s)),
        })),

      toggleBookmark: (id) =>
        set((state) => ({
          bookmarks: state.bookmarks.includes(id)
            ? state.bookmarks.filter((b) => b !== id)
            : [id, ...state.bookmarks],
        })),

      toggleLike: (id) =>
        set((state) => ({
          likes: { ...state.likes, [id]: !state.likes[id] },
        })),

      registerView: (id) =>
        set((state) => ({
          views: { ...state.views, [id]: (state.views[id] ?? 0) + 1 },
        })),

      setProgress: (id, value) =>
        set((state) => {
          const next = Math.max(0, Math.min(1, value));
          const previous = state.progress[id] ?? 0;
          // Ignore sub-1% changes: progress fires on every scroll event and
          // writing a new object each time would re-render the whole library.
          if (Math.abs(previous - next) < 0.01) return state;
          return { progress: { ...state.progress, [id]: next } };
        }),

      pushHistory: (id) =>
        set((state) => ({ history: [id, ...state.history.filter((h) => h !== id)].slice(0, 24) })),

      setHidden: (id, hidden) =>
        set((state) => ({
          hidden: hidden
            ? [...new Set([...state.hidden, id])]
            : state.hidden.filter((h) => h !== id),
        })),

      importMany: (items) => {
        const imported: StoredSpeech[] = items.map((item) => ({
          ...item,
          id: `mine-${slugify(item.title)}-${Math.random().toString(36).slice(2, 6)}`,
          source: 'user',
          status: 'published',
          updatedAt: nowIso(),
        }));
        set((state) => ({ mine: [...imported, ...state.mine] }));
        return imported.length;
      },

      resetLocal: () =>
        set({
          mine: [],
          hidden: [],
          bookmarks: [],
          likes: {},
          views: {},
          progress: {},
          history: [],
          seeded: false,
        }),
    }),
    {
      name: 'pb.library.v1',
      version: 1,
      partialize: (state) => ({
        mine: state.mine,
        hidden: state.hidden,
        bookmarks: state.bookmarks,
        likes: state.likes,
        views: state.views,
        progress: state.progress,
        history: state.history,
        seeded: state.seeded,
      }),
    },
  ),
);

/** Deterministic community-like baseline so the leaderboard has substance. */
export function baseLikes(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) % 100000;
  }
  return 12 + (hash % 189);
}

export function baseViews(id: string): number {
  return baseLikes(id) * 7 + 41;
}
