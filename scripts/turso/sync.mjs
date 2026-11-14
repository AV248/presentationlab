#!/usr/bin/env node
/**
 * Additively import legacy Supabase presentations into Turso.
 *
 * `npm run sync:turso -- --check` reads both stores and reports what would be
 * added without writing. `npm run sync:turso` imports only missing rows.
 * Existing Turso rows are never overwritten or deleted. New site writes go
 * directly to Turso and do not call this CLI.
 *
 * Requires locally, in `.env` or the environment:
 *   SUPABASE_URL                 legacy Supabase project URL
 *   SUPABASE_SERVICE_ROLE_KEY    CLI-only read key; never a VITE_ variable
 *   TURSO_DATABASE_URL           libsql://… or file:…
 *   TURSO_AUTH_TOKEN             remote Turso token (not needed for file:)
 */

import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { createClient } from '@libsql/client';
import { ROOT, loadEnv, need, presence } from '../lib/env.mjs';

const env = loadEnv();
const checkOnly = process.argv.includes('--check');
const supabaseUrl = need(env, 'SUPABASE_URL', 'Set the legacy Supabase Project URL in your local .env file.');
const serviceKey = need(
  env,
  'SUPABASE_SERVICE_ROLE_KEY',
  'Set this CLI-only key in your local .env file. Never expose it through a VITE_ variable or add it to Vercel.',
);
const tursoUrl = need(env, 'TURSO_DATABASE_URL', 'Set the authoritative Turso URL in .env.');
const tursoToken = (env.TURSO_AUTH_TOKEN ?? '').trim();
if (!tursoUrl.startsWith('file:') && !tursoToken) {
  need(env, 'TURSO_AUTH_TOKEN', 'Set the Turso token in your local .env file.');
}

console.log(`\n  Legacy import : ${supabaseUrl.replace('https://', '').replace('http://', '')} → ${tursoUrl.startsWith('file:') ? tursoUrl : 'Turso'}`);
console.log(`  service key   : ${presence(env, 'SUPABASE_SERVICE_ROLE_KEY')} (value not shown)`);
console.log(`  Turso token   : ${tursoUrl.startsWith('file:') ? 'not needed for a local file' : presence(env, 'TURSO_AUTH_TOKEN')}`);
if (checkOnly) console.log('  mode          : check only — no changes will be made');

async function loadImporter() {
  const outDir = resolve(ROOT, 'node_modules/.pb-turso');
  mkdirSync(outDir, { recursive: true });
  const outfile = resolve(outDir, 'legacy-import.mjs');
  await build({
    entryPoints: [resolve(ROOT, 'src/server/project.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    packages: 'external',
    outfile,
    logLevel: 'error',
  });
  const module = await import(`${outfile}?t=${Date.now()}`);
  if (typeof module.inspectLegacyLibrary !== 'function' || typeof module.importLegacyLibrary !== 'function') {
    throw new Error('The legacy importer is missing its safe inspect/import functions.');
  }
  return module;
}

const options = {
  supabaseUrl,
  apiKey: serviceKey,
  tursoUrl,
  tursoToken: tursoToken || 'local',
};

try {
  const importer = await loadImporter();
  if (checkOnly) {
    const plan = await importer.inspectLegacyLibrary(options);
    console.log(`\n  Supabase legacy rows : ${plan.read}`);
    console.log(`  Already represented : ${plan.present}`);
    console.log(`  Missing in Turso     : ${plan.missing}`);
    console.log('  Check complete. No presentation row was written or changed.\n');
    process.exit(0);
  }

  const started = Date.now();
  const result = await importer.importLegacyLibrary(options);
  const db = createClient({ url: tursoUrl, authToken: tursoToken || undefined });
  let total = 0;
  try {
    const rows = await db.execute('select count(*) as n from library');
    total = Number(rows.rows[0]?.n ?? 0);
  } finally {
    db.close();
  }
  const verification = await importer.inspectLegacyLibrary(options);
  console.log(`\n  Read from legacy store : ${result.read}`);
  console.log(`  Added missing rows    : ${result.imported}`);
  console.log(`  Left untouched        : ${result.skipped}`);
  console.log(`  Still not represented : ${verification.missing}`);
  console.log(`  Turso library total   : ${total}`);
  console.log(`  Duration              : ${Date.now() - started} ms`);
  if (verification.missing) {
    console.error('\n  Some legacy rows were not imported. Inspect address conflicts before retrying.\n');
    process.exitCode = 1;
  } else {
    console.log('\n  Import complete. Future writes are Turso-native; this command is not part of publishing.\n');
  }
} catch (error) {
  console.error(`\n  Import failed: ${error instanceof Error ? error.message : String(error)}\n`);
  process.exitCode = 1;
}
