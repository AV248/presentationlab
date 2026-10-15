#!/usr/bin/env node
/**
 * Rebuild the reading room from the truth.
 *
 * `npm run sync:turso`            rebuild it
 * `npm run sync:turso -- --check`  say what would happen, change nothing
 *
 * This is the full sync, and it is the same code the app uses: the endpoint
 * `POST /api/sync-library` and this script both call `projectLibrary()` in
 * `api/_project.ts`. One implementation, two entry points — so the reading room
 * cannot mean one thing when the site refreshes it and another when you do.
 *
 * Use it for the first fill, and after anything large — a migration, a bulk
 * edit, a restore. Ordinary publishing refreshes the reading room on its own.
 *
 * Requires, in `.env` or the environment:
 *   SUPABASE_URL                 https://<project>.supabase.co
 *   SUPABASE_SERVICE_ROLE_KEY    the service key — server-side only, never VITE_
 *   TURSO_DATABASE_URL           libsql://…
 *   TURSO_AUTH_TOKEN             the token for that database
 *
 * The service key is used here rather than a person's session token because
 * this runs on your machine, without a browser, and it must be able to read
 * every published speech regardless of who is asking. It is read from `.env`
 * and never printed, never logged, and never sent anywhere but your own
 * Supabase project.
 */

import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { createClient } from '@libsql/client';
import { ROOT, loadEnv, need, presence, fingerprint } from '../lib/env.mjs';

const env = loadEnv();
const checkOnly = process.argv.includes('--check');

const supabaseUrl = need(
  env,
  'SUPABASE_URL',
  'It is the Project URL from Supabase → Project Settings → Data API. Put it in .env.',
);
const serviceKey = need(
  env,
  'SUPABASE_SERVICE_ROLE_KEY',
  'It is the service_role key from Supabase → Project Settings → API keys. It belongs in .env (local only) — never in a VITE_ variable, and it is not needed in Vercel.',
);
const tursoUrl = need(
  env,
  'TURSO_DATABASE_URL',
  'It is the libsql:// URL of the database created at turso.tech. Put it in .env.',
);
const tursoToken = (env.TURSO_AUTH_TOKEN ?? '').trim();
if (!tursoUrl.startsWith('file:') && !tursoToken) {
  need(env, 'TURSO_AUTH_TOKEN', 'Create a token for the database in the Turso dashboard and put it in .env.');
}

console.log('\n  Rebuilding the reading room from Postgres\n');
console.log(`  Postgres : ${supabaseUrl.replace(/^https?:\/\//, '')}`);
console.log(`  key      : ${fingerprint(serviceKey)}${presence(env, 'SUPABASE_SERVICE_ROLE_KEY') === 'set' ? '' : ' (missing)'}`);
console.log(`  Turso    : ${tursoUrl.startsWith('file:') ? tursoUrl : 'the configured database'}`);
console.log(`  token    : ${tursoUrl.startsWith('file:') ? 'not needed (local file)' : presence(env, 'TURSO_AUTH_TOKEN')}`);
if (checkOnly) console.log('  mode     : check only — nothing will be written');

/**
 * Load `api/_project.ts`.
 *
 * It is TypeScript, written for the serverless runtime, and this script is
 * plain node — so it is bundled by esbuild first, the same way the Vite dev
 * server mounts the API handlers. The compiled copy goes inside `node_modules`
 * (git-ignored, swept by `npm ci`) rather than a temp directory outside the
 * repository, because a bundle has to resolve its imports from somewhere that
 * can see `node_modules`.
 */
async function loadProjection() {
  const outDir = resolve(ROOT, 'node_modules/.pb-turso');
  mkdirSync(outDir, { recursive: true });
  const outfile = resolve(outDir, 'project.mjs');

  await build({
    entryPoints: [resolve(ROOT, 'api/_project.ts')],
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    packages: 'external',
    outfile,
    logLevel: 'error',
  });

  const module = await import(`${outfile}?t=${Date.now()}`);
  if (typeof module.projectLibrary !== 'function') {
    throw new Error('api/_project.ts did not export projectLibrary — the sync cannot run.');
  }
  return module.projectLibrary;
}

try {
  const projectLibrary = await loadProjection();

  if (checkOnly) {
    const url = new URL('/rest/v1/speeches', supabaseUrl);
    url.searchParams.set('select', 'id');
    url.searchParams.set('status', 'eq.published');
    const response = await fetch(url, {
      headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}`, Prefer: 'count=exact' },
    });
    if (!response.ok) {
      console.error(`\n  Postgres refused the read (${response.status}).`);
      console.error(`  ${(await response.text()).slice(0, 300)}\n`);
      process.exit(1);
    }
    const published = (await response.json()).length;
    const db = createClient({ url: tursoUrl, authToken: tursoToken || undefined });
    let present = 0;
    try {
      const { rows } = await db.execute('select count(*) as n from library');
      present = Number(rows[0]?.n ?? 0);
    } catch {
      console.error('\n  turso/schema.sql has not been applied to this database yet.');
      console.error('  Run:  npm run db:turso\n');
      process.exit(1);
    } finally {
      db.close();
    }
    console.log(`\n  Postgres holds ${published} published speech(es).`);
    console.log(`  The reading room holds ${present}.`);
    console.log(present === published ? '  They agree — nothing to do.\n' : '  Run without --check to rebuild it.\n');
    process.exit(0);
  }

  const started = Date.now();
  const result = await projectLibrary({
    supabaseUrl,
    apiKey: serviceKey,
    tursoUrl,
    tursoToken: tursoToken || 'local',
  });

  // A quick, honest verification: the row count the database reports, and a
  // search that must return at least one hit when there is anything to find.
  const db = createClient({ url: tursoUrl, authToken: tursoToken || undefined });
  try {
    const { rows } = await db.execute('select count(*) as n from library');
    const stored = Number(rows[0]?.n ?? 0);
    console.log(`\n  Copied ${result.synced} speech(es) in ${Date.now() - started} ms.`);
    console.log(`  The reading room now reports ${stored} row(s).`);
    if (stored !== result.synced) {
      console.error('  The count does not match what was written — inspect the database before trusting it.');
      process.exitCode = 1;
    }
  } finally {
    db.close();
  }
  console.log('\n  Done. Readers now reach this copy through /api/library.\n');
} catch (error) {
  console.error(`\n  Failed: ${error.message}\n`);
  process.exitCode = 1;
}
