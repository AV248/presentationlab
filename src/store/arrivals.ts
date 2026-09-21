import { create } from 'zustand';
import {
  ARRIVALS_GOAL,
  fetchArrivals,
  type SourceId,
  type WebSpeech,
} from '../services/webSources';

/**
 * The session goal.
 *
 * Every session, Presentation Buddy tries to bring five new speeches in
 * from the open archives. This store owns that goal: how many have landed,
 * which archives answered, and whether the run is still going. It is
 * deliberately session-scoped and not persisted — a new visit is a new
 * five.
 */

export interface ArrivalsState {
  goal: number;
  /** The speeches that landed this session, newest first. */
  arrived: WebSpeech[];
  /** Theme the current batch was gathered under. */
  theme: string | null;
  answered: SourceId[];
  unreachable: SourceId[];
  status: 'idle' | 'loading' | 'done' | 'offline';
  /** How many top-up runs have happened, used to vary the next theme. */
  runs: number;
  lastError: string | null;

  /** Fetch the next batch. Resolves with how many genuinely new items landed. */
  gather: (goal?: number) => Promise<number>;
  reset: () => void;
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

    try {
      const known = get().arrived.map((item) => item.id);
      const { speeches, theme, answered, unreachable } = await fetchArrivals(
        known,
        goal,
        get().runs,
      );

      set((state) => ({
        arrived: [...speeches, ...state.arrived],
        theme,
        answered,
        unreachable,
        runs: state.runs + 1,
        status: speeches.length ? 'done' : 'offline',
        lastError: speeches.length
          ? null
          : 'No archive answered just now. Your shelf and the built-in library are still here.',
      }));

      return speeches.length;
    } catch (error) {
      set({
        status: 'offline',
        lastError:
          (error as Error)?.message ??
          'The archives could not be reached. Everything already saved still works offline.',
      });
      return 0;
    }
  },

  reset: () =>
    set({
      arrived: [],
      theme: null,
      answered: [],
      unreachable: [],
      status: 'idle',
      runs: 0,
      lastError: null,
    }),
}));
