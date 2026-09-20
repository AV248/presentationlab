/**
 * The "Voices Rising" mark as raw SVG fragments, shared by the icon
 * generator and the share-card generator. Mirrors logoSvgStatic() in
 * src/components/Logo.tsx — keep them in sync if the mark changes.
 */

export const HOUSE_A1 = '#b0532f';
export const HOUSE_A2 = '#2f5d54';
export const HOUSE_INK = '#fbf7f1';

export const glyph = (scale = 1, dx = 0, dy = 0, ink = HOUSE_INK) => `
  <g transform="translate(${dx} ${dy}) scale(${scale})">
    <rect x="8" y="7.5" width="27" height="21" rx="8.5" fill="none" stroke="${ink}" stroke-width="3" opacity="0.96"/>
    <path d="M14 27.5 L11 35.5 L21.5 28" fill="none" stroke="${ink}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" opacity="0.96"/>
    <rect x="14.4" y="17.5" width="3.4" height="5.5" rx="1.7" fill="${ink}" opacity="0.72"/>
    <rect x="20.3" y="14.5" width="3.4" height="8.5" rx="1.7" fill="${ink}" opacity="0.86"/>
    <rect x="26.2" y="11.5" width="3.4" height="11.5" rx="1.7" fill="${ink}"/>
    <path d="M38.5 6.5 L39.9 10.1 L43.5 11.5 L39.9 12.9 L38.5 16.5 L37.1 12.9 L33.5 11.5 L37.1 10.1 Z" fill="${ink}" opacity="0.95"/>
    <rect x="13" y="37.5" width="17" height="3" rx="1.5" fill="${ink}" opacity="0.28"/>
  </g>`;

export const logoTileSvg = (size, a1 = HOUSE_A1, a2 = HOUSE_A2, ink = HOUSE_INK) => `<svg width="${size}" height="${size}" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${a1}"/>
      <stop offset="100%" stop-color="${a2}"/>
    </linearGradient>
    <linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.34"/>
      <stop offset="55%" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect x="1.5" y="1.5" width="45" height="45" rx="13" fill="url(#bg)"/>
  <rect x="1.5" y="1.5" width="45" height="45" rx="13" fill="url(#sheen)"/>
  ${glyph(1, 0, 0, ink)}
</svg>`;

export const maskableSvg = (size, a1 = HOUSE_A1, a2 = HOUSE_A2, ink = HOUSE_INK) => {
  const inner = 0.62;
  const pad = (48 * (1 - inner)) / 2;
  return `<svg width="${size}" height="${size}" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${a1}"/>
      <stop offset="100%" stop-color="${a2}"/>
    </linearGradient>
  </defs>
  <rect width="48" height="48" fill="url(#bg)"/>
  ${glyph(inner, pad, pad, ink)}
</svg>`;
};
