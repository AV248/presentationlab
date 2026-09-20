/**
 * One-off (but reproducible) regeneration of every shipped icon from the
 * "Voices Rising" mark (see scripts/lib/mark.mjs, the single source).
 *
 *   node scripts/generate-icons.mjs
 */
import { writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import sharp from 'sharp';
import { logoTileSvg, maskableSvg } from './lib/mark.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const pub = resolve(here, '..', 'public');

await mkdir(resolve(pub, 'icons'), { recursive: true });

await writeFile(resolve(pub, 'favicon.svg'), logoTileSvg(48));
await writeFile(resolve(pub, 'icon-maskable.svg'), maskableSvg(512));

const jobs = [
  ['icons/icon-192.png', logoTileSvg(192)],
  ['icons/icon-512.png', logoTileSvg(512)],
  ['icons/apple-touch-icon.png', logoTileSvg(180)],
  ['icons/maskable-512.png', maskableSvg(512)],
];

for (const [name, svg] of jobs) {
  await sharp(Buffer.from(svg), { density: 384 })
    .png()
    .toFile(resolve(pub, name));
  console.log(`wrote public/${name}`);
}
console.log('wrote public/favicon.svg + public/icon-maskable.svg');
