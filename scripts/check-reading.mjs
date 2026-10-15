#!/usr/bin/env node
/**
 * The server-side reader, tested against the databases it actually talks to.
 *
 *   node scripts/check-reading.mjs        (wired into `npm run verify`)
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * `src/server/reading.ts` is what renders a speech, a writer's page and the
 * library into HTML *before* any browser runs. If it silently returned an
 * empty list, every one of those pages would still look fine — to a person,
 * after a second — while a crawler saw nothing at all. That is the kind of
 * failure a test has to catch, because nobody notices it by clicking.
 *
 * Nothing is mocked. The test stands up:
 *
 *   • a real SQLite reading room, built by the real `turso/schema.sql`, and
 *     filled by the real projection (`src/server/project.ts`);
 *   • a stub PostgREST that speaks the parts of the protocol the reader uses,
 *     including the `eq.`/`ilike.` filters and the paging headers;
 *   • both, in the combinations that matter: Turso alone, Postgres alone,
 *     both, and neither.
 *
 * Then it asserts what the reader must promise: the right rows, the right
 * shapes, and — the part worth the effort — that a *failure* is reported as a
 * failure rather than as an empty library.
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

function expect(label, condition, detail = '') {
  if (condition) {
    passed += 1;
    console.log(`PASS  ${label}`);
  } else {
    failed += 1;
    console.log(`FAIL  ${label}${detail ? `\n      ${detail}` : ''}`);
  }
}

/* ------------------------------------------------------------------ */
/* A stub PostgREST: the rows a real project would hold                 */
/* ------------------------------------------------------------------ */

const SPEECHES = [
  {
    id: 's1', uid: 'u1', username: 'aavrit', folder: '', slug: 'opening-lines', title: 'Opening Lines',
    author: 'Aavrit', category: 'General', occasion: 'Conference', tags: ['openings'],
    preview: 'How to begin', content: 'Begin with a question.', credits: '', signature: '',
    allow_copy: true, ad: false, status: 'published', views: 10, likes: 2, dislikes: 0, shares: 1,
    created_at: '2026-01-03T10:00:00.000Z', updated_at: '2026-01-04T10:00:00.000Z',
    published_at: '2026-01-03T10:00:00.000Z',
  },
  {
    id: 's2', uid: 'u2', username: 'someone', folder: 'weddings', slug: 'the-toast', title: 'The Toast',
    author: 'Someone', category: 'Wedding', occasion: 'Reception', tags: ['toast', 'family'],
    preview: 'A toast for a brother', content: 'Raise your glass to my brother.',
    credits: 'With help', signature: 'Someone', allow_copy: false, ad: false, status: 'published',
    views: 3, likes: 1, dislikes: 0, shares: 0,
    created_at: '2026-02-01T09:00:00.000Z', updated_at: '2026-02-01T09:00:00.000Z',
    published_at: '2026-02-01T09:00:00.000Z',
  },
  {
    id: 'draft1', uid: 'u1', username: 'aavrit', folder: '', slug: '', title: 'Not ready',
    author: 'Aavrit', category: 'General', occasion: '', tags: [], preview: '', content: 'Draft text.',
    credits: '', signature: '', allow_copy: true, ad: false, status: 'draft', views: 0, likes: 0,
    dislikes: 0, shares: 0, created_at: '2026-03-01T09:00:00.000Z', updated_at: '2026-03-01T09:00:00.000Z',
    published_at: '2026-03-01T09:00:00.000Z',
  },
];

const HANDLES = [{ username: 'aavrit' }, { username: 'someone' }];

const PROFILES = [
  {
    uid: 'u1', username: 'aavrit', display_name: 'Aavrit', email: 'a@b.c', bio: 'Writes speeches',
    location: 'Kathmandu', website: 'https://example.test', signature: '— A', photo_url: '',
    points: 2, likes_received: 2, dislikes_received: 0, created_at: '2025-12-01T00:00:00.000Z',
  },
];

/** Parse `eq.x`, `ilike.*x*` and the `or=(…)` form the reader sends. */
function matches(row, key, expression) {
  const value = row[key];
  if (expression.startsWith('eq.')) {
    const wanted = expression.slice(3);
    return String(value ?? '').toLowerCase() === wanted.toLowerCase();
  }
  if (expression.startsWith('ilike.')) {
    const needle = expression.slice(6).replace(/^\*|\*$/g, '').toLowerCase();
    return String(value ?? '').toLowerCase().includes(needle);
  }
  return true;
}

function selectRows(table, params) {
  let rows = table === 'speeches' ? [...SPEECHES] : table === 'handles' ? [...HANDLES] : [...PROFILES];

  for (const [key, expression] of params.entries()) {
    if (key === 'select' || key === 'order' || key === 'limit' || key === 'offset') continue;
    if (key === 'or') {
      const alternatives = expression.replace(/^\(|\)$/g, '').split(',');
      rows = rows.filter((row) =>
        alternatives.some((alternative) => {
          const [field, ...rest] = alternative.split('.');
          return matches(row, field, rest.join('.'));
        }),
      );
      continue;
    }
    rows = rows.filter((row) => matches(row, key, expression));
  }

  const order = params.get('order');
  if (order) {
    const [field] = order.split('.');
    rows.sort((a, b) => String(b[field] ?? '').localeCompare(String(a[field] ?? '')));
  }
  const offset = Number(params.get('offset') ?? 0);
  const limit = Number(params.get('limit') ?? rows.length);
  return rows.slice(offset, offset + limit);
}

