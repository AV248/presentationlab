#!/usr/bin/env node
/**
 * Does every dependency the API needs actually get shipped with it?
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * WHY THIS EXISTS
 * ─────────────────────────────────────────────────────────────────────────────
 * A regression guard for a bug that reached production and cost days.
 *
 * A serverless host (Vercel here) does not upload `node_modules` wholesale: it
 * *traces* the function, deciding which files to include by looking at the
 * literal string passed to `require()` / `import()`. A dependency loaded through
 * a computed specifier —
 *
 *     loadModule<ClerkModule>('@clerk/backend')
 *     // → new Function('specifier', 'return import(specifier)')
 *
 * — is invisible to that trace, left out of the package, and fails at runtime
 * with "Cannot find module". The endpoint then answers 501 and the sign-in
 * bridge is dead, while every local test passes, because locally the dependency
 * sits right there in `node_modules`.
 *
 * So the rule this script enforces is blunt on purpose: **every package an
 * endpoint's own source names must appear in the traced file set.** It reads the
 * dependencies straight out of the source (which is where a reader would look),
 * compiles the endpoint the way a bundler would, runs the *same* tracer the host
 * uses, and fails if any named package would not be shipped.
 *
 * Run: node scripts/check-api-trace.mjs   (wired into `npm run verify`)
 */

import { build } from 'esbuild';
import { nodeFileTrace } from '@vercel/nft';
import { readdir, readFile, mkdir, rm } from 'node:fs/promises';
import { builtinModules } from 'node:module';
import path from 'node:path';
import process from 'node:process';

const ROOT = process.cwd();
const API_DIR = path.join(ROOT, 'api');
/**
 * Compiled inside the repo on purpose: a trace only finds a package if it can
 * resolve it, and resolution walks up from the *file's* directory. Compiling to
 * a system temp directory therefore measures nothing (everything looks missing),
 * which is a mistake this script made in its first draft.
 */
const SCRATCH = path.join(ROOT, 'node_modules', '.pb-api-trace');
const BUILTINS = new Set([...builtinModules, ...builtinModules.map((name) => `node:${name}`)]);

/** The package a specifier belongs to: `@scope/pkg/sub` → `@scope/pkg`. */
function packageOf(specifier) {
  const parts = specifier.split('/');
  return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0];
}

/**
 * Packages the endpoint's source names.
 *
 * Deliberately read from the source rather than from the compiled output: a
 * computed specifier leaves no trace in the output, and the source is where a
 * person would look to answer "what does this file depend on?". Only names that
 * are real runtime dependencies of this project count, so commented-out prose in
 * a doc block cannot produce a false failure.
 */
function namedPackages(source, dependencies) {
  const names = new Set();
  for (const match of source.matchAll(/['"]([^'"\s]+)['"]/g)) {
    const specifier = match[1];
    if (specifier.startsWith('.') || specifier.startsWith('/')) continue;
    if (BUILTINS.has(specifier)) continue;
    const name = packageOf(specifier);
    if (Object.prototype.hasOwnProperty.call(dependencies, name)) names.add(name);
  }
  return [...names];
}

async function traceEndpoint(entry, scratchDir) {
  const outfile = path.join(scratchDir, `${path.basename(entry, '.ts')}.cjs`);

  await build({
    entryPoints: [entry],
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'cjs',
    packages: 'external', // resolved at runtime by the host, as in production
    outfile,
    logLevel: 'error',
  });

  const { fileList } = await nodeFileTrace([outfile], { base: ROOT });
  return { outfile, traced: [...fileList] };
}

const pkg = JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8'));
const dependencies = pkg.dependencies ?? {};
await mkdir(SCRATCH, { recursive: true });
let failures = 0;

try {
  const entries = (await readdir(API_DIR))
    .filter((name) => name.endsWith('.ts'))
    .map((name) => path.join(API_DIR, name));

  if (!entries.length) {
    console.error('check-api-trace: no API endpoints found — expected api/*.ts');
    process.exit(1);
  }

  for (const entry of entries) {
    const relative = path.relative(ROOT, entry);
    const source = await readFile(entry, 'utf8');
    const named = namedPackages(source, dependencies);

    if (!named.length) {
      console.log(`PASS  ${relative}  (no runtime packages — stdlib only)`);
      continue;
    }

    const { traced } = await traceEndpoint(entry, SCRATCH);
    const missing = named.filter(
      (name) => !traced.some((file) => file.includes(`node_modules/${name}/`)),
    );

    if (missing.length) {
      failures += 1;
      console.error(`FAIL  ${relative}`);
      console.error(`      ${missing.length} package(s) the source names would NOT be shipped:`);
      for (const name of missing) console.error(`        • ${name}`);
      console.error('      Load it through a literal specifier inside import()/require() so the');
      console.error('      host\'s tracer can see it — a computed specifier is invisible to it.');
    } else {
      console.log(`PASS  ${relative}  (${named.length} package(s) traced: ${named.join(', ')})`);
    }
  }
} finally {
  await rm(SCRATCH, { recursive: true, force: true });
}

if (failures) {
  console.error('\nDependency tracing failed — the deployment would answer 501 at runtime.');
  process.exit(1);
}
console.log('Every dependency the API names would be traced into the deployment.');
