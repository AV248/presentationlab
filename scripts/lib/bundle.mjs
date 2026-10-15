/**
 * Loading one of the app's own TypeScript modules, from a Node script.
 *
 * The check scripts are plain Node, and several of them need to run the same
 * code the app runs — the SQL splitter, the reader, the projection — rather
 * than a second copy of it that drifts. esbuild bundles the module with the
 * project's `@/…` alias and it is imported normally.
 *
 * Kept in one place because the alias is not optional: without it the bundle
 * fails with "Could not resolve '@/lib/speech'", which looks like a broken
 * import in the app rather than a missing flag in the test.
 */
import { mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, resolve } from 'node:path';
import { build } from 'esbuild';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const WORK = resolve(ROOT, 'node_modules/.pb-bundled');

/**
 * Bundle and import a module. `tag` only has to be unique per call site and
 * version, so two loads of the same entry point do not share a module instance
 * (which the environment-switching checks depend on).
 */
export async function loadModule(entry, tag = 'default') {
  mkdirSync(WORK, { recursive: true });
  const name = `${entry.replace(/[^a-zA-Z0-9]+/g, '_')}-${tag}`;
  const outfile = resolve(WORK, `${name}.mjs`);
  await build({
    entryPoints: [resolve(ROOT, entry)],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    packages: 'external',
    alias: { '@': resolve(ROOT, 'src') },
    outfile,
    logLevel: 'error',
  });
  return import(`${pathToFileURL(outfile).href}?t=${Date.now()}-${Math.random()}`);
}
