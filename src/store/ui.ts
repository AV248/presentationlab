import { create } from 'zustand';

export type ToastTone = 'info' | 'success' | 'warn' | 'error';

export interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

interface UiState {
  paletteOpen: boolean;
  themePanelOpen: boolean;
  drawerOpen: boolean;
  helpOpen: boolean;
  toasts: Toast[];
  openPalette: () => void;
  closePalette: () => void;
  togglePalette: () => void;
  setThemePanel: (open: boolean) => void;
  setDrawer: (open: boolean) => void;
  setHelp: (open: boolean) => void;
  toast: (message: string, tone?: ToastTone) => void;
  dismiss: (id: number) => void;
}

let counter = 0;

export const useUi = create<UiState>((set) => ({
  paletteOpen: false,
  themePanelOpen: false,
  drawerOpen: false,
  helpOpen: false,
  toasts: [],

  openPalette: () => set({ paletteOpen: true }),
  closePalette: () => set({ paletteOpen: false }),
  togglePalette: () => set((s) => ({ paletteOpen: !s.paletteOpen })),
  setThemePanel: (themePanelOpen) => set({ themePanelOpen }),
  setDrawer: (drawerOpen) => set({ drawerOpen }),
  setHelp: (helpOpen) => set({ helpOpen }),

  toast: (message, tone = 'info') => {
    counter += 1;
    const id = counter;
    set((s) => ({ toasts: [...s.toasts, { id, message, tone }].slice(-4) }));
    window.setTimeout(() => {
      set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
    }, 3600);
  },

  dismiss: (id) => set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) })),
}));
