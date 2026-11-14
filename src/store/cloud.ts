import { create } from 'zustand';
import { fetchSpeeches, type CloudSpeech, type CloudStatus } from '../services/data';

interface CloudState {
  status: CloudStatus;
  items: CloudSpeech[];
  error?: string;
  lastSync: number | null;
  loaded: boolean;
  connect: (force?: boolean) => Promise<void>;
}

let started = false;

export const useCloud = create<CloudState>((set, get) => ({
  status: 'connecting',
  items: [],
  lastSync: null,
  loaded: false,

  connect: async (force = false) => {
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
