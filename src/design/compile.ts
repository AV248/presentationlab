import type { ThemeSelection } from './types';
import { COLOR_THEMES, DEFAULT_COLOR } from './colorThemes';
import { MOTION_THEMES, DEFAULT_MOTION } from './motionThemes';
import { LAYOUT_THEMES, DEFAULT_LAYOUT } from './layoutThemes';
import { UI_THEMES, DEFAULT_UI } from './uiThemes';
import { UX_THEMES, DEFAULT_UX } from './uxThemes';

export const AXIS_DEFAULTS: ThemeSelection = {
  color: DEFAULT_COLOR,
  motion: DEFAULT_MOTION,
  layout: DEFAULT_LAYOUT,
  ui: DEFAULT_UI,
  ux: DEFAULT_UX,
};

export const colorById = (id: string) =>
  COLOR_THEMES.find((t) => t.id === id) ?? COLOR_THEMES[0];
export const motionById = (id: string) =>
  MOTION_THEMES.find((t) => t.id === id) ?? MOTION_THEMES[0];
export const layoutById = (id: string) =>
  LAYOUT_THEMES.find((t) => t.id === id) ?? LAYOUT_THEMES[0];
export const uiById = (id: string) => UI_THEMES.find((t) => t.id === id) ?? UI_THEMES[0];
export const uxById = (id: string) => UX_THEMES.find((t) => t.id === id) ?? UX_THEMES[0];

/* ------------------------------------------------------------------ */
/* colour helpers                                                       */
/* ------------------------------------------------------------------ */

function hexToRgb(hex: string): [number, number, number] {
  let h = hex.trim().replace('#', '');
  if (h.length === 3) h = h.split('').map((ch) => ch + ch).join('');
  const int = parseInt(h.slice(0, 6), 16);
  if (Number.isNaN(int)) return [0, 0, 0];
  return [(int >> 16) & 255, (int >> 8) & 255, int & 255];
}

function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function lighten(hex: string, amount: number): string {
  const [r, g, b] = hexToRgb(hex);
  const f = (v: number) => Math.round(v + (255 - v) * amount);
  return `rgb(${f(r)}, ${f(g)}, ${f(b)})`;
}

/** Multiply a duration string ("280ms") by a speed factor. */
function scaleDuration(value: string, speed: number): string {
  const match = /^([\d.]+)(ms|s)$/.exec(value.trim());
  if (!match) return value;
  const num = parseFloat(match[1]);
  const unit = match[2];
  const scaled = Math.max(0, num * speed);
  if (scaled === 0) return '1ms';
  return `${Math.round(unit === 's' ? scaled * 1000 : scaled)}ms`;
}

const px = (value: string) => parseFloat(value) || 0;

/* ------------------------------------------------------------------ */
/* compiler                                                             */
/* ------------------------------------------------------------------ */

export interface CompileOptions {
  /** Force motion to the "still" profile (system reduced-motion). */
  reducedMotion?: boolean;
}

/**
 * Turns a five-axis selection into a flat map of CSS custom properties.
 * This is the single source of truth for how the app looks — components
 * never hard-code a colour, duration or radius.
 */
