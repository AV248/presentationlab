/**
 * Share cards — generates the 1200×630 social images every prerendered
 * page points at with og:image / twitter:image, rasterised from SVG with
 * the "Voices Rising" mark, a per-card palette, and the page's own title.
 *
 *   node scripts/cards/run.mjs     (after `vite build`; writes dist/cards/)
 */
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import sharp from 'sharp';
import { loadPageRegistry } from '../lib/load-pages.mjs';
import { glyph } from '../lib/mark.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const outDir = resolve(root, 'dist', 'cards');

/* handsome duos, one per card, cycled deterministically */
const DUOS = [
  ['#b0532f', '#2f5d54'], // house: terracotta & pine
  ['#2e6e4e', '#ad4a34'], // jade & rust
  ['#3d5682', '#c13a5e'], // indigo & crimson
  ['#14324a', '#f2b05e'], // deep sea & beacon
  ['#241d45', '#86e0b6'], // aurora & mint
  ['#4a2c3f', '#d8a24a'], // plum & gold
  ['#22351f', '#e6c9a0'], // forest & cream
  ['#7a2d1a', '#eadfce'], // brick & sand
];

const hash = (value) => {
  let out = 0;
  for (let i = 0; i < value.length; i += 1) out = (out * 31 + value.charCodeAt(i)) >>> 0;
  return out;
};

const escXml = (value) =>
  String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** naive word-wrap into at most `maxLines` lines of `maxChars` */
function wrap(text, maxChars, maxLines) {
  const words = String(text).split(/\s+/);
  const lines = [''];
  for (const word of words) {
    const current = lines[lines.length - 1];
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && lines.length < maxLines) lines.push(word);
    else if (next.length > maxChars) {
      lines[lines.length - 1] = `${current.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
      break;
    } else lines[lines.length - 1] = next;
  }
  return lines;
}

const KICKERS = {
  home: 'PRESENTATION BUDDY',
  section: 'PRESENTATION BUDDY',
  topics: 'SPEAKING GUIDES',
  topic: 'SPEAKING GUIDE',
  read: 'FROM THE LIBRARY',
};

function cardSvg(page, duo) {
  const [a1, a2] = duo;
  const kicker = KICKERS[page.group] ?? 'PRESENTATION BUDDY';
  const title = page.title.replace(/ · Presentation Buddy$/, '');
  const titleLines = wrap(title, 30, 2);
  const descLines = wrap(page.description, 78, 2);
  const titleY = 262;
  const descY = titleY + titleLines.length * 68 + 18;
  const pathLabel = page.path === '/' ? '' : page.path;
  const url = `presentationbuddy.aavrit.dedyn.io${pathLabel}`;

  return `<svg width="1200" height="630" viewBox="0 0 1200 630" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${a1}"/>
      <stop offset="100%" stop-color="${a2}"/>
    </linearGradient>
    <radialGradient id="glowl" cx="0.12" cy="0" r="0.9">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.16"/>
      <stop offset="60%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
    <linearGradient id="sheen" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.13"/>
      <stop offset="55%" stop-color="#ffffff" stop-opacity="0"/>
    </linearGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#bg)"/>
  <rect width="1200" height="630" fill="url(#glowl)"/>
  <rect x="28" y="28" width="1144" height="574" rx="26" fill="none" stroke="#fbf7f1" stroke-opacity="0.35" stroke-width="2"/>
  <g transform="translate(84,72)">${glyph(1.5)}</g>
  <text x="196" y="122" font-family="'Work Sans','DejaVu Sans',sans-serif" font-weight="600" font-size="27" letter-spacing="7" fill="#fbf7f1" fill-opacity="0.82">${escXml(kicker)}</text>
  <rect x="196" y="140" width="54" height="4" rx="2" fill="#fbf7f1" fill-opacity="0.6"/>
  ${titleLines
    .map(
      (line, i) =>
        `<text x="84" y="${titleY + i * 68}" font-family="'DM Serif Display',Georgia,'DejaVu Serif',serif" font-size="56" fill="#fbf7f1">${escXml(line)}</text>`,
    )
    .join('\n  ')}
  ${descLines
    .map(
      (line, i) =>
        `<text x="84" y="${descY + i * 38}" font-family="'Work Sans','DejaVu Sans',sans-serif" font-size="25" fill="#fbf7f1" fill-opacity="0.9">${escXml(line)}</text>`,
    )
    .join('\n  ')}
  <text x="84" y="566" font-family="'JetBrains Mono','DejaVu Sans Mono',monospace" font-size="23" fill="#fbf7f1" fill-opacity="0.75">${escXml(url)}</text>
</svg>`;
}

const { buildCardPages } = await loadPageRegistry(root);
const pages = buildCardPages();

if (pages.length !== 32) {
  console.error(`Expected 32 share cards, registry returned ${pages.length}.`);
  process.exit(1);
}

await mkdir(outDir, { recursive: true });
let written = 0;
for (const page of pages) {
  const duo = DUOS[hash(page.card) % DUOS.length];
  await sharp(Buffer.from(cardSvg(page, duo)), { density: 96 })
    .png({ compressionLevel: 9 })
    .toFile(resolve(outDir, `${page.card}.png`));
  written += 1;
}

console.log(`${written} share cards written to dist/cards/`);