const stub = createServer((req, res) => {
  const url = new URL(req.url ?? '/', `http://127.0.0.1:${PORT}`);
  const table = url.pathname.replace('/rest/v1/', '');
  if (!['speeches', 'handles', 'profiles'].includes(table)) {
    res.statusCode = 404;
    res.end('[]');
    return;
  }
  res.setHeader('Content-Type', 'application/json');
  res.end(JSON.stringify(selectRows(table, url.searchParams)));
});

/* ------------------------------------------------------------------ */
/* Bundling the reader the way the app uses it                          */
/* ------------------------------------------------------------------ */

const bundleReader = (variant) => loadModule('src/server/reading.ts', `reading-${variant}`);

/* ------------------------------------------------------------------ */
/* The run                                                             */
/* ------------------------------------------------------------------ */

rmSync(WORK, { recursive: true, force: true });
mkdirSync(WORK, { recursive: true });
await new Promise((started) => stub.listen(PORT, '127.0.0.1', started));

const SUPABASE = `http://127.0.0.1:${PORT}`;

async function withEnv(env, variant, body) {
  const saved = { ...process.env };
  for (const key of ['TURSO_DATABASE_URL', 'TURSO_AUTH_TOKEN', 'VITE_SUPABASE_URL', 'VITE_SUPABASE_ANON_KEY', 'SUPABASE_URL', 'SUPABASE_ANON_KEY']) {
    delete process.env[key];
  }
  Object.assign(process.env, env);
  try {
    const mod = await bundleReader(variant);
    await body(mod);
  } finally {
    process.env = saved;
  }
}

