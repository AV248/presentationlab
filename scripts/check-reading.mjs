#!/usr/bin/env node
/**
 * Server-side reading check for the Turso-first content model.
 *
 * Turso is the only presentation source. Supabase remains the identity/profile
 * and username directory; a broken or absent Turso store must not silently
 * read legacy presentation rows from Postgres.
 */
import { createServer } from 'node:http';
import { execFileSync } from 'node:child_process';
import { mkdirSync, rmSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadModule } from './lib/bundle.mjs';
import { createClient } from '@libsql/client';
import { ROOT } from './lib/env.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const WORK = resolve(ROOT, 'node_modules/.pb-check-reading');
const DB_FILE = resolve(WORK, 'reading-room.db');
const DB_URL = `file:${DB_FILE}`;
const PORT = 5179;
let passed = 0;
let failed = 0;
let legacySpeechReads = 0;

function expect(label, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`FAIL  ${label}${detail ? `\n      ${detail}` : ''}`);
  }
}

const HANDLES = [{ username: 'aavrit' }, { username: 'someone' }];
const PROFILES = [
  {
    uid: 'u1', username: 'aavrit', display_name: 'Aavrit', email: 'a@b.c', bio: 'Writes speeches',
    location: 'Kathmandu', website: 'https://example.test', signature: '— A', photo_url: 'https://example.test/a.jpg',
    points: 2, likes_received: 2, dislikes_received: 0, created_at: '2025-12-01T00:00:00.000Z',
  },
];

function selectRows(table, params) {
  let rows = table === 'handles' ? [...HANDLES] : [...PROFILES];
  for (const [key, expression] of params.entries()) {
    if (['select', 'order', 'limit', 'offset'].includes(key)) continue;
    if (key === 'uid' && expression.startsWith('in.(')) {
      const ids = expression.slice(4, -1).split(',').map((value) => value.replace(/^\"|\"$/g, ''));
      rows = rows.filter((row) => ids.includes(String(row.uid ?? '')));
      continue;
    }
    if (expression.startsWith('eq.')) {
      const wanted = expression.slice(3).replace(/^\"|\"$/g, '').toLowerCase();
      rows = rows.filter((row) => String(row[key] ?? '').toLowerCase() === wanted);
    }
  }
  const offset = Number(params.get('offset') ?? 0);
  const limit = Number(params.get('limit') ?? rows.length);
  return rows.slice(offset, offset + limit);
}

const stub = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);
  const table = url.pathname.replace('/rest/v1/', '');
  if (table === 'speeches') {
    legacySpeechReads += 1;
    res.statusCode = 200;
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify([{ id: 'legacy', title: 'Must never be read', status: 'published' }]));
    return;
  }
  if (!['handles', 'profiles'].includes(table)) {
    res.statusCode = 404;
    res.end('[]');
    return;
  }
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(selectRows(table, url.searchParams)));
});

const bundleReader = (variant) => loadModule('src/server/reading.ts', `reading-${variant}`);

async function withEnv(env, variant, body) {
  const saved = { ...process.env };
  for (const key of ['TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'SUPABASE_URL', 'SUPABASE_ANON_KEY']) {
    delete process.env[key];
  }
  Object.assign(process.env, env);
  try {
    await body(await bundleReader(variant));
  } finally {
    process.env = saved;
  }
}

async function seedDatabase(url) {
  execFileSync(process.execPath, [resolve(ROOT, 'scripts/turso/apply.mjs')], {
    env: { ...process.env, TURSO_DATABASE_URL: url, TURSO_AUTH_TOKEN: '' },
    stdio: 'pipe',
  });
  const db = createClient({ url });
  const rows = [
    ['s1', 'u1', 'aavrit', '', 'opening-lines', 'Opening Lines', 'Cached Aavrit', '', '', 'How to begin', 'Begin with a question.', 'General', 'Conference', 'openings', '', '', 1, 'person', '', '', '', 10, 2, 0, 1, '2026-01-03T10:00:00.000Z', '2026-01-04T10:00:00.000Z'],
    ['s2', 'u2', 'someone', 'weddings', 'the-toast', 'The Toast', 'Someone', '', '', 'A toast for a brother', 'Raise your glass to my brother.', 'Wedding', 'Reception', 'toast, family', 'With help', 'Someone', 0, 'person', '', '', '', 3, 1, 0, 0, '2026-02-01T09:00:00.000Z', '2026-02-01T09:00:00.000Z'],
  ];
  const sql = `insert into library (
    id, uid, username, folder, slug, title, author, author_photo_url, author_badges,
    preview, content, category, occasion, tags, credits, signature, allow_copy,
    source_type, source_name, source_url, license, views, likes, dislikes, shares,
    published_at, updated_at
  ) values (${Array.from({ length: 27 }, () => '?').join(', ')})`;
  for (const row of rows) await db.execute({ sql, args: row });
  await db.execute({
    sql: 'insert into author_badges (uid, badge, speech_id, views_at_award, awarded_at) values (?, ?, ?, ?, ?)',
    args: ['u1', 'sole', 's1', 10_000, '2026-03-01T00:00:00.000Z'],
  });
  await db.close();
}

rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });
await new Promise((started) => stub.listen(PORT, '127.0.0.1', started));
const SUPABASE = `http://127.0.0.1:${PORT}`;

