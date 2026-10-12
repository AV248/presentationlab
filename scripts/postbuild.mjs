/**
 * Post-build pipeline (runs after `vite build`):
 *   bundle → 32 share cards → 57 prerendered pages → a 56-URL sitemap
 *   → robots.txt
 */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

const steps = [
  ['share cards', 'cards/run.mjs'],
  ['prerendered pages', 'prerender/run.mjs'],
  ['sitemap', 'sitemap/run.mjs'],
  // After the sitemap so both files always name the same origin.
  ['robots.txt', 'robots/run.mjs'],
];

for (const [label, script] of steps) {
  console.log(`\n── ${label} ${'─'.repeat(Math.max(2, 40 - label.length))}`);
  const result = spawnSync(process.execPath, [resolve(here, script)], { stdio: 'inherit' });
  if (result.status !== 0) {
    console.error(`\nPost-build failed at: ${label}`);
    process.exit(result.status ?? 1);
  }
}

console.log('\nPost-build complete: cards, prerendered pages, sitemap and robots.txt are in dist/.');
