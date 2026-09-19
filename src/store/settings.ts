import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { ThemePreset, ThemeSelection } from '../design/types';
import { AXIS_DEFAULTS } from '../design/compile';
import { randomSelection } from '../design/index';

export type ReducedMotionPref = 'auto' | 'on' | 'off';
export type ContrastBoost = 'off' | 'medium' | 'high';

export interface ReaderPrefs {
  /** Multiplier on top of the active typography theme. */
  scale: number;
  /** Reading column width in ch. */
  measure: number;
  lineHeight: number;
  focusMode: boolean;
  /** Highlight the sentence/paragraph under the cursor. */
  readingRuler: boolean;
}

export interface PracticePrefs {
  wpm: number;
  fontScale: number;
  mirror: boolean;
  /** Show the pacing cue line in the teleprompter. */
  cueLine: boolean;
  countdown: number;
}

export interface SettingsState {
  theme: ThemeSelection;
  presetId: string | null;
  reducedMotion: ReducedMotionPref;
  contrast: ContrastBoost;
  /** Dim ambient background art for battery / focus. */
  ambient: boolean;
  reader: ReaderPrefs;
  practice: PracticePrefs;
  onboarded: boolean;
  showShortcuts: boolean;
  lastSpeechId: string | null;
  customPresets: ThemePreset[];

  setAxis: (axis: keyof ThemeSelection, value: string) => void;
  setTheme: (theme: ThemeSelection, presetId?: string | null) => void;
  randomizeTheme: () => void;
  resetTheme: () => void;
  setReducedMotion: (value: ReducedMotionPref) => void;
  setContrast: (value: ContrastBoost) => void;
  toggleAmbient: () => void;
  patchReader: (patch: Partial<ReaderPrefs>) => void;
  patchPractice: (patch: Partial<PracticePrefs>) => void;
  savePreset: (name: string, note?: string) => void;
  deletePreset: (id: string) => void;
  setOnboarded: (value: boolean) => void;
  setShowShortcuts: (value: boolean) => void;
  setLastSpeech: (id: string) => void;
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      theme: { ...AXIS_DEFAULTS },
      presetId: 'opening-page',
      reducedMotion: 'auto',
      contrast: 'off',
      ambient: true,
      reader: {
        scale: 1,
        measure: 66,
        lineHeight: 1.75,
        focusMode: false,
        readingRuler: false,
      },
      practice: { wpm: 130, fontScale: 1, mirror: false, cueLine: true, countdown: 3 },
      onboarded: false,
      showShortcuts: false,
      lastSpeechId: null,
      customPresets: [],

      setAxis: (axis, value) =>
        set((state) => ({ theme: { ...state.theme, [axis]: value }, presetId: null })),
      setTheme: (theme, presetId = null) => set({ theme, presetId }),
      randomizeTheme: () => set({ theme: randomSelection(), presetId: null }),
      resetTheme: () => set({ theme: { ...AXIS_DEFAULTS }, presetId: null }),
      setReducedMotion: (reducedMotion) => set({ reducedMotion }),
      setContrast: (contrast) => set({ contrast }),
      toggleAmbient: () => set((s) => ({ ambient: !s.ambient })),
      patchReader: (patch) => set((s) => ({ reader: { ...s.reader, ...patch } })),
      patchPractice: (patch) => set((s) => ({ practice: { ...s.practice, ...patch } })),
      savePreset: (name, note = 'Your saved combination') =>
        set((state) => ({
          customPresets: [
            {
              id: `custom-${Date.now().toString(36)}`,
              name: name.trim() || 'Untitled preset',
              note,
              ...state.theme,
            },
            ...state.customPresets,
          ].slice(0, 40),
        })),
      deletePreset: (id) =>
        set((state) => ({ customPresets: state.customPresets.filter((p) => p.id !== id) })),
      setOnboarded: (onboarded) => set({ onboarded }),
      setShowShortcuts: (showShortcuts) => set({ showShortcuts }),
      setLastSpeech: (lastSpeechId) => set({ lastSpeechId }),
    }),
    {
      name: 'pb.settings.v1',
      version: 1,
      partialize: (state) => ({
        theme: state.theme,
        presetId: state.presetId,
        reducedMotion: state.reducedMotion,
        contrast: state.contrast,
        ambient: state.ambient,
        reader: state.reader,
        practice: state.practice,
        onboarded: state.onboarded,
        lastSpeechId: state.lastSpeechId,
        customPresets: state.customPresets,
      }),
    },
  ),
);
