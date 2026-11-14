#!/usr/bin/env node
/**
 * `supabase/schema.sql`, applied to a real Postgres.
 *
 *   npm run check:pg          (part of `npm run verify`)
 *
 * ── Why this exists, and why it is not a text check ─────────────────────────
 * The schema is not applied by a tool. It is pasted into the Supabase SQL
 * Editor by a person — that is the whole browser-only setup path — so the thing
 * that has to work is the *file*, exactly as written, statement by statement in
 * order. `scripts/check-schema.mjs` reads the text (are the tables there, are
 * the policies written); this one runs it, and then calls the functions.
 *
 * PGlite is Postgres compiled to WebAssembly, so this is a real parser, a real
 * planner and a real transaction log. It is not Supabase: the `auth` schema,
 * the three roles and `auth.jwt()` are stood up first, exactly as Supabase
 * provides them, because the file's policies and helpers read them. What is
 * tested is the part that a paste can break.
 *
 * Three questions, in the order a person would ask them:
 *
 *   1. does it apply at all — 111 statements, no failures, nothing dependent on
 *      a statement that has moved;
 *   2. is it complete — a table without RLS is an open door, a missing helper is
 *      a broken policy;
 *   3. does it *work* — sign a session token the way Supabase does, call the
 *      functions, and see the right answers come back.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ROOT } from './lib/env.mjs';
import { loadModule } from './lib/bundle.mjs';

const SCHEMA = resolve(ROOT, 'supabase/schema.sql');
const REQUIRED = process.env.PB_REQUIRE_PG === '1';

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

/* The app's own splitter — the one that also applies turso/schema.sql on the
   server. A second copy here would be a second thing to get wrong. */
const { splitSql } = await loadModule('src/server/sql.ts', 'check-pg');

let PGlite;
try {
  ({ PGlite } = await import('@electric-sql/pglite'));
} catch {
  const note = 'the Postgres schema check needs @electric-sql/pglite (npm install)';
  if (REQUIRED) {
    console.log(`FAIL  ${note}`);
    process.exit(1);
  }
  console.log(`SKIP  ${note}`);
  process.exit(0);
}

/** Everything Supabase provides that a bare Postgres does not. */
async function withSupabasePieces(db) {
  await db.exec('create schema if not exists auth;');
  for (const role of ['anon', 'authenticated', 'service_role']) {
    await db.exec(`create role ${role};`).catch(() => undefined);
  }
  await db.exec('grant usage on schema auth to anon, authenticated, service_role;');
  /*
   * Supabase's own definitions of these three, so a policy or a helper that
   * calls them behaves here exactly as it does there. `auth.jwt()` reads the
   * claims PostgREST puts on the request; `role()` and `email()` read one
   * claim each out of the same document.
   */
  await db.exec(`
    create or replace function auth.jwt() returns jsonb
    language sql stable as $$
      select coalesce(
        nullif(current_setting('request.jwt.claims', true), '')::jsonb,
        '{}'::jsonb
      )
    $$;
    create or replace function auth.uid() returns uuid
    language sql stable as $$
      select (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')::uuid
    $$;
    create or replace function auth.role() returns text
    language sql stable as $$
      select coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', 'anon')
    $$;
    create or replace function auth.email() returns text
    language sql stable as $$
      select nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'email'
    $$;`);
}

/** Apply the file statement by statement, and report what broke. */
async function applyFile(db, sql) {
  const statements = splitSql(sql);
  let applied = 0;
  const skipped = [];
  const failures = [];

  for (const statement of statements) {
    /*
     * PGlite ships no pgcrypto control file — and does not need one, since
     * `gen_random_uuid()` is core in Postgres 13+, which is what Supabase runs.
     * The extension stays in the file because creating it is what makes the
     * same schema work on an older database.
     *
     * The statement may carry its own comment above it, so the test looks at
     * the first line that is actually code.
     */
    const code = statement
      .split('\n')
      .filter((line) => line.trim() && !line.trim().startsWith('--'))
      .join('\n');
    if (/^\s*create extension[^;]*pgcrypto/i.test(code)) {
      skipped.push('create extension pgcrypto');
      continue;
    }
    try {
      await db.exec(statement);
      applied += 1;
    } catch (error) {
      failures.push({ statement, message: error.message });
    }
  }
  return { statements, applied, skipped, failures };
}

