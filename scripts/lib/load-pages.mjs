/**
 * Shared helper for the build scripts: bundles TypeScript out of src/ into a
 * temporary node module and returns it. One source of truth for cards,
 * prerender, sitemap and robots.
 */
import { build } from 'esbuild';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

/**
 * Nothing to substitute any more.
 *
 * 2.x had to rewrite `import.meta.env.VITE_SITE_URL` at bundle time here,
 * because that expression only exists inside Vite. The app reads
 * `process.env.VITE_SITE_URL` now — a plain node read — so a script bundles
 * `src/` and gets the same value the deployment gets, with no shim in between.
 */

async function bundleModule(rootDir, entry, name) {
  const dir = await mkdtemp(join(tmpdir(), `pb-${name}-`));
  const outfile = join(dir, `${name}.mjs`);
  try {
    await build({
      entryPoints: [join(rootDir, entry)],
      bundle: true,
      format: 'esm',
      platform: 'node',
      target: 'node20',
      jsx: 'automatic',
      outfile,
      logLevel: 'error',
    });
    return await import(pathToFileURL(outfile).href);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

/** The public route registry: cards + prerender + sitemap. */
export async function loadPageRegistry(rootDir) {
  return bundleModule(rootDir, 'src/data/routes.ts', 'routes');
}

/** Site-wide SEO constants — notably SITE_URL, used by sitemap and robots. */
export async function loadSiteMeta(rootDir) {
  return bundleModule(rootDir, 'src/lib/seo.ts', 'seo');
}
