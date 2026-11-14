#!/usr/bin/env node
/**
 * Turso library test — no remote database and no account required.
 *
 * Checks the actual Turso schema, the additive legacy importer, FTS triggers,
 * public /api/library reads, and the retired destructive sync endpoint.
 */

import { createServer } from 'node:http';
import { mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { createClient } from '@libsql/client';
import { execFileSync } from 'node:child_process';
import { ROOT } from '../lib/env.mjs';

const WORK = resolve(ROOT, 'node_modules/.pb-selftest');
const DB_URL = 'file:./node_modules/.pb-selftest/library.db';
const PORT = 8791;
const SUPABASE = `http://127.0.0.1:${PORT}`;
let failures = 0;
const pass = (label) => console.log(`PASS  ${label}`);
const fail = (label, detail = '') => {
  failures += 1;
  console.error(`FAIL  ${label}${detail ? `\n      ${detail}` : ''}`);
};
const expect = (label, condition, detail = '') => (condition ? pass(label) : fail(label, detail));

const SPEECHES = Array.from({ length: 7 }, (_, index) => ({
  id: `s${index}`,
  uid: 'u1',
  username: 'aavrit',
  author: 'Aavrit',
  folder: index === 1 ? 'launch' : '',
  slug: `slug-${index}`,
  title: index === 3 ? 'Speaking about dragons' : `Speech ${index}`,
  preview: 'A short teaser.',
  content: index === 3 ? 'The dragon breathed, and the room went quiet.' : 'Body copy.',
  category: 'General',
  occasion: '',
  tags: ['craft', 'voice'],
  credits: '',
  signature: '',
  allow_copy: true,
  author_photo_url: 'https://example.test/aavrit.jpg',
  author_badges: '',
  views: index,
  likes: index,
  dislikes: 0,
  shares: 1,
  status: 'published',
  created_at: `2026-10-0${index + 1}T10:00:00Z`,
  published_at: `2026-10-0${index + 1}T10:00:00Z`,
  updated_at: `2026-10-0${index + 1}T10:00:00Z`,
}));

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);
  if (url.pathname !== '/rest/v1/speeches' || url.searchParams.get('status') !== 'eq.published') {
    res.statusCode = 400;
    res.end(JSON.stringify({ message: 'expected the legacy published-speech read' }));
    return;
  }
  const limit = Number(url.searchParams.get('limit') ?? 500);
  const offset = Number(url.searchParams.get('offset') ?? 0);
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(SPEECHES.slice(offset, offset + limit)));
});

async function bundle(entry, name) {
  mkdirSync(WORK, { recursive: true });
  const outfile = resolve(WORK, name);
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
  return import(`${outfile}?t=${Date.now()}`);
}

async function call(route, path, method = 'GET') {
  const handler = route[method] ?? route.GET;
  const response = await handler(new Request(`http://localhost${path}`, { method }));
  const raw = await response.text();
  let json = null;
  try { json = raw ? JSON.parse(raw) : null; } catch { /* non-JSON response */ }
  const headers = Object.fromEntries(response.headers.entries());
  return { status: response.status, json, headers };
}

