import type { Client } from '@libsql/client';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { serverEnv } from './env';
import { splitSql } from './sql';

/**
 * The Turso connection, on the server.
 *
 * One place decides how the reading room is reached, because two things now
 * read it: `GET /api/library` (the browser asking for a page of results) and
 * the server components that render published work into HTML before the
 * browser exists.
 *
 * The token lives here and nowhere else. It is never in a `VITE_` variable, so
 * it cannot reach a visitor's bundle, and `npm run audit:secrets` fails the
 * build if that ever changes.
 */

export const TURSO_URL = serverEnv('TURSO_DATABASE_URL');
export const TURSO_TOKEN = serverEnv('TURSO_AUTH_TOKEN');

/**
 * Is the reading room configured?
 *
 * A remote `libsql://` database needs both halves — the URL and a token — and
 * one without the other is a configuration mistake rather than a setup choice.
 *
 * A `file:` database is the exception, and deliberately so: it is what makes
 * the whole read path testable, and runnable locally, without a Turso account.
 * `scripts/turso/apply.mjs` has said so since the beginning; the reader agrees
 * with it now.
 */
export const TURSO_CONFIGURED = Boolean(TURSO_URL && (TURSO_TOKEN || TURSO_URL.startsWith('file:')));

/** One connection per request is plenty — the client pools internally. */
export async function turso(): Promise<Client | null> {
  if (!TURSO_CONFIGURED) return null;
  try {
    const { createClient } = await import('@libsql/client');
    return createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });
  } catch {
    // The library reports itself unavailable rather than consulting a second
    // presentation-content store; Turso remains the single source of truth.
    return null;
  }
}

/** A row of the reading room, as SQLite hands it over. */
export type LibraryRow = Record<string, unknown>;

/**
 * FTS5 rejects bare punctuation and can be *made* to mean something if a query
 * is passed through unescaped, so every term is quoted and the terms are
 * joined with AND. `"dragon's" breath` becomes `"dragon" AND "s" AND "breath"`
 * rather than a syntax error or a wildcard nobody asked for.
 */
export function toMatchQuery(term: string): string {
  return term
    .replace(/[^a-z0-9\s]/gi, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 1)
    .slice(0, 8)
    .map((word) => `"${word}"`)
    .join(' AND ');
}

/**
 * Is the reading room's schema actually there?
 *
 * `turso/schema.sql` is idempotent, so this question has exactly one useful
 * answer: if the table is missing, applying the file is safe and cannot
 * destroy anything. `ensureLibrary()` below acts on that — which is what
 * removes the "run this command on your machine first" step from setup.
 */
export async function libraryTableExists(db: Client): Promise<boolean> {
  try {
    const result = await db.execute(
      "select count(*) as n from sqlite_master where type in ('table','view') and name in ('library','library_fts')",
    );
    return Number((result.rows[0] as unknown as { n: number })?.n ?? 0) >= 2;
  } catch {
    return false;
  }
}

/** Upgrade the original read-copy table in place, without dropping rows. */
export async function ensureLibraryColumns(db: Client): Promise<number> {
  const info = await db.execute('pragma table_info(library)');
  const present = new Set(info.rows.map((row) => String((row as Record<string, unknown>).name ?? '')));
  const needsSafetySampleUpgrade = !present.has('safety_sampled');
  const additions: [string, string][] = [
    ['author_photo_url', "text not null default ''"],
    ['author_badges', "text not null default ''"],
    ['source_type', "text not null default 'person'"],
    ['source_name', "text not null default ''"],
    ['source_url', "text not null default ''"],
    ['source_title', "text not null default ''"],
    ['source_fetched_at', "text not null default ''"],
    ['license', "text not null default ''"],
    ['official_slug', "text not null default ''"],
    ['source_item_id', "text not null default ''"],
    ['moderation_status', "text not null default 'published'"],
    ['moderation_note', "text not null default ''"],
    ['featured', 'integer not null default 0'],
    ['safety_sampled', 'integer not null default 0'],
  ];
  let applied = 0;
  for (const [name, declaration] of additions) {
    if (present.has(name)) continue;
    await db.execute(`alter table library add column ${name} ${declaration}`);
    applied += 1;
  }
  // These indexes refer to additive columns. Create them only after an old
  // library table has been upgraded, never midway through the schema paste.
  await db.execute('create index if not exists library_public_recent_idx on library (moderation_status, published_at desc)');
  await db.execute('create index if not exists library_official_idx on library (official_slug, published_at desc)');
  await db.execute('create index if not exists library_writer_recent_idx on library (lower(username), moderation_status, published_at desc, id desc)');
  await db.execute('create index if not exists library_writer_address_idx on library (lower(username), folder, slug, moderation_status, published_at desc)');

  // A legacy table may already have rows but no FTS index yet. Rebuild once
  // before safety backfill updates touch the table-wide FTS update trigger.
  if (needsSafetySampleUpgrade) {
    await db.execute("insert into library_fts (library_fts) values ('rebuild')");
  }

  // Upgrade old sampling triggers once. Existing deployments may already have
  // the same trigger names with older bodies, so CREATE TRIGGER IF NOT EXISTS
  // alone would silently preserve their old selection behavior. The trigger
  // replacement and deterministic backfill are committed atomically.
  const triggerNames = [
    'library_safety_sample_ai',
    'library_safety_sample_au',
    'library_safety_sample_ad',
  ];
  const samplingSql = readFileSync(resolve(process.cwd(), 'turso/safety-sampling.sql'), 'utf8');
  const migration = await db.transaction('write');
  try {
    const currentVersion = await migration.execute({
      sql: 'select count(*) as n from turso_schema_migrations where version = 2',
    });
    const installedTriggers = await migration.execute({
      sql: `select count(*) as n from sqlite_master where type = 'trigger' and name in (${triggerNames.map(() => '?').join(', ')})`,
      args: triggerNames,
    });
    const versionApplied = Number((currentVersion.rows[0] as Record<string, unknown> | undefined)?.n ?? 0) === 1;
    const triggersComplete = Number((installedTriggers.rows[0] as Record<string, unknown> | undefined)?.n ?? 0) === triggerNames.length;
    if (!versionApplied || !triggersComplete) {
      for (const name of triggerNames) await migration.execute(`drop trigger if exists ${name}`);
      for (const statement of splitSql(samplingSql)) await migration.execute(statement);
      await migration.execute({
        sql: `insert into turso_schema_migrations (version, applied_at) values (2, ?)
              on conflict (version) do update set applied_at = excluded.applied_at`,
        args: [new Date().toISOString()],
      });
    }
    await migration.commit();
  } catch (error) {
    await migration.rollback();
    throw error;
  }
  return applied;
}