export function compileTheme(
  selection: ThemeSelection,
  options: CompileOptions = {},
): Record<string, string> {
  const color = colorById(selection.color);
  const motionTheme = motionById(selection.motion);
  const layout = layoutById(selection.layout);
  const ui = uiById(selection.ui);
  const ux = uxById(selection.ux);

  const frozen = options.reducedMotion === true || motionTheme.speed === 0;
  const motion = frozen ? { ...motionTheme, ...MOTION_THEMES[0], speed: 0 } : motionTheme;
  const speed = frozen ? 0 : motionTheme.speed;

  const p = color.palette;
  const dark = color.scheme === 'dark';

  const vars: Record<string, string> = {
    /* ---- data hooks (used by CSS special-cases) ---- */
    '--pb-scheme': color.scheme,
    '--pb-layout-mode': layout.mode,
    '--pb-ui-style': ui.style,
    '--pb-ambient': motion.ambient,

    /* ---- surfaces ---- */
    '--c-canvas': p.bg,
    '--c-canvas-alt': p.bgAlt,
    '--c-surface': ui.alpha >= 1 ? p.panel : rgba(p.panel, ui.alpha),
    '--c-surface-solid': p.panel,
    '--c-surface-2': ui.alpha >= 1 ? p.panel2 : rgba(p.panel2, ui.alpha),
    '--c-surface-3': ui.alpha >= 1 ? p.panel3 : rgba(p.panel3, ui.alpha),
    '--c-line': rgba(p.line, Math.min(1, ui.lineAlpha + 0.25)),
    '--c-line-soft': rgba(p.line, Math.max(0.15, ui.lineAlpha * 0.6)),
    '--c-line-strong': rgba(p.lineStrong, Math.min(1, ui.lineAlpha + 0.25)),

    /* ---- ink ---- */
    '--c-ink': p.ink,
    '--c-ink-soft': p.inkSoft,
    '--c-ink-muted': p.inkMuted,
    '--c-ink-invert': p.inkInvert,

    /* ---- accent family ---- */
    '--c-accent': p.accent,
    '--c-accent-2': p.accent2,
    '--c-accent-3': p.accent3,
    '--c-accent-ink': p.inkInvert,
    '--c-accent-soft': rgba(p.accent, dark ? 0.16 : 0.12),
    '--c-accent-softer': rgba(p.accent, dark ? 0.08 : 0.06),
    '--c-accent-line': rgba(p.accent, dark ? 0.45 : 0.4),

    /* ---- semantic ---- */
    '--c-ok': p.ok ?? '#22c55e',
    '--c-warn': p.warn ?? '#f59e0b',
    '--c-bad': p.bad ?? '#ef4444',
    '--c-info': p.info ?? p.accent2,
    '--c-ok-soft': rgba(p.ok ?? '#22c55e', 0.16),
    '--c-warn-soft': rgba(p.warn ?? '#f59e0b', 0.16),
    '--c-bad-soft': rgba(p.bad ?? '#ef4444', 0.16),
    '--c-info-soft': rgba(p.info ?? p.accent2, 0.16),

    /* ---- light & shadow ---- */
    '--c-glow': rgba(p.glow ?? p.accent, dark ? 0.35 : 0.28),
    '--c-glow-strong': rgba(p.glow ?? p.accent, dark ? 0.55 : 0.42),
    '--c-shadow': dark ? 'rgba(0,0,0,0.55)' : 'rgba(15,23,42,0.16)',
    '--c-shadow-strong': dark ? 'rgba(0,0,0,0.72)' : 'rgba(15,23,42,0.28)',
    '--c-scrim': dark ? 'rgba(0,0,0,0.62)' : 'rgba(15,23,42,0.42)',

    /* ---- gradients ---- */
    '--grad-brand': `linear-gradient(135deg, ${p.accent} 0%, ${p.accent2} 100%)`,
    '--grad-brand-soft': `linear-gradient(135deg, ${rgba(p.accent, dark ? 0.22 : 0.16)} 0%, ${rgba(
      p.accent2,
      dark ? 0.18 : 0.12,
    )} 100%)`,
    '--grad-page': `radial-gradient(1100px 620px at 12% -8%, ${rgba(
      p.accent,
      dark ? 0.16 : 0.1,
    )}, transparent 62%), radial-gradient(900px 520px at 92% 6%, ${rgba(
      p.accent2,
      dark ? 0.14 : 0.09,
    )}, transparent 60%), radial-gradient(800px 600px at 50% 108%, ${rgba(
      p.accent3,
      dark ? 0.1 : 0.07,
    )}, transparent 62%)`,
    '--grad-sheen': ui.sheen,
    '--c-highlight': dark ? 'rgba(255,255,255,0.08)' : 'rgba(255,255,255,0.72)',

    /* ---- motion ---- */
    '--m-enter': motion.enter,
    '--m-ease': motion.ease,
    '--m-ease-spring': motion.easeSpring,
    '--m-fast': scaleDuration(motion.fast, speed),
    '--m-base': scaleDuration(motion.base, speed),
    '--m-slow': scaleDuration(motion.slow, speed),
    '--m-stagger': `${frozen ? 0 : motion.stagger}ms`,
    '--m-lift': frozen ? '0px' : motion.lift,
    '--m-scale': frozen ? '1' : motion.scale,
    '--m-blur': frozen ? '0px' : motion.blur,
    '--m-ambient-speed': motion.ambientSpeed,

    /* ---- layout ---- */
    '--l-container': layout.container,
    '--l-gap': layout.gap,
    '--l-card-min': layout.cardMin,
    '--l-card-pad': layout.cardPad,
    '--l-sidebar': layout.sidebar,
    '--l-measure': `${ux.measure}ch`,
    '--l-rhythm': layout.rhythm,

    /* ---- interface chrome ---- */
    '--u-radius': `${Math.round(px(layout.radius) * ui.radiusScale * ux.radiusScale)}px`,
    '--u-radius-sm': `${Math.max(2, Math.round(px(layout.radius) * ui.radiusScale * ux.radiusScale * 0.6))}px`,
    '--u-radius-lg': `${Math.round(px(layout.radius) * ui.radiusScale * ux.radiusScale * 1.5)}px`,
    '--u-radius-pill': '999px',
    '--u-border': ui.border,
    '--u-shadow': ui.shadow,
    '--u-shadow-hover': ui.shadowHover,
    '--u-blur': ui.blur,
    '--u-lift': frozen ? '0px' : ui.lift,

    /* ---- typography / reading ---- */
    '--x-font-body': ux.fontBody,
    '--x-font-display': ux.fontDisplay,
    '--x-font-mono': ux.fontMono,
    '--x-scale': String(ux.scale),
    '--x-tracking': ux.tracking,
    '--x-leading': String(ux.leading),
    '--x-weight-body': String(ux.weightBody),
    '--x-weight-display': String(ux.weightDisplay),
    '--x-para': ux.para,
    '--x-caps': ux.caps ? 'uppercase' : 'none',
    '--x-caps-space': ux.caps ? '0.06em' : '0em',
    '--x-focus': ux.focus,

    /* ---- tuned derived helpers ---- */
    '--c-ring': rgba(p.accent, 0.55),
    '--c-hover': dark ? lighten(p.panel, 0.05) : p.panel2,
  };

  return vars;
}

/** Applies the compiled map to an element (defaults to <html>). */
export function applyThemeVars(
  selection: ThemeSelection,
  options: CompileOptions = {},
  target: HTMLElement = document.documentElement,
) {
  const vars = compileTheme(selection, options);
  for (const [key, value] of Object.entries(vars)) target.style.setProperty(key, value);

  const color = colorById(selection.color);
  const layout = layoutById(selection.layout);
  const ui = uiById(selection.ui);
  const motion = motionById(selection.motion);
  const frozen = options.reducedMotion === true || motion.speed === 0;

  target.dataset.color = selection.color;
  target.dataset.motion = selection.motion;
  target.dataset.layout = selection.layout;
  target.dataset.ui = selection.ui;
  target.dataset.ux = selection.ux;
  target.dataset.scheme = color.scheme;
  target.dataset.frozen = frozen ? 'true' : 'false';
  target.style.setProperty('color-scheme', color.scheme);
  target.style.colorScheme = color.scheme;
  // Layout + UI modes that need bespoke CSS rules get an attribute hook.
  target.dataset.layoutMode = layout.mode;
  target.dataset.uiStyle = ui.style;

  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', color.palette.bg);
}
