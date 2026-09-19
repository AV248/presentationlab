import type { AxisId, ThemeSelection } from './types';
import { COLOR_THEMES } from './colorThemes';
import { MOTION_THEMES } from './motionThemes';
import { LAYOUT_THEMES } from './layoutThemes';
import { UI_THEMES } from './uiThemes';
import { UX_THEMES } from './uxThemes';
import { PRESETS } from './presets';

export * from './types';
export { COLOR_THEMES, MOTION_THEMES, LAYOUT_THEMES, UI_THEMES, UX_THEMES, PRESETS };
export {
  compileTheme,
  applyThemeVars,
  AXIS_DEFAULTS,
  colorById,
  motionById,
  layoutById,
  uiById,
  uxById,
} from './compile';

export interface AxisMeta<T> {
  id: AxisId;
  label: string;
  blurb: string;
  options: T[];
}

export const AXES: AxisMeta<{ id: string; name: string; note: string }>[] = [
  {
    id: 'color',
    label: 'Paper & Ink',
    blurb: 'The stock everything is printed on, and the ink used to print it.',
    options: COLOR_THEMES,
  },
  {
    id: 'motion',
    label: 'Movement',
    blurb: 'How things arrive and settle: entrance, easing, timing and ambient life.',
    options: MOTION_THEMES,
  },
  {
    id: 'layout',
    label: 'Arrangement',
    blurb: 'How the shelf is arranged — reading room, card catalogue, broadside…',
    options: LAYOUT_THEMES,
  },
  {
    id: 'ui',
    label: 'Material',
    blurb: 'What the pages are made of: paper, letterpress, linen, slate, tape…',
    options: UI_THEMES,
  },
  {
    id: 'ux',
    label: 'Typography',
    blurb: 'Type pairing, scale, measure, leading and paragraph rhythm.',
    options: UX_THEMES,
  },
];

export const AXIS_TOTAL = AXES.reduce((sum, axis) => sum + axis.options.length, 0);

export const COMBINATIONS = AXES.reduce((product, axis) => product * axis.options.length, 1);

export function optionsFor(axis: AxisId) {
  return AXES.find((a) => a.id === axis)?.options ?? [];
}

/** Deterministic-ish shuffle used by the "surprise me" button. */
export function randomSelection(): ThemeSelection {
  const pick = <T extends { id: string }>(list: T[]) => list[Math.floor(Math.random() * list.length)];
  return {
    color: pick(COLOR_THEMES).id,
    motion: pick(MOTION_THEMES).id,
    layout: pick(LAYOUT_THEMES).id,
    ui: pick(UI_THEMES).id,
    ux: pick(UX_THEMES).id,
  };
}

export function presetById(id: string) {
  return PRESETS.find((p) => p.id === id);
}