const sql = readFileSync(SCHEMA, 'utf8');

/* ── 1. It applies ─────────────────────────────────────────────────────── */

const db = new PGlite();
await withSupabasePieces(db);
db.exec(`reset all;`).catch(() => undefined);

const first = await applyFile(db, sql);

if (first.failures.length) {
  console.log('\n  Statements Postgres refused:\n');
  for (const failure of first.failures.slice(0, 8)) {
    const line = failure.statement.split('\n').find((l) => l.trim() && !l.trim().startsWith('--')) ?? '';
    console.log(`  ✗ ${line.slice(0, 110)}`);
    console.log(`    ${failure.message}\n`);
  }
}
expect(
  'the schema applies as a plain paste — every statement, in order',
  first.failures.length === 0,
  `${first.applied}/${first.statements.length} applied, ${first.failures.length} failed`,
);
expect('and it is not a handful of statements pretending to be a schema', first.applied >= 100, `${first.applied} applied`);

/* ── 2. It is complete ─────────────────────────────────────────────────── */

const tables = await db.query(`
  select c.relname as name, c.relrowsecurity as rls
  from pg_class c join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relkind = 'r' order by 1`);
const functions = await db.query(`
  select proname as name from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' order by 1`);
const policies = await db.query(`
  select tablename as table, count(*)::int as n from pg_policies
  where schemaname = 'public' group by 1 order by 1`);

const names = tables.rows.map((t) => t.name);
const openTables = tables.rows.filter((t) => !t.rls).map((t) => t.name);
const have = new Set(functions.rows.map((f) => f.name));
const needed = [
  'current_uid', 'current_email', 'is_admin', 'is_site_owner', 'bootstrap_owner',
  'username_taken', 'bump_counter', 'sync_reaction_counts', 'react_to_speech',
  'record_share', 'touch_updated_at',
];
const missing = needed.filter((name) => !have.has(name));

expect('it creates the library tables', names.includes('speeches') && names.includes('profiles') && names.length >= 10, `${names.length} tables: ${names.join(', ')}`);
expect('every table has row level security on', openTables.length === 0, `off on: ${openTables.join(', ') || 'none'}`);
expect('every table is actually protected by a policy', policies.rows.length >= names.length, `${policies.rows.length} policies across ${names.length} tables`);
expect('every helper the policies call exists', missing.length === 0, `missing: ${missing.join(', ')}`);
/*
 * Search is the reading room's job (Turso, with FTS5), and this schema is
 * deliberately not a second copy of it. What matters here is the *shape* the
 * app reads: the reader and the projection both select these columns by name,
 * and a rename that nobody updated would break published work silently.
 */
const speechColumns = await db.query(`
  select column_name as name from information_schema.columns
  where table_schema = 'public' and table_name = 'speeches'`);
const columns = new Set(speechColumns.rows.map((c) => c.name));
const neededColumns = [
  'id', 'uid', 'username', 'folder', 'slug', 'title', 'author', 'category', 'occasion',
  'tags', 'preview', 'content', 'credits', 'signature', 'allow_copy', 'ad', 'status',
  'views', 'likes', 'dislikes', 'shares', 'created_at', 'updated_at', 'published_at',
];
const missingColumns = neededColumns.filter((name) => !columns.has(name));
expect(
  'the speech table has every column the reader selects',
  missingColumns.length === 0,
  `missing: ${missingColumns.join(', ')}`,
);

/* ── 3. It is idempotent — the second paste must not fail ──────────────── */

const second = await applyFile(db, sql);
expect(
  'applying it a second time changes nothing and breaks nothing',
  second.failures.length === 0,
  second.failures.map((f) => f.message).join(' | '),
);

