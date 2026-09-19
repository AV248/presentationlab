import { create } from 'zustand';
import type { Speech } from '../data/speeches';
import { CLOUD_ENABLED, CLOUD_PROJECT, fetchCloudSpeeches, type CloudStatus } from '../services/cloud';

interface CloudState {
  status: CloudStatus;
  enabled: boolean;
  project: string | null;
  items: Speech[];
  error?: string;
  lastSync: number | null;
  connect: (force?: boolean) => Promise<void>;
}

let started = false;

export const useCloud = create<CloudState>((set, get) => ({
  status: CLOUD_ENABLED ? 'connecting' : 'off',
  enabled: CLOUD_ENABLED,
  project: CLOUD_PROJECT,
  items: [],
  lastSync: null,

  connect: async (force = false) => {
    if (!CLOUD_ENABLED) {
      set({ status: 'off' });
      return;
    }
    if (started && !force) return;
    started = true;
    set({ status: 'connecting' });
    const result = await fetchCloudSpeeches();
    set({
      status: result.status,
      items: result.items,
      error: result.error,
      lastSync: result.status === 'online' ? Date.now() : get().lastSync,
    });
  },
}));
