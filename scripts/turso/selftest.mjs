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

  // A pre-existing Turso table cannot create an index on fields that have not
  // been added yet. Exercise the additive upgrade against the prior shape.
  const LEGACY_DB_URL = 'file:./node_modules/.pb-selftest/legacy.db';
  let legacy = createClient({ url: LEGACY_DB_URL });
  await legacy.execute(`create table library (
    id text primary key, uid text not null, username text not null default '',
    folder text not null default '', slug text not null default '',
    title text not null default 'Untitled', author text not null default '',
    author_photo_url text not null default '', author_badges text not null default '',
    preview text not null default '', content text not null default '',
    category text not null default '', occasion text not null default '',
    tags text not null default '', credits text not null default '',
    signature text not null default '', allow_copy integer not null default 1,
    source_type text not null default 'person', source_name text not null default '',
    source_url text not null default '', license text not null default '',
    views integer not null default 0, likes integer not null default 0,
    dislikes integer not null default 0, shares integer not null default 0,
    published_at text not null default '', updated_at text not null default ''
  )`);
  await legacy.execute({
    sql: `insert into library (id, uid, username, slug, title, content, published_at)
          values ('legacy-row', 'u1', 'aavrit', 'legacy', 'Preserved title', 'Preserved body', '2026-10-01T00:00:00Z')`,
  });
  await legacy.batch(Array.from({ length: 199 }, (_, index) => ({
    sql: `insert into library (id, uid, username, slug, title, content, published_at)
          values (?, 'u1', 'writer', ?, ?, 'Legacy body', ?)` ,
    args: [
      `legacy-seed-${String(index + 1).padStart(3, '0')}`,
      `legacy-${index + 1}`,
      `Legacy ${index + 1}`,
      `2026-09-01T00:${String(Math.floor(index / 60)).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}Z`,
    ],
  })), 'write');
  await legacy.close();
  execFileSync(process.execPath, [resolve(ROOT, 'scripts/turso/apply.mjs')], {
    env: { ...process.env, TURSO_DATABASE_URL: LEGACY_DB_URL, TURSO_AUTH_TOKEN: '' },
    stdio: 'pipe',
  });
  legacy = createClient({ url: LEGACY_DB_URL });
  const upgradedColumns = await legacy.execute('pragma table_info(library)');
  const upgradedNames = new Set(upgradedColumns.rows.map((row) => String(row.name)));
  const upgradedIndexes = await legacy.execute(`
    select name from sqlite_master where type = 'index'
      and name in ('library_public_recent_idx', 'library_official_idx')`);
  const preservedRow = await legacy.execute(`select title, content from library where id = 'legacy-row'`);
  expect(
    'an older library upgrades its new moderation/provenance columns without losing content',
    ['source_title', 'source_fetched_at', 'official_slug', 'source_item_id', 'moderation_status', 'moderation_note', 'featured', 'safety_sampled'].every((name) => upgradedNames.has(name))
      && preservedRow.rows[0]?.title === 'Preserved title'
      && preservedRow.rows[0]?.content === 'Preserved body',
    `columns=${[...upgradedNames].join(', ')}`,
  );
  expect('new moderation indexes are created after the additive upgrade', upgradedIndexes.rows.length === 2, `found ${upgradedIndexes.rows.length}/2`);
  const legacySampleCount = await legacy.execute('select count(*) as n from library where safety_sampled = 1');
  expect('an additive upgrade backfills only the one-in-one-hundred legacy cohort', Number(legacySampleCount.rows[0]?.n) === 2, `got ${legacySampleCount.rows[0]?.n}`);
  const legacyFts = await legacy.execute({
    sql: `select library.id from library_fts join library on library.rowid = library_fts.rowid
          where library_fts match ? and library.id = 'legacy-row'`,
    args: ['"preserved"'],
  });
  expect('FTS remains readable after the safety-column upgrade and cohort backfill', legacyFts.rows.length === 1 && legacyFts.rows[0]?.id === 'legacy-row', `got ${legacyFts.rows.length} match(es)`);
  const initialLegacyMembership = await legacy.execute('select id from library where safety_sampled = 1 order by published_at, id');
  expect('legacy backfill chooses the two oldest eligible personal works',
    initialLegacyMembership.rows.length === 2
      && initialLegacyMembership.rows[0]?.id === 'legacy-seed-001'
      && initialLegacyMembership.rows[1]?.id === 'legacy-seed-002');

  // Simulate an installation with the prior same-name admission trigger and
  // no current migration marker. The additive upgrade must replace the trigger
  // and repair the cohort after a newly inserted older legacy work.
  await legacy.execute('delete from turso_schema_migrations where version = 2');
  await legacy.execute('drop trigger if exists library_safety_sample_ai');
  await legacy.execute(`create trigger library_safety_sample_ai after insert on library
    when new.moderation_status = 'published' and new.source_type = 'person' and new.safety_sampled = 0
    begin
      update library set safety_sampled = 1 where id = new.id
        and (select count(*) / 100 from library where moderation_status = 'published')
          > (select count(*) from library where moderation_status = 'published' and source_type = 'person' and safety_sampled = 1);
    end`);
  await legacy.execute({
    sql: `insert into library (id, uid, username, slug, title, content, published_at, updated_at)
          values ('legacy-ancient', 'u1', 'writer', 'legacy-ancient', 'Ancient', 'Ancient body', '2026-08-01T00:00:00Z', '2026-08-01T00:00:00Z')`,
  });
  await legacy.close();
  execFileSync(process.execPath, [resolve(ROOT, 'scripts/turso/apply.mjs')], {
    env: { ...process.env, TURSO_DATABASE_URL: LEGACY_DB_URL, TURSO_AUTH_TOKEN: '' },
    stdio: 'pipe',
  });
  legacy = createClient({ url: LEGACY_DB_URL });
  const upgradedLegacyMembership = await legacy.execute('select id from library where safety_sampled = 1 order by published_at, id');
  const samplingVersion = await legacy.execute('select count(*) as n from turso_schema_migrations where version = 2');
  expect('the trigger migration replaces the old algorithm and reselects the oldest cohort',
    Number(samplingVersion.rows[0]?.n) === 1
      && upgradedLegacyMembership.rows.length === 2
      && upgradedLegacyMembership.rows[0]?.id === 'legacy-ancient'
      && upgradedLegacyMembership.rows[1]?.id === 'legacy-seed-001',
    JSON.stringify(upgradedLegacyMembership.rows.map((row) => row.id)));
  const migratedFts = await legacy.execute({
    sql: `select library.id from library_fts join library on library.rowid = library_fts.rowid
          where library_fts match ? and library.id = 'legacy-row'`,
    args: ['"preserved"'],
  });
  expect('FTS stays readable after the one-time cohort-trigger migration', migratedFts.rows.length === 1);
  await legacy.close();

  // The global safety cohort admits at most one personal presentation per
  // hundred published rows. This also exercises sample rebalancing on deletion.
  const SAMPLE_DB_URL = 'file:./node_modules/.pb-selftest/sampling.db';
  execFileSync(process.execPath, [resolve(ROOT, 'scripts/turso/apply.mjs')], {
    env: { ...process.env, TURSO_DATABASE_URL: SAMPLE_DB_URL, TURSO_AUTH_TOKEN: '' },
    stdio: 'pipe',
  });
  const sampledDb = createClient({ url: SAMPLE_DB_URL });
  const sampleInsert = (index) => ({
    sql: `insert into library (id, uid, username, slug, title, content, source_type,
          moderation_status, published_at, updated_at)
          values (?, 'owner', 'writer', ?, ?, 'Body', 'person', 'published', ?, ?)` ,
    args: [
      `sample-${String(index).padStart(3, '0')}`,
      `sample-${index}`,
      `Sample ${index}`,
      `2026-10-01T00:${String(Math.floor(index / 60)).padStart(2, '0')}:${String(index % 60).padStart(2, '0')}Z`,
      '2026-10-01T00:00:00Z',
    ],
  });
  await sampledDb.batch(Array.from({ length: 99 }, (_, index) => sampleInsert(index + 1)), 'write');
  let sampleCount = await sampledDb.execute('select count(*) as n from library where safety_sampled = 1');
  expect('the global recovery sample stays empty below 100 canonical presentations', Number(sampleCount.rows[0]?.n) === 0);
  await sampledDb.execute(sampleInsert(100));
  let sampleRows = await sampledDb.execute('select id from library where safety_sampled = 1 order by id');
  expect('the 100th published presentation opens one slot for the oldest eligible personal work', sampleRows.rows.length === 1 && sampleRows.rows[0]?.id === 'sample-001');
  await sampledDb.batch(Array.from({ length: 100 }, (_, index) => sampleInsert(index + 101)), 'write');
  sampleRows = await sampledDb.execute('select id from library where safety_sampled = 1 order by id');
  expect('the 200th canonical presentation opens a second slot for the next-oldest personal work', sampleRows.rows.length === 2 && sampleRows.rows[0]?.id === 'sample-001' && sampleRows.rows[1]?.id === 'sample-002');
  await sampledDb.execute({ sql: "update library set moderation_status = 'hidden' where id = 'sample-001'" });
  sampleRows = await sampledDb.execute('select id from library where safety_sampled = 1 order by id');
  expect('unpublishing a sampled work clears it and backfills the oldest remaining eligible work', sampleRows.rows.length === 1 && sampleRows.rows[0]?.id === 'sample-002');
  await sampledDb.execute({ sql: "update library set moderation_status = 'published' where id = 'sample-001'" });
  sampleRows = await sampledDb.execute('select id from library where safety_sampled = 1 order by id');
  expect('republishing an older work restores oldest-first cohort membership', sampleRows.rows.length === 2 && sampleRows.rows[0]?.id === 'sample-001' && sampleRows.rows[1]?.id === 'sample-002');
  await sampledDb.execute({ sql: "update library set source_type = 'official' where id = 'sample-001'" });
  sampleRows = await sampledDb.execute('select id from library where safety_sampled = 1 order by id');
  expect('changing a sampled work to an official source clears it and backfills another personal work', sampleRows.rows.length === 2 && sampleRows.rows[0]?.id === 'sample-002' && sampleRows.rows[1]?.id === 'sample-003');
  await sampledDb.execute({ sql: "update library set source_type = 'person' where id = 'sample-001'" });
  sampleRows = await sampledDb.execute('select id from library where safety_sampled = 1 order by id');
  expect('returning an older work to personal provenance restores oldest-first membership', sampleRows.rows.length === 2 && sampleRows.rows[0]?.id === 'sample-001' && sampleRows.rows[1]?.id === 'sample-002');
  await sampledDb.execute({ sql: 'delete from library where id = ?', args: ['sample-200'] });
  sampleRows = await sampledDb.execute('select id from library where safety_sampled = 1 order by id');
  expect('deleting an unsampled canonical row trims the cohort when its quota shrinks', sampleRows.rows.length === 1 && sampleRows.rows[0]?.id === 'sample-001');
  await sampledDb.execute("delete from library where id >= 'sample-100' and id <= 'sample-199'");
  sampleCount = await sampledDb.execute('select count(*) as n from library where safety_sampled = 1');
  let remaining = await sampledDb.execute("select count(*) as n from library where moderation_status = 'published'");
  expect('deletions below 100 remove every global safety marker', Number(remaining.rows[0]?.n) === 99 && Number(sampleCount.rows[0]?.n) === 0);
  await sampledDb.execute({
    sql: `insert into library (id, uid, username, title, content, source_type, moderation_status, published_at, updated_at)
          values ('official-100', 'archive', 'wikisource', 'Official source', 'Body', 'official', 'published', '2026-10-02T00:00:00Z', '2026-10-02T00:00:00Z')`,
  });
  sampleRows = await sampledDb.execute('select id from library where safety_sampled = 1 order by id');
  expect('a published official row opening the 100th slot selects the oldest eligible personal work', sampleRows.rows.length === 1 && sampleRows.rows[0]?.id === 'sample-001');
  await sampledDb.execute({ sql: "update library set moderation_status = 'hidden' where id = 'official-100'" });
  sampleRows = await sampledDb.execute('select id from library where safety_sampled = 1 order by id');
  remaining = await sampledDb.execute("select count(*) as n from library where moderation_status = 'published'");
  expect('unpublishing the denominator row closes the slot and clears its personal snapshot', Number(remaining.rows[0]?.n) === 99 && sampleRows.rows.length === 0, JSON.stringify({ remaining: remaining.rows[0]?.n, samples: sampleRows.rows.map((row) => row.id) }));
  await sampledDb.execute({
    sql: `insert into library (id, uid, username, slug, title, content, source_type, moderation_status, published_at, updated_at)
          values ('sample-ancient', 'owner', 'writer', 'sample-ancient', 'Ancient personal work', 'Ancient body searchable text', 'person', 'published', '2026-08-01T00:00:00Z', '2026-08-01T00:00:00Z')`,
  });
  sampleRows = await sampledDb.execute('select id from library where safety_sampled = 1 order by published_at, id');
  expect('a newly inserted oldest work displaces newer markers immediately', sampleRows.rows.length === 1 && sampleRows.rows[0]?.id === 'sample-ancient');
  const newlySampledFts = await sampledDb.execute({
    sql: `select library.id from library_fts join library on library.rowid = library_fts.rowid
          where library_fts match ? and library.id = 'sample-ancient'`,
    args: ['"ancient"'],
  });
  expect('FTS remains readable when the insert trigger immediately samples its new row', newlySampledFts.rows.length === 1);
  await sampledDb.close();

  // Exercise the canonical share/edit transaction and its Turso version log.
  const VERSION_DB_URL = 'file:./node_modules/.pb-selftest/versions.db';
  process.env.TURSO_DATABASE_URL = VERSION_DB_URL;
  process.env.TURSO_AUTH_TOKEN = 'unused';
  const presentations = await bundle('src/server/presentations.ts', 'presentation-versions.mjs');
  const identity = { uid: 'writer-1', token: 'test-session' };
  const profile = { uid: 'writer-1', username: 'writer', displayName: 'Writer', photoURL: '', signature: '', badges: [] };
  const initial = presentations.normalizeShareInput({ title: 'First address', content: 'First canonical text.' });
  const presentationId = await presentations.publishPresentation(identity, profile, initial);
  let versionDb = createClient({ url: VERSION_DB_URL });
  let versions = await versionDb.execute({
    sql: 'select version, title, content from presentation_versions where presentation_id = ? order by version',
    args: [presentationId],
  });
  expect('a first share records canonical version one in the same Turso transaction',
    versions.rows.length === 1 && Number(versions.rows[0]?.version) === 1 && versions.rows[0]?.content === 'First canonical text.');
  const revised = presentations.normalizeShareInput({
    id: presentationId, title: 'Revised address', content: 'Second canonical text.', category: 'General',
  });
  await presentations.updatePresentation(identity, profile, { ...revised, id: presentationId });
  versions = await versionDb.execute({
    sql: 'select version, title, content from presentation_versions where presentation_id = ? order by version',
    args: [presentationId],
  });
  expect('an edit preserves a second immutable canonical version',
    versions.rows.length === 2 && Number(versions.rows[1]?.version) === 2
      && versions.rows[0]?.content === 'First canonical text.'
      && versions.rows[1]?.content === 'Second canonical text.');
  await presentations.updatePresentation(identity, profile, { ...revised, id: presentationId });
  const unchangedVersions = await versionDb.execute({
    sql: 'select count(*) as n from presentation_versions where presentation_id = ?',
    args: [presentationId],
  });
  expect('a no-op Share does not create a duplicate version', Number(unchangedVersions.rows[0]?.n) === 2);
  await presentations.deletePresentation(identity, presentationId);
  const deletedVersions = await versionDb.execute({
    sql: 'select count(*) as n from presentation_versions where presentation_id = ?',
    args: [presentationId],
  });
  expect('deleting a presentation also removes its private version history', Number(deletedVersions.rows[0]?.n) === 0);

  await versionDb.execute({
    sql: `insert into library (
      id, uid, username, slug, title, preview, content, category, credits, folder,
      allow_copy, published_at, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      'legacy-version-row', 'writer-1', 'writer', 'legacy-work', 'Old legacy title',
      'Old legacy preview', 'Old legacy content.', 'Legacy category', 'Old credits', '',
      1, '2025-01-01T00:00:00.000Z', '2025-01-02T00:00:00.000Z',
    ],
  });
  const legacyEdit = presentations.normalizeShareInput({
    id: 'legacy-version-row', title: 'Updated legacy title', content: 'Updated legacy content.',
    category: 'Speech', credits: 'Updated credits',
  });
  await presentations.updatePresentation(identity, profile, { ...legacyEdit, id: 'legacy-version-row' });
  const legacyVersions = await versionDb.execute({
    sql: `select version, title, content, change_note from presentation_versions
          where presentation_id = ? order by version`,
    args: ['legacy-version-row'],
  });
  expect('the first legacy edit preserves its canonical state as an imported baseline',
    legacyVersions.rows.length === 2
      && Number(legacyVersions.rows[0]?.version) === 1
      && legacyVersions.rows[0]?.title === 'Old legacy title'
      && legacyVersions.rows[0]?.content === 'Old legacy content.'
      && legacyVersions.rows[0]?.change_note === 'Imported baseline'
      && Number(legacyVersions.rows[1]?.version) === 2
      && legacyVersions.rows[1]?.content === 'Updated legacy content.');
  await presentations.updatePresentation(identity, profile, { ...legacyEdit, id: 'legacy-version-row' });
  const unchangedLegacyVersions = await versionDb.execute({
    sql: 'select count(*) as n from presentation_versions where presentation_id = ?',
    args: ['legacy-version-row'],
  });
  expect('a no-op edit after legacy history starts adds no version', Number(unchangedLegacyVersions.rows[0]?.n) === 2);
  await versionDb.close();

  process.env.TURSO_DATABASE_URL = DB_URL;
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