/* ── 4. It works — a session, the way Supabase makes one ───────────────── */

/** Set the JWT the way PostgREST does, for a signed-in visitor. */
const AMA = '11111111-1111-4111-8111-111111111111';
const BHIM = '22222222-2222-4222-8222-222222222222';

async function signIn(uid, email = '') {
  await db.exec(
    `select set_config('request.jwt.claims', '${JSON.stringify({ sub: uid, email, role: 'authenticated' })}', false);`,
  );
}

await db.exec(`
  insert into public.profiles (uid, username, display_name)
  values ('${AMA}', 'ama', 'Ama'), ('${BHIM}', 'bhim', 'Bhim')
  on conflict (uid) do nothing;

  insert into public.handles (username, uid)
  values ('ama', '${AMA}'), ('bhim', '${BHIM}')
  on conflict (username) do nothing;`);

await signIn(AMA, 'ama@example.test');
const me = await db.query(`select public.current_uid() as uid, public.current_email() as email`);
expect(
  'a signed-in session is readable by the policies',
  me.rows[0].uid === AMA && me.rows[0].email === 'ama@example.test',
  JSON.stringify(me.rows[0]),
);

/*
 * Handles are stored lowercase — the table's own check constraint enforces it
 * — and `username_taken()` is an exact lookup, deliberately. It is the app's
 * normaliser that makes what a person typed safe, so the pair is what gets
 * tested: the database as written, and the function that feeds it.
 */
const { normalizeUsername } = await loadModule('src/lib/identity.ts', 'check-pg-identity');
const typed = '  @Ama ';
expect(
  'a handle held reads as taken, once the app has normalised what was typed',
  (await db.query(`select public.username_taken('${normalizeUsername(typed)}') as t`)).rows[0].t === true,
  `normalizeUsername('${typed}') → '${normalizeUsername(typed)}'`,
);
expect('a free handle reads as free', (await db.query(`select public.username_taken('nobody') as t`)).rows[0].t === false);
expect(
  'and the database refuses a handle shaped like nothing this site allows',
  await db
    .exec(`insert into public.handles (username) values ('Not A Handle');`)
    .then(() => false)
    .catch(() => true),
);

const owner = await db.query(`select public.is_admin() as admin, public.is_site_owner() as owner`);
expect('a member is not an owner', owner.rows[0].admin === false && owner.rows[0].owner === false, JSON.stringify(owner.rows[0]));

await db.exec(`select public.bootstrap_owner('${AMA}', 'ama@example.test');`);
const promoted = await db.query(`select public.is_admin() as admin, public.is_site_owner() as owner`);
expect('and the owner promoted by bootstrap_owner() is one', promoted.rows[0].admin === true && promoted.rows[0].owner === true, JSON.stringify(promoted.rows[0]));

await db.exec(`
  insert into public.speeches (id, uid, username, slug, title, content, status)
  values ('s1', '${AMA}', 'ama', 'a-speech', 'A Speech', 'The room is decided before you speak.', 'published')
  on conflict do nothing;`);

await db.query(`select public.admin_set_badge('person', '${AMA}', 'quintal', 'grant', 'criteria met')`);
const quintal = await db.query(`select active, reason from public.badge_assignments where principal_id = '${AMA}' and badge = 'quintal'`);
const badgeGrantAudit = await db.query(`select count(*)::int as n from public.badge_audit where principal_id = '${AMA}' and badge = 'quintal' and action = 'grant'`);
expect(
  'an administrator can grant a person badge and keep an audit record',
  quintal.rows[0]?.active === true && quintal.rows[0]?.reason === 'criteria met' && badgeGrantAudit.rows[0]?.n === 1,
  JSON.stringify({ assignment: quintal.rows[0], audit: badgeGrantAudit.rows[0] }),
);