try {
  await withEnv({}, 'none', async (reader) => {
    const page = await reader.readLibrary();
    expect('no configuration: the library is honestly unavailable', page.items.length === 0 && page.source === 'none');
    expect('no configuration: one presentation is null', (await reader.readSpeech('s1')) === null);
    expect('no configuration: an unverified handle is unknown', (await reader.readHandleState('aavrit')) === 'unknown');
  });

  await withEnv(
    { VITE_SUPABASE_URL: SUPABASE, VITE_SUPABASE_ANON_KEY: 'anon-key' },
    'profiles-only',
    async (reader) => {
      const page = await reader.readLibrary({ max: 10 });
      expect('Supabase-only: no presentations are returned from the legacy table', page.items.length === 0 && page.source === 'none', JSON.stringify(page));
      expect('Supabase-only: presentation lookup has no fallback', (await reader.readSpeech('legacy')) === null);
      expect('Supabase-only: username management still checks a held handle', (await reader.readHandleState('aavrit')) === 'held');
      expect('Supabase-only: an unheld handle remains available', (await reader.readHandleState('nobody')) === 'free');
      const profile = await reader.readProfile('aavrit');
      expect('Supabase-only: public identity/profile data remains readable', profile?.displayName === 'Aavrit' && profile.location === 'Kathmandu' && profile.photoURL === 'https://example.test/a.jpg');
      expect('Supabase-only: unknown profile is null', (await reader.readProfile('nobody')) === null);
    },
  );
  expect('the public reader never queries Supabase presentation content', legacySpeechReads === 0, `reads: ${legacySpeechReads}`);

  await seedDatabase(DB_URL);

  await withEnv({ TURSO_DATABASE_URL: DB_URL, TURSO_AUTH_TOKEN: '' }, 'turso-only', async (reader) => {
    const page = await reader.readLibrary({ max: 10 });
    expect('Turso-only: the newest published row comes first', page.items[0]?.id === 's2', page.items[0]?.id);
    expect('Turso-only: the source is named accurately', page.source === 'turso');
    expect('Turso-only: SQLite integer maps back to boolean', page.items.find((item) => item.id === 's2')?.allowCopy === false);
    expect('Turso-only: the library returns exactly the shared rows', page.items.length === 2, `got ${page.items.length}`);
    expect('Turso-only: full-text search finds body text', (await reader.searchLibrary('glass')).length === 1);
    expect('Turso-only: an unknown presentation is null', (await reader.readSpeech('nope')) === null);
    expect('Turso-only: writer lookup is case-insensitive', (await reader.readWriter('AAVRIT')).length === 1);
  });

  await withEnv(
    { TURSO_DATABASE_URL: DB_URL, TURSO_AUTH_TOKEN: '', VITE_SUPABASE_URL: SUPABASE, VITE_SUPABASE_ANON_KEY: 'anon-key' },
    'both',
    async (reader) => {
      const page = await reader.readLibrary({ max: 10 });
      const aavrit = page.items.find((item) => item.id === 's1');
      expect('both configured: Turso content is enriched by the Supabase profile', aavrit?.author === 'Aavrit' && aavrit.username === 'aavrit' && aavrit.authorPhotoURL === 'https://example.test/a.jpg');
      expect('Turso award rows enrich the author badges', aavrit?.authorBadges.includes('sole'));
      expect('a writer page uses Turso for work', (await reader.readWriter('someone')).length === 1);
    },
  );

  const broken = `file:${resolve(WORK, 'missing-directory/reading-room.db')}`;
  await withEnv(
    { TURSO_DATABASE_URL: broken, TURSO_AUTH_TOKEN: '', VITE_SUPABASE_URL: SUPABASE, VITE_SUPABASE_ANON_KEY: 'anon-key' },
    'broken-turso',
    async (reader) => {
      const page = await reader.readLibrary({ max: 10 });
      expect('broken Turso: the reader reports no content store instead of falling back', page.items.length === 0 && page.source === 'none');
      expect('broken Turso: one presentation does not fall back to Supabase', (await reader.readSpeech('legacy')) === null);
      expect('broken Turso: writer and search remain empty, not stale', (await reader.readWriter('aavrit')).length === 0 && (await reader.searchLibrary('glass')).length === 0);
    },
  );

  await withEnv({ TURSO_DATABASE_URL: `file:${resolve(WORK, 'empty.db')}`, TURSO_AUTH_TOKEN: '' }, 'selfbuild', async (reader) => {
    const created = await reader.ensureLibrarySchema();
    expect('an authenticated write path can ensure an empty Turso schema', created.ok && created.note === 'applied', created.note);
    const again = await reader.ensureLibrarySchema();
    expect('schema ensure is cached and idempotent', again.ok && again.note === 'already_present', again.note);
  });

  const MIGRATION_DB_URL = `file:${resolve(WORK, 'sample-upgrade.db')}`;
  execFileSync(process.execPath, [resolve(ROOT, 'scripts/turso/apply.mjs')], {
    env: { ...process.env, TURSO_DATABASE_URL: MIGRATION_DB_URL, TURSO_AUTH_TOKEN: '' },
    stdio: 'pipe',
  });
  let migrationDb = createClient({ url: MIGRATION_DB_URL });
  await migrationDb.execute('delete from turso_schema_migrations where version = 2');
  await migrationDb.execute('drop trigger if exists library_safety_sample_ai');
  await migrationDb.execute(`create trigger library_safety_sample_ai after insert on library
    when new.moderation_status = 'published' and new.source_type = 'person' and new.safety_sampled = 0
    begin
      update library set safety_sampled = 1 where id = new.id
        and (select count(*) / 100 from library where moderation_status = 'published')
          > (select count(*) from library where moderation_status = 'published' and source_type = 'person' and safety_sampled = 1);
    end`);
  const migrationInserts = Array.from({ length: 100 }, (_, index) => {
    const number = index + 1;
    return {
      sql: `insert into library (id, uid, username, title, content, source_type, moderation_status, published_at, updated_at)
            values (?, 'writer', 'writer', ?, ?, 'person', 'published', ?, ?)` ,
      args: [
        `upgrade-${String(number).padStart(3, '0')}`,
        `Upgrade ${number}`,
        `Upgrade body ${number}`,
        `2026-10-01T00:${String(Math.floor(number / 60)).padStart(2, '0')}:${String(number % 60).padStart(2, '0')}Z`,
        '2026-10-01T00:00:00Z',
      ],
    };
  });
  await migrationDb.batch(migrationInserts, 'write');
  const oldMembership = await migrationDb.execute('select id from library where safety_sampled = 1');
  expect('old trigger fixture selects its triggering 100th row before upgrade', oldMembership.rows.length === 1 && oldMembership.rows[0]?.id === 'upgrade-100');
  await migrationDb.close();
  await withEnv({ TURSO_DATABASE_URL: MIGRATION_DB_URL, TURSO_AUTH_TOKEN: '' }, 'runtime-sample-upgrade', async (reader) => {
    const upgraded = await reader.ensureLibrarySchema();
    expect('the authenticated runtime path upgrades the old sampling algorithm', upgraded.ok, upgraded.note);
    const db = createClient({ url: MIGRATION_DB_URL });
    const membership = await db.execute('select id from library where safety_sampled = 1 order by published_at, id');
    const version = await db.execute('select count(*) as n from turso_schema_migrations where version = 2');
    expect('runtime trigger upgrade backfills the oldest eligible personal work',
      Number(version.rows[0]?.n) === 1 && membership.rows.length === 1 && membership.rows[0]?.id === 'upgrade-001',
      JSON.stringify(membership.rows.map((row) => row.id)));
    await db.close();
  });

  await withEnv({}, 'split', async (reader) => {
    const body = "create table t (a text);\ncreate function f() returns void language sql as $$\n  select 'a; b'; -- and a comment with ; in it\n$$;\ncreate trigger x after insert on t begin\n  insert into t values (';still here');\nend;\nselect 1;";
    const statements = reader.splitSql(body);
    expect('SQL splitter keeps function and trigger bodies intact', statements.length === 4 && statements[1]?.includes("select 'a; b'") && statements[2]?.includes('still here'));
    const comments = reader.splitSql('-- Handles: the address book; one row per name\ncreate table h (a text);\n/* a block; comment /* nested */ still */\nselect 1;');
    expect('SQL splitter removes prose and preserves nested comments', comments.length === 2 && comments[0].startsWith('create table') && comments[1] === 'select 1');
  });
} catch (error) {
  failed += 1;
  console.log(`FAIL  the server-reading check itself threw\n      ${error?.stack ?? error}`);
} finally {
  stub.close();
  rmSync(WORK, { recursive: true, force: true });
}

console.log(`\nreading: ${passed} passed, ${failed} failed`);
if (failed) {
  console.error('\nThe Turso-first server reader is not behaving.\n');
  process.exit(1);
}
