import type { Client } from '@libsql/client';
import { serverEnv } from './env';

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
  const additions: [string, string][] = [
    ['author_photo_url', "text not null default ''"],
    ['author_badges', "text not null default ''"],
    ['source_type', "text not null default 'person'"],
    ['source_name', "text not null default ''"],
    ['source_url', "text not null default ''"],
    ['license', "text not null default ''"],
  ];
  let applied = 0;
  for (const [name, declaration] of additions) {
    if (present.has(name)) continue;
    await db.execute(`alter table library add column ${name} ${declaration}`);
    applied += 1;
  }
  return applied;
}
