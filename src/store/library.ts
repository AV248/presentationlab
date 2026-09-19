import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Speech, SpeechKind, SpeechLevel } from '../data/speeches';
import { slugify } from '../lib/text';
import type { WebSpeech } from '../services/webSources';

export type SpeechStatus = 'draft' | 'published';

export interface StoredSpeech extends Speech {
  source: 'user';
  status: SpeechStatus;
  updatedAt: string;
  /** Set once the draft has been pushed to Firestore. */
  cloudId?: string;
  ad?: boolean;
}

/** A line someone kept, with where it came from. */
export interface SavedLine {
  id: string;
  text: string;
  speechId: string;
  speechTitle: string;
  author: string;
  savedAt: string;
}

/** A note written in the margin of a speech. */
export interface MarginNote {
  id: string;
  speechId: string;
  text: string;
  at: string;
}

/** A letter written to yourself after a rehearsal. */
export interface Letter {
  id: string;
  speechId: string;
  speechTitle: string;
  text: string;
  at: string;
}

export type MilestoneId =
  | 'first-draft'
  | 'first-rehearsal'
  | 'first-publish'
  | 'first-line'
  | 'first-post'
  | 'first-margin';

export interface LibraryState {
  mine: StoredSpeech[];
  hidden: string[];
  bookmarks: string[];
  progress: Record<string, number>;
  history: string[];
  shelf: WebSpeech[];
  savedLines: SavedLine[];
  marginNotes: MarginNote[];
  letters: Letter[];
  milestones: Record<MilestoneId, string | null>;

  createSpeech: (partial?: Partial<Speech>) => string;
  updateSpeech: (id: string, patch: Partial<Speech & { status: SpeechStatus; cloudId?: string; ad?: boolean }>) => void;
  deleteSpeech: (id: string) => void;
  duplicateSpeech: (id: string, source?: Speech) => string | null;
  setStatus: (id: string, status: SpeechStatus) => void;
  toggleBookmark: (id: string) => void;
  setProgress: (id: string, value: number) => void;
  pushHistory: (id: string) => void;
  setHidden: (id: string, hidden: boolean) => void;

  addToShelf: (speech: WebSpeech) => void;
  removeFromShelf: (id: string) => void;
  updateShelfItem: (id: string, patch: Partial<WebSpeech>) => void;

  saveLine: (line: Omit<SavedLine, 'id' | 'savedAt'>) => void;
  removeLine: (id: string) => void;
  addMarginNote: (note: Omit<MarginNote, 'id' | 'at'>) => void;
  removeMarginNote: (id: string) => void;
  addLetter: (letter: Omit<Letter, 'id' | 'at'>) => void;
  removeLetter: (id: string) => void;
  markMilestone: (id: MilestoneId) => boolean;

  importMany: (items: Speech[]) => number;
  resetLocal: () => void;
}

