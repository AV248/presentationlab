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
 * `import.meta.env` only exists inside Vite. The build scripts run in plain
 * node, so each VITE_ value the app reads is substituted at bundle time —
 * which is how VITE_SITE_URL set in Vercel reaches the generated sitemap and
 * robots.txt.
 *
 * Each key is defined individually (`import.meta.env.VITE_SITE_URL`) rather
 * than defining the whole `import.meta.env` object: esbuild only rewrites
 * the literal member expression, and building an object for it produces an
 * empty shim instead.
 */
function envDefine() {
  const define = {};
  for (const [key, value] of Object.entries(process.env)) {
    if (key.startsWith('VITE_')) define[`import.meta.env.${key}`] = JSON.stringify(value);
  }
  return define;
}

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
      define: envDefine(),
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
