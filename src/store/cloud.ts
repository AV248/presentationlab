import { create } from 'zustand';
import { fetchSpeeches, type CloudSpeech, type CloudStatus } from '../services/data';
import { FIREBASE_ENABLED, FIREBASE_PROJECT } from '../services/firebase';

interface CloudState {
  status: CloudStatus;
  enabled: boolean;
  project: string | null;
  items: CloudSpeech[];
  error?: string;
  lastSync: number | null;
  loaded: boolean;
  connect: (force?: boolean) => Promise<void>;
}

let started = false;

export const useCloud = create<CloudState>((set, get) => ({
  status: FIREBASE_ENABLED ? 'connecting' : 'off',
  enabled: FIREBASE_ENABLED,
  project: FIREBASE_PROJECT,
  items: [],
  lastSync: null,
  loaded: false,

  connect: async (force = false) => {
    if (!FIREBASE_ENABLED) {
      set({ status: 'off', loaded: true });
      return;
    }
    if (started && !force) return;
    started = true;
    set({ status: 'connecting' });
    const result = await fetchSpeeches();
    set({
      status: result.status,
      items: result.items,
      error: result.error,
      loaded: true,
      lastSync: result.status === 'online' ? Date.now() : get().lastSync,
    });
  },
}));