const nowIso = () => new Date().toISOString();
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

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
      progress: {},
      history: [],
      shelf: [],
      savedLines: [],
      marginNotes: [],
      letters: [],
      milestones: {
        'first-draft': null,
        'first-rehearsal': null,
        'first-publish': null,
        'first-line': null,
        'first-post': null,
        'first-margin': null,
      },

      createSpeech: (partial) => {
        const id = newId('mine');
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
          createdAt: nowIso().slice(0, 10),
          updatedAt: nowIso(),
          source: 'user',
          status: 'draft',
        };
        set((state) => ({ mine: [speech, ...state.mine] }));
        get().markMilestone('first-draft');
        return id;
      },

      updateSpeech: (id, patch) =>
        set((state) => ({
          mine: state.mine.map((s) => (s.id === id ? { ...s, ...patch, updatedAt: nowIso() } : s)),
        })),

      deleteSpeech: (id) =>
        set((state) => ({
          mine: state.mine.filter((s) => s.id !== id),
          bookmarks: state.bookmarks.filter((b) => b !== id),
          history: state.history.filter((h) => h !== id),
        })),

      duplicateSpeech: (id, source) => {
        const found =
          get().mine.find((s) => s.id === id) ?? source ?? null;
        if (!found) return null;
        const newId = get().createSpeech({ ...found, title: `${found.title} (copy)` });
        get().updateSpeech(newId, { content: found.content, preview: found.preview });
        return newId;
      },

      setStatus: (id, status) => {
        set((state) => ({
          mine: state.mine.map((s) => (s.id === id ? { ...s, status, updatedAt: nowIso() } : s)),
        }));
        if (status === 'published') get().markMilestone('first-publish');
      },

      toggleBookmark: (id) =>
        set((state) => ({
          bookmarks: state.bookmarks.includes(id)
            ? state.bookmarks.filter((b) => b !== id)
            : [id, ...state.bookmarks],
        })),

      setProgress: (id, value) =>
        set((state) => {
          const next = Math.max(0, Math.min(1, value));
          const previous = state.progress[id] ?? 0;
          // Ignore sub-1% changes: progress fires on every scroll event.
          if (Math.abs(previous - next) < 0.01) return state;
          return { progress: { ...state.progress, [id]: next } };
        }),

      pushHistory: (id) =>
        set((state) => ({ history: [id, ...state.history.filter((h) => h !== id)].slice(0, 24) })),

      setHidden: (id, hidden) =>
        set((state) => ({
          hidden: hidden ? [...new Set([...state.hidden, id])] : state.hidden.filter((h) => h !== id),
        })),

      addToShelf: (speech) =>
        set((state) => ({
          shelf: [speech, ...state.shelf.filter((s) => s.id !== speech.id)].slice(0, 120),
        })),

      removeFromShelf: (id) => set((state) => ({ shelf: state.shelf.filter((s) => s.id !== id) })),

      updateShelfItem: (id, patch) =>
        set((state) => ({
          shelf: state.shelf.map((s) => (s.id === id ? { ...s, ...patch } : s)),
        })),

      saveLine: (line) => {
        set((state) => ({
          savedLines: [{ ...line, id: newId('line'), savedAt: nowIso() }, ...state.savedLines].slice(0, 300),
        }));
        get().markMilestone('first-line');
      },

      removeLine: (id) => set((state) => ({ savedLines: state.savedLines.filter((l) => l.id !== id) })),

      addMarginNote: (note) => {
        set((state) => ({
          marginNotes: [{ ...note, id: newId('note'), at: nowIso() }, ...state.marginNotes].slice(0, 300),
        }));
        get().markMilestone('first-margin');
      },

      removeMarginNote: (id) =>
        set((state) => ({ marginNotes: state.marginNotes.filter((n) => n.id !== id) })),

      addLetter: (letter) =>
        set((state) => ({
          letters: [{ ...letter, id: newId('letter'), at: nowIso() }, ...state.letters].slice(0, 100),
        })),

      removeLetter: (id) => set((state) => ({ letters: state.letters.filter((l) => l.id !== id) })),

      markMilestone: (id) => {
        const existing = get().milestones[id];
        if (existing) return false;
        set((state) => ({ milestones: { ...state.milestones, [id]: nowIso() } }));
        return true;
      },

      importMany: (items) => {
        const imported: StoredSpeech[] = items.map((item) => ({
          ...item,
          id: newId(slugify(item.title) || 'imported'),
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
          progress: {},
          history: [],
          shelf: [],
          savedLines: [],
          marginNotes: [],
          letters: [],
          milestones: {
            'first-draft': null,
            'first-rehearsal': null,
            'first-publish': null,
            'first-line': null,
            'first-post': null,
            'first-margin': null,
          },
        }),
    }),
    {
      name: 'pb.library.v2',
      version: 2,
      partialize: (state) => ({
        mine: state.mine,
        hidden: state.hidden,
        bookmarks: state.bookmarks,
        progress: state.progress,
        history: state.history,
        shelf: state.shelf,
        savedLines: state.savedLines,
        marginNotes: state.marginNotes,
        letters: state.letters,
        milestones: state.milestones,
      }),
    },
  ),
);
