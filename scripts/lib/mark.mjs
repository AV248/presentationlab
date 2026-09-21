/**
 * The "The Rise" mark as raw SVG, shared by the icon generator and the
 * share-card generator. Mirrors logoSvgStatic() in src/components/Logo.tsx
 * — keep them in sync if the mark changes.
 *
 * Three steps climbing as one unbroken stroke, with a single point of light
 * above the top step: qualities are not gifted, they are built.
 */

export const HOUSE_BG = '#1d4f45';
export const HOUSE_BG_2 = '#2a6b5c';
export const HOUSE_INK = '#f7f3ec';
export const HOUSE_ACCENT = '#c2703f';

/** The bare mark, 32×32 coordinate space, no tile. */
export const glyph = (scale = 1, dx = 0, dy = 0, ink = HOUSE_INK) => `
  <g transform="translate(${dx} ${dy}) scale(${scale})">
    <path d="M5 25.5 H11.5 V18.5 H18 V11.5 H24.5" fill="none" stroke="${ink}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
    <circle cx="24.5" cy="5" r="2.6" fill="${ink}"/>
  </g>`;

/** Rounded app tile with the mark centred. */
export const logoTileSvg = (size, bg = HOUSE_BG, bg2 = HOUSE_BG_2, ink = HOUSE_INK) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${bg2}"/>
      <stop offset="100%" stop-color="${bg}"/>
    </linearGradient>
  </defs>
  <rect width="32" height="32" rx="8" fill="url(#bg)"/>
  ${glyph(1, 0, 0, ink)}
</svg>`;

/** Maskable icon: same mark, generous safe padding, full-bleed background. */
export const maskableSvg = (size, bg = HOUSE_BG, bg2 = HOUSE_BG_2, ink = HOUSE_INK) => {
  const inner = 0.62;
  const pad = (32 * (1 - inner)) / 2;
  return `<svg width="${size}" height="${size}" viewBox="0 0 32 32" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${bg2}"/>
      <stop offset="100%" stop-color="${bg}"/>
    </linearGradient>
  </defs>
  <rect width="32" height="32" fill="url(#bg)"/>
  ${glyph(inner, pad, pad, ink)}
</svg>`;
};
