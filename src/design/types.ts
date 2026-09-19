/**
 * Presentation Buddy — design system contracts.
 *
 * The whole app is themed from five independent axes. Every axis ships 20+
 * hand-tuned options, and any combination is valid, which is what makes the
 * theme studio feel endless instead of a four-way switch.
 */

export type AxisId = 'color' | 'motion' | 'layout' | 'ui' | 'ux';

export type Scheme = 'light' | 'dark';

/** Raw palette handed to the theme compiler. Everything else is derived. */
export interface PaletteSpec {
  bg: string;
  bgAlt: string;
  /** Primary panel / card surface. */
  panel: string;
  /** Hovered or nested surface. */
  panel2: string;
  /** Sunken surface (inputs, wells, tracks). */
  panel3: string;
  line: string;
  lineStrong: string;
  ink: string;
  inkSoft: string;
  inkMuted: string;
  /** Text that sits on top of accent fills. */
  inkInvert: string;
  accent: string;
  accent2: string;
  accent3: string;
  /** Optional overrides, otherwise derived from the palette hue. */
  ok?: string;
  warn?: string;
  bad?: string;
  info?: string;
  /** Ambient glow colour used by shadows + focus rings. */
  glow?: string;
}

export interface ColorTheme {
  id: string;
  name: string;
  note: string;
  scheme: Scheme;
  /** Shown in the theme studio swatch strip. */
  swatch: [string, string, string];
  palette: PaletteSpec;
}

export type AmbientMotion = 'none' | 'float' | 'pulse' | 'orbit' | 'drift' | 'shimmer';

export interface MotionTheme {
  id: string;
  name: string;
  note: string;
  /** Keyframe used for element entrance. */
  enter: string;
  ease: string;
  easeSpring: string;
  fast: string;
  base: string;
  slow: string;
  /** Milliseconds of delay added per item in a staggered list. */
  stagger: number;
  /** px lift applied on hover. */
  lift: string;
  scale: string;
  /** Extra blur (px) used by entrance animation, 0 for crisp. */
  blur: string;
  ambient: AmbientMotion;
  ambientSpeed: string;
  /** Extra multiplier applied to every duration (0 = frozen). */
  speed: number;
}

export type LayoutMode =
  | 'grid'
  | 'bento'
  | 'masonry'
  | 'timeline'
  | 'spotlight'
  | 'gallery'
  | 'list'
  | 'split'
  | 'editorial'
  | 'carousel'
  | 'zen'
  | 'dashboard'
  | 'dossier'
  | 'newsprint'
  | 'showcase'
  | 'ribbon'
  | 'table'
  | 'constellation'
  | 'theatre'
  | 'focus'
  | 'stack'
  | 'ledger';

export interface LayoutTheme {
  id: string;
  name: string;
  note: string;
  mode: LayoutMode;
  /** Max width of the page container. */
  container: string;
  /** Gap between cards. */
  gap: string;
  /** Card corner radius. */
  radius: string;
  /** Minimum card width before the grid reflows. */
  cardMin: string;
  /** Inner card padding. */
  cardPad: string;
  /** Sidebar width (desktop). */
  sidebar: string;
  /** Reading column measure. */
  measure: string;
  /** Vertical rhythm between blocks. */
  rhythm: string;
}

export type UiStyle =
  | 'paper'
  | 'letterpress'
  | 'cardstock'
  | 'vellum'
  | 'newsprint'
  | 'linen'
  | 'ink-wash'
  | 'chalk'
  | 'carbon'
  | 'risograph'
  | 'woodblock'
  | 'etched-glass'
  | 'blueprint'
  | 'stamp'
  | 'index-card'
  | 'pinned-note'
  | 'cloth-bound'
  | 'ruled-paper'
  | 'stone'
  | 'foil'
  | 'tape'
  | 'bare';

export interface UiTheme {
  id: string;
  name: string;
  note: string;
  style: UiStyle;
  radius: string;
  border: string;
  shadow: string;
  shadowHover: string;
  blur: string;
  /** 0–1 alpha applied to panel backgrounds (glass-style themes). */
  alpha: number;
  /** Border colour opacity booster. */
  lineAlpha: number;
  sheen: string;
  lift: string;
  /** Multiplier that scales the layout radius so combos stay coherent. */
  radiusScale: number;
}

export interface UxTheme {
  id: string;
  name: string;
  note: string;
  fontBody: string;
  fontDisplay: string;
  fontMono: string;
  /** Global type scale multiplier. */
  scale: number;
  tracking: string;
  leading: number;
  weightBody: number;
  weightDisplay: number;
  /** Reading column width in ch. */
  measure: number;
  para: string;
  radiusScale: number;
  /** Uppercase display headings? */
  caps: boolean;
  focus: string;
}

export interface ThemePreset {
  id: string;
  name: string;
  note: string;
  color: string;
  motion: string;
  layout: string;
  ui: string;
  ux: string;
}

export interface ThemeSelection {
  color: string;
  motion: string;
  layout: string;
  ui: string;
  ux: string;
}
