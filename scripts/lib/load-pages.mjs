/**
 * Shared helper for the build scripts: bundles src/data/routes.ts (TypeScript,
 * with its library + topics data) into a temporary node module and returns the
 * page registry. One source of truth for cards, prerender and sitemap.
 */
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export async function loadPageRegistry(rootDir) {
  const dir = await mkdtemp(join(tmpdir(), 'pb-pages-'));
  const outfile = join(dir, 'routes.mjs');
  try {
    await build({
      entryPoints: [join(rootDir, 'src/data/routes.ts')],
      bundle: true,
      format: 'esm',
      platform: 'node',
      target: 'node20',
      jsx: 'automatic',
      outfile,
      logLevel: 'error',
    });
    const mod = await import(pathToFileURL(outfile).href);
    return mod;
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
