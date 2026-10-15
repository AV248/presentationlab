#!/usr/bin/env node
/**
 * The reading room, tested end to end — without Turso, without Postgres, and
 * without an account.
 *
 * `npm run check:library`   (part of `npm run verify`)
 *
 * Two pieces of this repository cannot be exercised by rendering a page: the
 * projection that copies Postgres into SQLite, and the endpoint that serves
 * readings out of it. Neither is reachable from a test that only knows about
 * React, and both are the sort of thing that fails quietly — a stale row, a
 * search that returns nothing, a cache header on the wrong response.
 *
 * So this stands in for the missing half of the world:
 *
 *   • a stub PostgREST that answers `/rest/v1/speeches` with real rows and
 *     honours `limit`/`offset`, so paging is exercised for real;
 *   • a real SQLite file in `node_modules/.pb-selftest`, with the real
 *     `turso/schema.sql` applied by the real `apply.mjs`;
 *   • the real `src/server/project.ts`, bundled exactly as the deployment bundles it;
 *   • the real `app/api/library/route.ts` handler, called with a real Request and
 *     read back as a real Response
 *     object, and its answers read back.
 *
 * Nothing is mocked that matters. What is faked is only the remote host.
 */

import { createServer } from 'node:http';
import { mkdirSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { build } from 'esbuild';
import { createClient } from '@libsql/client';
import { execFileSync } from 'node:child_process';
import { ROOT } from '../lib/env.mjs';

const WORK = resolve(ROOT, 'node_modules/.pb-selftest');
/** Relative on purpose: libsql resolves a `file:` URL against the process cwd. */
const DB_URL = 'file:./node_modules/.pb-selftest/library.db';
const PORT = 8791;

let failures = 0;
const pass = (label) => console.log(`PASS  ${label}`);
const fail = (label, detail) => {
  failures += 1;
  console.error(`FAIL  ${label}${detail ? `\n      ${detail}` : ''}`);
};
const expect = (label, condition, detail) => (condition ? pass(label) : fail(label, detail));

/* ------------------------------------------------------------------ */
/* The stand-in for Postgres                                           */
/* ------------------------------------------------------------------ */

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
  ad: false,
  views: index,
  likes: index,
  dislikes: 0,
  shares: 1,
  created_at: `2026-10-0${index + 1}T10:00:00Z`,
  updated_at: `2026-10-0${index + 1}T10:00:00Z`,
}));

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);
  if (url.pathname !== '/rest/v1/speeches') {
    res.statusCode = 404;
    res.end('{}');
    return;
  }
  // Only published rows are ever copied. A stub that ignored the filter would
  // hide a real bug in the projection, so it refuses to answer without it.
  if (url.searchParams.get('status') !== 'eq.published') {
    res.statusCode = 400;
    res.end(JSON.stringify({ message: 'expected status=eq.published' }));
    return;
  }
  const limit = Number(url.searchParams.get('limit') ?? 100);
  const offset = Number(url.searchParams.get('offset') ?? 0);
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(SPEECHES.slice(offset, offset + limit)));
});

/* ------------------------------------------------------------------ */
/* Bundling, the way the deployment does it                            */
/* ------------------------------------------------------------------ */

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
    // The app's own alias. esbuild is not TypeScript, so it has to be told.
    alias: { '@': resolve(ROOT, 'src') },
    outfile,
    logLevel: 'error',
  });
  return import(`${outfile}?t=${Date.now()}`);
}

/**
 * Call the route handler the way Next.js does: a real `Request` in, a real
 * `Response` out. Nothing is faked, so a handler that answers with a header or
 * a status this test does not expect fails here rather than in production.
 */
async function call(route, path, method = 'GET') {
  // The module, not one function: Next.js dispatches by exported method name,
  // so a POST to a handler that exports no POST is exactly what the deployment
  // would see — and that is the case worth testing.
  const handler = route[method] ?? route.GET;
  const response = await handler(new Request(`http://localhost${path}`, { method }));
  const raw = await response.text();
  let json = null;
  try {
    json = raw ? JSON.parse(raw) : null;
  } catch {
    json = null;
  }
  const headers = {};
  response.headers.forEach((value, key) => {
    headers[key.toLowerCase()] = value;
  });
  return { status: response.status, headers, json, raw };
}

/* ------------------------------------------------------------------ */
/* The run                                                             */
/* ------------------------------------------------------------------ */

