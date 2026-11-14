import { create } from 'zustand';
import { useLibrary } from './library';
import {
  ARRIVALS_GOAL,
  fetchArrivals,
  type SourceId,
  type WebSpeech,
} from '../services/webSources';

/**
 * Arrivals are gathered automatically when the page opens. If a source only
 * returns a partial batch, the store quietly tries a different theme before
 * settling; no manual "bring more" action is needed.
 */
export interface ArrivalsState {
  goal: number;
  arrived: WebSpeech[];
  theme: string | null;
  answered: SourceId[];
  unreachable: SourceId[];
  status: 'idle' | 'loading' | 'done' | 'offline';
  runs: number;
  lastError: string | null;
  gather: (goal?: number) => Promise<number>;
  reset: () => void;
}

const MEMORY_KEY = 'pb.arrivals.seen.v1';
interface ArrivalMemory { run: number; ids: string[] }

function readMemory(): ArrivalMemory {
  try {
    const value = JSON.parse(localStorage.getItem(MEMORY_KEY) ?? '{}') as Partial<ArrivalMemory>;
    return {
      run: Number.isFinite(value.run) ? Math.max(0, Math.floor(value.run!)) : 0,
      ids: Array.isArray(value.ids)
        ? value.ids.filter((id): id is string => typeof id === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(id)).slice(-800)
        : [],
    };
  } catch {
    return { run: 0, ids: [] };
  }
}

function remember(ids: string[]): ArrivalMemory {
  const current = readMemory();
  const next = { run: current.run + 1, ids: [...new Set([...current.ids, ...ids])].slice(-800) };
  try { localStorage.setItem(MEMORY_KEY, JSON.stringify(next)); }
  catch { /* storage is a local convenience, never a blocker */ }
  return next;
}

export const useArrivals = create<ArrivalsState>((set, get) => ({
  goal: ARRIVALS_GOAL,
  arrived: [],
  theme: null,
  answered: [],
  unreachable: [],
  status: 'idle',
  runs: 0,
  lastError: null,

  gather: async (goal = ARRIVALS_GOAL) => {
    if (get().status === 'loading') return 0;
    set({ status: 'loading', lastError: null });

    const collected: WebSpeech[] = [];
    const answered = new Set<SourceId>();
    const unreachable = new Set<SourceId>();
    const memory = readMemory();
    const localLibrary = useLibrary.getState();
    const known = new Set([
      ...get().arrived.map((item) => item.id),
      ...localLibrary.history,
      ...localLibrary.shelf.map((item) => item.id),
      ...localLibrary.hidden,
      ...memory.ids,
    ]);
    let nextRun = Math.max(get().runs, memory.run);
    let theme: string | null = null;
    try {
      const target = Math.min(Math.max(Math.floor(goal) || ARRIVALS_GOAL, 1), ARRIVALS_GOAL);

      // One first pass plus two automatic theme top-ups. Stop early if all
      // sources are empty, rather than repeatedly asking them for nothing.
      for (let attempt = 0; attempt < 3 && collected.length < target; attempt += 1) {
        const result = await fetchArrivals(
          [...known, ...collected.map((item) => item.id)],
          target - collected.length,
          nextRun + attempt,
        );
        theme ??= result.theme;
        result.answered.forEach((source) => answered.add(source));
        result.unreachable.forEach((source) => unreachable.add(source));
        const fresh = result.speeches.filter((speech) => !known.has(speech.id) && !collected.some((item) => item.id === speech.id));
        collected.push(...fresh);
        if (!fresh.length) break;
      }

      if (collected.length) nextRun = remember(collected.map((speech) => speech.id)).run;
      set((state) => ({
        arrived: [...collected, ...state.arrived],
        theme,
        answered: [...answered],
        unreachable: [...unreachable],
        runs: nextRun,
        status: collected.length ? 'done' : 'offline',
        lastError: collected.length
          ? null
          : 'No archive returned a new speech just now. Your shelf and built-in library are still here.',
      }));
      return collected.length;
    } catch (error) {
      if (collected.length) nextRun = remember(collected.map((speech) => speech.id)).run;
      set((state) => ({
        arrived: [...collected, ...state.arrived],
        theme: theme ?? state.theme,
        answered: [...new Set([...state.answered, ...answered])],
        unreachable: [...new Set([...state.unreachable, ...unreachable])],
        runs: nextRun,
        status: collected.length ? 'done' : 'offline',
        lastError: collected.length
          ? 'The archives sent a partial batch. The presentations that arrived are ready to read.'
          : (error as Error)?.message ?? 'The archives could not be reached. Everything already saved still works offline.',
      }));
      return collected.length;
    }
  },

  reset: () => {
    try { localStorage.removeItem(MEMORY_KEY); } catch { /* storage is optional */ }
    set({ arrived: [], theme: null, answered: [], unreachable: [], status: 'idle', runs: 0, lastError: null });
  },
}));