try {
  rmSync(WORK, { recursive: true, force: true });
  mkdirSync(WORK, { recursive: true });
  await new Promise((started) => server.listen(PORT, '127.0.0.1', started));

  execFileSync(process.execPath, [resolve(ROOT, 'scripts/turso/apply.mjs')], {
    env: { ...process.env, TURSO_DATABASE_URL: DB_URL, TURSO_AUTH_TOKEN: '' },
    stdio: 'pipe',
  });
  let db = createClient({ url: DB_URL });
  const objects = await db.execute("select type, name from sqlite_master where name in ('library','library_fts')");
  expect('turso/schema.sql applies to an empty database', objects.rows.length === 2, `found ${objects.rows.length} of 2 objects`);
  await db.close();

  const importer = await bundle('src/server/project.ts', 'legacy-import.mjs');
  const importOptions = { supabaseUrl: SUPABASE, apiKey: 'stub-key', tursoUrl: DB_URL, tursoToken: 'unused' };
  const first = await importer.importLegacyLibrary(importOptions);
  expect('legacy import adds published rows once', first.read === 7 && first.imported === 7 && first.skipped === 0, JSON.stringify(first));

  const inspection = await importer.inspectLegacyLibrary(importOptions);
  expect('check-only inspection reports no missing rows', inspection.read === 7 && inspection.missing === 0, JSON.stringify(inspection));

  // Change an existing legacy title and remove a source row. Turso is already
  // authoritative: neither change is allowed to overwrite or delete its copy.
  SPEECHES[1].title = 'Edited in legacy only';
  SPEECHES.splice(3, 1);
  SPEECHES.push({ ...SPEECHES[2], id: 's7', slug: 'slug-7', title: 'New legacy arrival', created_at: '2026-10-08T10:00:00Z', published_at: '2026-10-08T10:00:00Z' });
  const second = await importer.importLegacyLibrary(importOptions);
  expect('repeat import adds only a genuinely new row', second.read === 7 && second.imported === 1 && second.skipped === 6, JSON.stringify(second));

  db = createClient({ url: DB_URL });
  const preserved = await db.execute({ sql: 'select title from library where id = ?', args: ['s1'] });
  expect('legacy edits never overwrite an existing Turso row', String(preserved.rows[0]?.title) === 'Speech 1', String(preserved.rows[0]?.title));
  const removedAtSource = await db.execute({ sql: 'select count(*) as n from library where id = ?', args: ['s3'] });
  expect('a source deletion never deletes an authoritative Turso row', Number(removedAtSource.rows[0]?.n) === 1);
  const added = await db.execute({ sql: 'select count(*) as n from library where id = ?', args: ['s7'] });
  expect('a new legacy row can be imported additively', Number(added.rows[0]?.n) === 1);

  const stemmed = await db.execute({
    sql: 'select library.title from library_fts join library on library.rowid = library_fts.rowid where library_fts match ?',
    args: ['"speaking"'],
  });
  expect('FTS triggers index imported presentation text', stemmed.rows.length === 1, `matched ${stemmed.rows.length} row(s)`);
  const tags = await db.execute({ sql: 'select tags from library where id = ?', args: ['s3'] });
  expect('tags survive import as the string the reader maps', String(tags.rows[0]?.tags) === 'craft, voice', `got "${tags.rows[0]?.tags}"`);
  const count = await db.execute('select count(*) as n from library');
  expect('Turso keeps all eight authoritative rows', Number(count.rows[0]?.n) === 8, `got ${count.rows[0]?.n}`);
  await db.close();

  process.env.TURSO_DATABASE_URL = DB_URL;
  process.env.TURSO_AUTH_TOKEN = 'unused';
  const library = await bundle('app/api/library/route.ts', 'library.mjs');
  const listed = await call(library, '/api/library?max=3');
  expect('GET /api/library lists the newest Turso work', listed.status === 200 && listed.json.items.length === 3, `status ${listed.status}`);
  expect('public library listings have short cache headers', String(listed.headers['cache-control']).includes('s-maxage=60'), listed.headers['cache-control']);
  expect('author profile photo metadata survives the public read', listed.json.items.every((item) => item.authorPhotoURL === 'https://example.test/aavrit.jpg'));

  const one = await call(library, '/api/library?id=s3');
  expect('GET ?id= returns one presentation', one.status === 200 && one.json.items[0]?.title === 'Speaking about dragons', `status ${one.status}`);
  expect('one-presentation lookup is not cached', listed.status === 200 && String(one.headers['cache-control']) === 'no-store');
  const byName = await call(library, '/api/library?username=AAVRIT');
  expect('GET ?username= is case-insensitive', byName.status === 200 && byName.json.items.length === 8, `got ${byName.json?.items?.length}`);
  const searched = await call(library, '/api/library?q=dragon');
  expect('GET ?q= searches the Turso FTS index', searched.status === 200 && searched.json.items.length === 1, `got ${searched.json?.items?.length}`);
  const punctuated = await call(library, '/api/library?q=dragon-breath');
  expect('punctuation cannot become FTS syntax', punctuated.status === 200 && punctuated.json.items.length === 1, `status ${punctuated.status}`);
  const hostile = await call(library, '/api/library?q=%22%3B%20DROP%20TABLE%20library%3B');
  expect('a hostile query is answered, not executed', hostile.status === 200);
  const survived = createClient({ url: DB_URL });
  const stillThere = await survived.execute('select count(*) as n from library');
  expect('the library remains intact after a hostile query', Number(stillThere.rows[0]?.n) === 8, `table holds ${stillThere.rows[0]?.n}`);
  await survived.close();
  const posted = await call(library, '/api/library', 'POST');
  expect('POST is refused on the public library endpoint', posted.status === 405 && typeof posted.json?.message === 'string', `status ${posted.status}`);

  const retired = await bundle('app/api/sync-library/route.ts', 'sync-library.mjs');
  const disabled = await call(retired, '/api/sync-library', 'POST');
  expect('the former rebuild endpoint is explicitly retired', disabled.status === 410 && disabled.json?.error === 'legacy_sync_retired', `status ${disabled.status}`);
  const afterRetired = createClient({ url: DB_URL });
  const stillEight = await afterRetired.execute('select count(*) as n from library');
  expect('the retired endpoint does not modify Turso', Number(stillEight.rows[0]?.n) === 8);
  await afterRetired.close();
} catch (error) {
  fail('the Turso self-test itself threw', error?.stack ?? error?.message ?? String(error));
} finally {
  server.close();
  rmSync(WORK, { recursive: true, force: true });
}

if (failures) {
  console.error(`\n${failures} check(s) failed — the Turso library is not behaving.`);
  process.exit(1);
}
console.log('\nTurso behaves: additive legacy import, FTS, public reads, and retired rebuild protection.');