try {
  rmSync(WORK, { recursive: true, force: true });
  mkdirSync(WORK, { recursive: true });
  await new Promise((started) => server.listen(PORT, '127.0.0.1', started));

  /* 1 — the schema applies to a database that has never seen it. */
  execFileSync(process.execPath, [resolve(ROOT, 'scripts/turso/apply.mjs')], {
    env: { ...process.env, TURSO_DATABASE_URL: DB_URL, TURSO_AUTH_TOKEN: '' },
    stdio: 'pipe',
  });
  let db = createClient({ url: DB_URL });
  const objects = await db.execute("select type, name from sqlite_master where name in ('library','library_fts')");
  expect('turso/schema.sql applies to an empty database', objects.rows.length === 2, `found ${objects.rows.length} of 2 objects`);

  /* 2 — the projection copies published rows, and only those. */
  const { projectLibrary } = await bundle('src/server/project.ts', 'project.mjs');
  const first = await projectLibrary({
    supabaseUrl: `http://127.0.0.1:${PORT}`,
    apiKey: 'stub',
    tursoUrl: DB_URL,
    tursoToken: 'unused',
  });
  expect('the projection copies every published speech', first.synced === SPEECHES.length, `synced ${first.synced}, expected ${SPEECHES.length}`);

  /* 3 — running it again replaces rather than duplicates. */
  const second = await projectLibrary({
    supabaseUrl: `http://127.0.0.1:${PORT}`,
    apiKey: 'stub',
    tursoUrl: DB_URL,
    tursoToken: 'unused',
  });
  const counted = await db.execute('select count(*) as n from library');
  expect(
    'the projection is idempotent',
    second.synced === first.synced && Number(counted.rows[0].n) === SPEECHES.length,
    `second run synced ${second.synced}, table holds ${counted.rows[0].n}`,
  );

  /* 4 — the FTS triggers actually indexed what was inserted, with stemming. */
  const stemmed = await db.execute({
    sql: 'select library.title from library_fts join library on library.rowid = library_fts.rowid where library_fts match ?',
    args: ['"speaking"'],
  });
  expect('search stems "speaking" to its title', stemmed.rows.length === 1, `matched ${stemmed.rows.length} row(s)`);

  const tags = await db.execute({ sql: 'select tags from library where id = ?', args: ['s3'] });
  expect('tags arrive as the comma-joined string the UI reads', String(tags.rows[0].tags) === 'craft, voice', `got "${tags.rows[0]?.tags}"`);

  /* 5 — a row that stops being published leaves the reading room. */
  SPEECHES.splice(3, 1);
  await projectLibrary({ supabaseUrl: `http://127.0.0.1:${PORT}`, apiKey: 'stub', tursoUrl: DB_URL, tursoToken: 'unused' });
  const gone = await db.execute({ sql: 'select count(*) as n from library where id = ?', args: ['s3'] });
  expect('an unpublished speech disappears from the copy', Number(gone.rows[0].n) === 0, 'a deleted row survived the rebuild');
  SPEECHES.splice(3, 0, { ...SPEECHES[2], id: 's3', slug: 'slug-3', title: 'Speaking about dragons', content: 'The dragon breathed, and the room went quiet.', created_at: '2026-10-04T10:00:00Z' });
  await projectLibrary({ supabaseUrl: `http://127.0.0.1:${PORT}`, apiKey: 'stub', tursoUrl: DB_URL, tursoToken: 'unused' });
  db.close();

  /* 6 — the endpoint the browser actually calls. */
  process.env.TURSO_DATABASE_URL = DB_URL;
  process.env.TURSO_AUTH_TOKEN = 'unused';
  const handler = await bundle('app/api/library/route.ts', 'library.mjs');

  const listed = await call(handler, '/api/library?max=3');
  expect('GET /api/library lists the newest work', listed.status === 200 && listed.json.items.length === 3, `status ${listed.status}`);
  expect('a listing may be cached at the edge', String(listed.headers['cache-control']).includes('s-maxage'), listed.headers['cache-control']);

  const one = await call(handler, '/api/library?id=s3');
  expect('GET ?id= returns one speech', one.status === 200 && one.json.items[0]?.title === 'Speaking about dragons', `got ${one.json?.items?.length} item(s)`);
  expect('a single lookup is never cached', String(one.headers['cache-control']) === 'no-store', one.headers['cache-control']);

  const byName = await call(handler, '/api/library?username=AAVRIT');
  expect('GET ?username= is case-insensitive', byName.status === 200 && byName.json.items.length === SPEECHES.length, `got ${byName.json?.items?.length}`);

  const searched = await call(handler, '/api/library?q=dragon');
  expect('GET ?q= searches full text', searched.status === 200 && searched.json.items.length === 1, `got ${searched.json?.items?.length}`);

  const punctuated = await call(handler, '/api/library?q=dragon-breath');
  expect('punctuation cannot become FTS syntax', punctuated.status === 200 && punctuated.json.items.length === 1, `status ${punctuated.status}`);

  const nothing = await call(handler, '/api/library?q=%22%3B%20DROP%20TABLE%20library%3B');
  expect('a hostile query is answered, not executed', nothing.status === 200, `status ${nothing.status}`);
  const survived = createClient({ url: DB_URL });
  const stillThere = await survived.execute('select count(*) as n from library');
  expect('the table is still there afterwards', Number(stillThere.rows[0].n) === SPEECHES.length, `table holds ${stillThere.rows[0].n}`);
  survived.close();

  const posted = await call(handler, '/api/library', 'POST');
  expect('POST is refused with an explanation', posted.status === 405 && typeof posted.json?.message === 'string', `status ${posted.status}`);

  const unknown = await call(handler, '/api/library?id=not-a-speech');
  expect('an unknown id is an empty list, not an error', unknown.status === 200 && unknown.json.items.length === 0, `status ${unknown.status}`);
} catch (error) {
  fail('the self-test itself threw', error.stack ?? error.message);
} finally {
  server.close();
  rmSync(WORK, { recursive: true, force: true });
}

if (failures) {
  console.error(`\n${failures} check(s) failed — the reading room is not behaving.`);
  process.exit(1);
}
console.log('\nThe reading room behaves: projection, search and /api/library.');