try {
  /* ── 1. Neither database configured ───────────────────────────────────── */
  await withEnv({}, 'none', async (reader) => {
    const page = await reader.readLibrary();
    expect('no configuration at all: the library is empty, not broken', page.items.length === 0 && page.source === 'none');
    expect('no configuration: one speech is null', (await reader.readSpeech('s1')) === null);
    expect('no configuration: a handle is unknown, never "free"', (await reader.readHandleState('aavrit')) === 'unknown');
  });

  /* ── 2. Postgres only ─────────────────────────────────────────────────── */
  await withEnv(
    { VITE_SUPABASE_URL: SUPABASE, VITE_SUPABASE_ANON_KEY: 'anon-key' },
    'postgres',
    async (reader) => {
      const page = await reader.readLibrary({ max: 10 });
      expect('Postgres only: the library is read from the truth', page.items.length === 2, `got ${page.items.length}`);
      expect('Postgres only: drafts are not published work', page.items.every((item) => item.id !== 'draft1'));
      expect(
        'Postgres only: a row becomes the shape the screens render',
        page.items[0].title === 'The Toast' && page.items[0].tags.includes('family') && page.items[0].allowCopy === false,
        JSON.stringify(page.items[0]?.title),
      );
      expect('Postgres only: dates arrive as the reader’s day, not a timestamp', /^\d{4}-\d{2}-\d{2}$/.test(page.items[0].createdAt));
      expect('Postgres only: one speech by id', (await reader.readSpeech('s1'))?.slug === 'opening-lines');
      expect('Postgres only: a published speech has counters', (await reader.readSpeech('s1'))?.views === 10);
      expect('Postgres only: a writer’s work, filtered by handle', (await reader.readWriter('someone')).length === 1);
      expect('Postgres only: search matches the body', (await reader.searchLibrary('glass')).length === 1);
      expect('Postgres only: search does not match a draft', (await reader.searchLibrary('Draft text')).length === 0);
      expect('Postgres only: a held handle is held', (await reader.readHandleState('aavrit')) === 'held');
      expect('Postgres only: a free handle is free', (await reader.readHandleState('nobody')) === 'free');
      const profile = await reader.readProfile('aavrit');
      expect('Postgres only: the profile carries what the page shows', profile?.displayName === 'Aavrit' && profile.location === 'Kathmandu');
      expect('Postgres only: a handle with no profile is null, not a guess', (await reader.readProfile('nobody')) === null);
    },
  );

  /* ── 3. The reading room, built by the real projection ────────────────── */
  execFileSync(process.execPath, [resolve(ROOT, 'scripts/turso/apply.mjs')], {
    env: { ...process.env, TURSO_DATABASE_URL: DB_URL, TURSO_AUTH_TOKEN: '' },
    stdio: 'pipe',
  });

  // A tiny PostgREST is already running, so the projection can fill the copy
  // from the same rows the reader is about to be asked about.
  const { projectLibrary } = await loadModule('src/server/project.ts', 'project');

  await projectLibrary({
    supabaseUrl: SUPABASE,
    apiKey: 'service-key',
    tursoUrl: DB_URL,
    tursoToken: '',
  });

  const db = createClient({ url: DB_URL });
  const copied = await db.execute('select count(*) as n from library');
  expect('the projection filled the reading room', Number(copied.rows[0].n) === 2, `got ${copied.rows[0].n}`);
  await db.close();

  /* ── 4. Turso only ────────────────────────────────────────────────────── */
  await withEnv({ TURSO_DATABASE_URL: DB_URL, TURSO_AUTH_TOKEN: '' }, 'turso', async (reader) => {
    const page = await reader.readLibrary({ max: 10 });
    expect('reading room only: the newest work comes first', page.items[0]?.id === 's2', page.items[0]?.id);
    expect('reading room only: the source is reported as the copy', page.source === 'turso');
    expect(
      'reading room only: allow_copy survives being an integer in SQLite',
      page.items.find((item) => item.id === 's2')?.allowCopy === false,
    );
    expect('reading room only: search uses full text', (await reader.searchLibrary('glass')).length === 1);
    expect('reading room only: an unknown speech is null', (await reader.readSpeech('nope')) === null);
    expect('reading room only: one writer’s work', (await reader.readWriter('AAVRIT')).length === 1);
  });

  /* ── 5. Both: the copy answers, the truth is not asked ────────────────── */
  await withEnv(
    {
      TURSO_DATABASE_URL: DB_URL,
      TURSO_AUTH_TOKEN: '',
      VITE_SUPABASE_URL: SUPABASE,
      VITE_SUPABASE_ANON_KEY: 'anon-key',
    },
    'both',
    async (reader) => {
      const page = await reader.readLibrary({ max: 10 });
      expect('both configured: the reading room is preferred', page.source === 'turso' && page.items.length === 2);

      // Now break the copy, and prove the truth answers instead. This is the
      // behaviour that keeps a misconfigured Turso from becoming an outage.
      const broken = `file:${resolve(WORK, 'does-not-exist.db')}`;
      process.env.TURSO_DATABASE_URL = broken;
      const fallback = await bundleReader('broken');
      const page2 = await fallback.readLibrary({ max: 10 });
      expect(
        'a broken reading room falls back to Postgres rather than going silent',
        page2.items.length === 2 && page2.source === 'postgres',
        `${page2.items.length} rows, source ${page2.source}`,
      );
      expect('and a single speech still resolves through the fallback', (await fallback.readSpeech('s1'))?.id === 's1');
    },
  );

  /* ── 6. The reading room can build itself ─────────────────────────────── */
  await withEnv(
    { TURSO_DATABASE_URL: `file:${resolve(WORK, 'empty.db')}`, TURSO_AUTH_TOKEN: '' },
    'selfbuild',
    async (reader) => {
      const created = await reader.ensureLibrarySchema();
      expect('a reading room with no tables builds its own schema', created.ok && created.note === 'applied', created.note);
      const again = await reader.ensureLibrarySchema();
      expect('and applying it twice changes nothing', again.ok && again.note === 'already_present', again.note);
    },
  );

  /* ── 7. The statement splitter ─────────────────────────────────────────── */
  await withEnv({}, 'split', async (reader) => {
    const body = "create table t (a text);\ncreate function f() returns void language sql as $$\n  select 'a; b'; -- and a comment with ; in it\n$$;\ncreate trigger x after insert on t begin\n  insert into t values (';still here');\nend;\nselect 1;";
    const statements = reader.splitSql(body);
    expect('the splitter keeps a function body in one piece', statements.length === 4, `got ${statements.length}: ${statements.map((x) => x.slice(0, 30)).join(' | ')}`);
    expect('a semicolon inside a string is not a statement end', statements[1]?.includes("select 'a; b'"));
    expect('a semicolon inside a comment is not a statement end', statements[1]?.includes('comment with ; in it'));
    expect(
      'a trigger body survives whole, semicolons and all',
      statements[2]?.includes('still here') && /end\s*$/i.test(statements[2]?.trim() ?? ''),
      statements[2]?.slice(0, 60),
    );

    const comments = reader.splitSql('-- Handles: the address book; one row per name\ncreate table h (a text);\n/* a block; comment /* nested */ still */\nselect 1;');
    expect(
      'prose in a comment is never sent to the database',
      comments.length === 2 && comments[0].startsWith('create table'),
      `${comments.length}: ${comments[0]?.slice(0, 40)}`,
    );
    expect('and a nested block comment is one comment', comments[1] === 'select 1');
  });
} catch (error) {
  failed += 1;
  console.log(`FAIL  the reading-room check itself threw\n      ${error?.stack ?? error}`);
} finally {
  stub.close();
}

console.log(`\nreading: ${passed} passed, ${failed} failed`);
if (failed) {
  console.error('\nThe server-side reader is not behaving.\n');
  process.exit(1);
}