await db.exec(`insert into public.official_accounts (slug, display_name) values ('wikisource', 'Wikisource') on conflict do nothing;`);
await db.query(`select public.admin_set_badge('official', 'wikisource', 'grey', 'grant', 'vetted source')`);
await db.exec(`update public.official_accounts set active = false where slug = 'wikisource';`);
let greyRevoked = true;
try {
  await db.query(`select public.admin_set_badge('official', 'wikisource', 'grey', 'revoke', 'source retired')`);
} catch {
  greyRevoked = false;
}
const grey = await db.query(`select active from public.badge_assignments where principal_type = 'official' and principal_id = 'wikisource' and badge = 'grey'`);
expect(
  'Grey belongs only to official accounts and can be revoked after a source retires',
  greyRevoked && grey.rows[0]?.active === false,
  JSON.stringify(grey.rows[0]),
);

await signIn(BHIM, 'bhim@example.test');
let nonAdminBadgeBlocked = false;
try {
  await db.query(`select public.admin_set_badge('person', '${AMA}', 'sole', 'grant', 'forged')`);
} catch {
  nonAdminBadgeBlocked = true;
}
expect('a regular member cannot grant badges or write the audit', nonAdminBadgeBlocked);
await signIn(AMA, 'ama@example.test');

await db.exec(`insert into public.presentation_actions (uid, presentation_id, action) values ('${AMA}', 's1', 'read'), ('${AMA}', 's1', 'rehearse');`);
const actions = await db.query(`select count(*)::int as n from public.presentation_actions where uid = '${AMA}' and presentation_id = 's1'`);
const duplicateActionBlocked = await db
  .exec(`insert into public.presentation_actions (uid, presentation_id, action) values ('${AMA}', 's1', 'read')`)
  .then(() => false)
  .catch(() => true);
expect(
  'read and rehearsal evidence are distinct and each is deduplicated per work',
  actions.rows[0]?.n === 2 && duplicateActionBlocked,
  JSON.stringify({ rows: actions.rows[0]?.n, duplicateActionBlocked }),
);

await db.query(`select public.bump_counter('s1', 'views')`);
const counted = await db.query(`select views from public.speeches where id = 's1'`);
expect('a view is counted', Number(counted.rows[0].views) >= 1, `views=${counted.rows[0]?.views}`);

await db.query(`select public.record_share('s1')`);
const shared = await db.query(`select shares from public.speeches where id = 's1'`);
expect('sharing is recorded', Number(shared.rows[0].shares) >= 1, `shares=${shared.rows[0]?.shares}`);

/* A reaction is the one path that writes two tables in one call: the row that
   records who felt what, and the counter a reader sees. */
await db.query(`select public.react_to_speech('s1', 'like')`);
const reacted = await db.query(`select likes, dislikes from public.speeches where id = 's1'`);
expect('reacting to a speech moves its counter', Number(reacted.rows[0].likes) >= 1, `likes=${reacted.rows[0]?.likes}`);
await db.query(`select public.react_to_speech('s1', 'like')`);
const flipped = await db.query(`select likes, dislikes from public.speeches where id = 's1'`);
expect(
  'reacting the same way twice is a change of mind, not two likes',
  Number(flipped.rows[0].likes) === 0 && Number(flipped.rows[0].dislikes) === 0,
  `likes=${flipped.rows[0]?.likes} dislikes=${flipped.rows[0]?.dislikes}`,
);

/* The other half of the same promise: a signed-out visitor must not be able to
   write anything, whatever the client says. */
await db.exec(`select set_config('request.jwt.claims', '{}', false);`);
let blocked = false;
try {
  await db.exec(`
    set local role authenticated;
    insert into public.speeches (id, uid, username, slug, title, content, status)
    values ('s2', '${BHIM}', 'bhim', 'theirs', 'Theirs', 'not mine', 'published');`);
} catch {
  blocked = true;
} finally {
  await db.exec(`reset role;`).catch(() => undefined);
}
expect('a visitor cannot publish a speech as somebody else', blocked, 'the insert was allowed');

console.log(`\nschema: ${passed} passed, ${failed} failed`);
await db.close();

if (failed) {
  console.error('\nsupabase/schema.sql is not safe to paste.\n');
  process.exit(1);
}
