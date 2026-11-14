import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  mapSpeechRow,
  speechRowFromLibrary,
  type CloudSpeech,
  type SpeechRow,
} from '@/lib/speech';
import { ensureLibraryColumns, toMatchQuery, turso, TURSO_CONFIGURED } from './turso';
import { serverEnvAny } from './env';
import { splitSql } from './sql';

/**
 * Public presentation reads, on the server.
 *
 * Turso is the authoritative store for every explicitly shared presentation.
 * Supabase is consulted only to enrich the public author corner with profile
 * data; it is never a content fallback. If Turso is unavailable, the library
 * reports that honestly instead of silently reading a second source of truth.
 */
const REVALIDATE_SECONDS = 60;
const READ_TIMEOUT_MS = 3000;
const SUPABASE_URL = serverEnvAny('VITE_SUPABASE_URL', 'SUPABASE_URL').replace(/\/+$/, '');
const SUPABASE_ANON_KEY = serverEnvAny('VITE_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY');

/** Kept as a Supabase/profile readiness flag for handle and author lookups. */
export const POSTGRES_CONFIGURED = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

export type LibraryQuery =
  | { kind: 'one'; id: string }
  | { kind: 'writer'; username: string; max: number }
  | { kind: 'search'; term: string; max: number }
  | { kind: 'list'; max: number; offset: number };

async function tursoRead(query: LibraryQuery): Promise<CloudSpeech[] | null> {
  if (!TURSO_CONFIGURED) return null;
  const db = await turso();
  if (!db) return null;
  try {
    let sql: string;
    let args: (string | number)[];
    switch (query.kind) {
      case 'one':
        sql = 'select * from library where id = ?';
        args = [query.id];
        break;
      case 'writer':
        sql = 'select * from library where lower(username) = ? order by published_at desc limit ?';
        args = [query.username, query.max];
        break;
      case 'search': {
        const match = toMatchQuery(query.term);
        if (!match) return [];
        sql = `select library.* from library_fts join library on library.rowid = library_fts.rowid
               where library_fts match ? order by bm25(library_fts) limit ?`;
        args = [match, query.max];
        break;
      }
      default:
        sql = 'select * from library order by published_at desc limit ? offset ?';
        args = [query.max, query.offset];
        break;
    }
    const result = await db.execute({ sql, args });
    const rows = result.rows as unknown as SpeechRow[];
    const items = rows.map((row) => mapSpeechRow(String(row.id ?? ''), speechRowFromLibrary(row)));
    return await enrichAuthors(items, db);
  } catch {
    return null;
  } finally {
    db.close();
  }
}

/**
 * Profile data lives in Supabase. Fetch it in one public read for this page and
 * merge it into the content rows; Turso keeps only a display cache as fallback.
 */
async function enrichAuthors(items: CloudSpeech[], db?: Awaited<ReturnType<typeof turso>>): Promise<CloudSpeech[]> {
  const uids = [...new Set(items.map((item) => item.uid).filter(Boolean))];
  if (!uids.length) return items;
  const directory = new Map<string, { displayName?: string; username?: string; photoURL?: string; badges?: string[] }>();

  if (POSTGRES_CONFIGURED) {
    try {
      const url = new URL('/rest/v1/profiles', SUPABASE_URL);
      url.searchParams.set('select', 'uid,display_name,username,photo_url');
      url.searchParams.set('uid', `in.(${uids.map((uid) => `\"${uid.replaceAll('\"', '')}\"`).join(',')})`);
      const response = await fetch(url, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(READ_TIMEOUT_MS),
        next: { revalidate: REVALIDATE_SECONDS },
      });
      if (response.ok) {
        const profiles = (await response.json()) as SpeechRow[];
        for (const profile of profiles) {
          const uid = String(profile.uid ?? '');
          directory.set(uid, {
            displayName: String(profile.display_name ?? '') || undefined,
            username: String(profile.username ?? '') || undefined,
            photoURL: String(profile.photo_url ?? '') || undefined,
            badges: [],
          });
        }
      }
    } catch {
      // The published row carries a last-known public author corner.
    }
  }

  // Sole is awarded and retained with the Turso view record, so it remains
  // available even when Supabase is having a quiet moment.
  if (db) {
    try {
      const result = await db.execute({
        sql: `select uid, badge from author_badges where uid in (${uids.map(() => '?').join(',')})`,
        args: uids,
      });
      for (const row of result.rows as unknown as SpeechRow[]) {
        const uid = String(row.uid ?? '');
        const current = directory.get(uid) ?? {};
        const badges = new Set([...(current.badges ?? []), String(row.badge ?? '')].filter(Boolean));
        directory.set(uid, { ...current, badges: [...badges] });
      }
    } catch {
      /* older/local schemas may not have the optional awards table yet */
    }
  }

  return items.map((item) => {
    const profile = directory.get(item.uid);
    return profile ? {
      ...item,
      author: profile.displayName || item.author,
      username: profile.username || item.username,
      authorPhotoURL: profile.photoURL || item.authorPhotoURL,
      authorBadges: [...new Set([...(item.authorBadges ?? []), ...(profile.badges ?? [])])],
    } : item;
  });
}

async function read(query: LibraryQuery): Promise<{ items: CloudSpeech[]; source: LibrarySource }> {
  const items = await tursoRead(query);
  return items === null ? { items: [], source: 'none' } : { items, source: 'turso' };
}

export type LibrarySource = 'turso' | 'none';

export interface LibraryPage {
  items: CloudSpeech[];
  source: LibrarySource;
}

/** Published presentations, newest first. */
export async function readLibrary(options: { max?: number; offset?: number } = {}): Promise<LibraryPage> {
  const max = Math.min(Math.max(options.max ?? 24, 1), 200);
  const offset = Math.max(options.offset ?? 0, 0);
  return read({ kind: 'list', max, offset });
}

/** One presentation by stable id. */
export async function readSpeech(id: string): Promise<CloudSpeech | null> {
  return (await readSpeechResult(id)).speech;
}

export async function readSpeechResult(id: string): Promise<{ speech: CloudSpeech | null; source: LibrarySource }> {
  if (!id) return { speech: null, source: 'none' };
  const { items, source } = await read({ kind: 'one', id });
  return { speech: items[0] ?? null, source };
}

/** One writer's published work. */
export async function readWriter(username: string, max = 60): Promise<CloudSpeech[]> {
  const handle = username.trim().toLowerCase();
  if (!handle) return [];
  return (await read({ kind: 'writer', username: handle, max })).items;
}

/** Full-text search over Turso's FTS5 index. */
export async function searchLibrary(term: string, max = 50): Promise<CloudSpeech[]> {
  const trimmed = term.trim();
  if (!trimmed) return [];
  return (await read({ kind: 'search', term: trimmed, max })).items;
}

/* ------------------------------------------------------------------ */
/* Handles and profiles — public reads, one row each                    */
/* ------------------------------------------------------------------ */

export type HandleState = 'held' | 'free' | 'unknown';

/**
 * The public half of a profile — exactly the shape the screen already renders.
 *
 * Kept structurally identical to `PublicProfile` in `src/services/profiles.ts`
 * on purpose: the server hands its answer straight to the client component as
 * initial state, so a field that exists in one and not the other would show up
 * as a name or a bio that appears and then vanishes on hydration.
 */
export interface PublicProfile {
  username: string;
  uid: string;
  displayName: string;
  bio: string;
  location: string;
  website: string;
  signature: string;
  createdAt: string;
  photoURL: string;
  points: number;
  likesReceived: number;
  dislikesReceived: number;
}

/**
 * Is this handle taken?
 *
 * `unknown` is a real answer and is kept distinct from `free` on purpose: a
 * read that failed must never be reported as "nobody holds this name", because
 * the page that says so looks identical to the page for a handle that really
 * is unclaimed.
 */
export async function readHandleState(username: string): Promise<HandleState> {
  const handle = username.trim().toLowerCase();
  if (!handle) return 'unknown';
  if (!POSTGRES_CONFIGURED) return 'unknown';

  try {
    const url = new URL('/rest/v1/handles', SUPABASE_URL);
    url.searchParams.set('select', 'username');
    url.searchParams.set('username', `eq.${handle}`);
    url.searchParams.set('limit', '1');

    const response = await fetch(url, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(READ_TIMEOUT_MS),
      next: { revalidate: 30 },
    });
    if (!response.ok) return 'unknown';
    const rows = (await response.json()) as unknown[];
    return rows.length ? 'held' : 'free';
  } catch {
    return 'unknown';
  }
}

/** One public profile row — the bio, the name, the counters. */
export async function readProfile(username: string): Promise<PublicProfile | null> {
  const handle = username.trim().toLowerCase();
  if (!handle || !POSTGRES_CONFIGURED) return null;

  try {
    const url = new URL('/rest/v1/profiles', SUPABASE_URL);
    url.searchParams.set('select', '*');
    url.searchParams.set('username', `eq.${handle}`);
    url.searchParams.set('limit', '1');

    const response = await fetch(url, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
        Accept: 'application/json',
      },
      signal: AbortSignal.timeout(READ_TIMEOUT_MS),
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!response.ok) return null;
    const rows = (await response.json()) as SpeechRow[];
    const row = rows[0];
    if (!row) return null;

    return {
      username: handle,
      uid: String(row.uid ?? ''),
      displayName: String(row.display_name ?? handle),
      bio: String(row.bio ?? ''),
      location: String(row.location ?? ''),
      website: String(row.website ?? ''),
      signature: String(row.signature ?? ''),
      createdAt: String(row.created_at ?? ''),
      photoURL: String(row.photo_url ?? ''),
      points: Number(row.points ?? 0),
      likesReceived: Number(row.likes_received ?? 0),
      dislikesReceived: Number(row.dislikes_received ?? 0),
    };
  } catch {
    return null;
  }
}

/* ------------------------------------------------------------------ */
/* The reading room's own schema                                        */
/* ------------------------------------------------------------------ */

let schemaChecked = false;
let schemaPromise: Promise<{ ok: boolean; applied: number; note: string }> | null = null;

/**
 * Make sure the reading room has its tables, then say whether it does.
 *
 * ── Why the app is allowed to do this ───────────────────────────────────────
 * It is the project's own schema file, every statement in it is `if not
 * exists`, and it creates empty tables — there is nothing to overwrite and
 * nothing to leak. The alternative is what actually happened: a setup step
 * that needs a terminal on somebody's laptop, and a reading room that stays
 * empty until they find one.
 *
 * It runs at most once per process, and only while handling a verified,
 * explicit share or edit. A public read never creates or mutates anything.
 */
export async function ensureLibrarySchema(): Promise<{ ok: boolean; applied: number; note: string }> {
  if (!TURSO_CONFIGURED) return { ok: false, applied: 0, note: 'turso_not_configured' };
  if (schemaChecked) return { ok: true, applied: 0, note: 'already_present' };
  if (schemaPromise) return schemaPromise;

  schemaPromise = (async () => {
    const db = await turso();
    if (!db) {
      schemaPromise = null;
      return { ok: false, applied: 0, note: 'turso_unreachable' };
    }

    try {
      const file = resolve(process.cwd(), 'turso/schema.sql');
      const statements = splitSql(readFileSync(file, 'utf8'));
      // The statements are idempotent. Running them also creates auxiliary
      // tables (read de-duplication and permanent awards) on older installations.
      for (const statement of statements) await db.execute(statement);
      // CREATE TABLE IF NOT EXISTS does not add columns to an existing table.
      // These ALTERs are additive and preserve all existing presentation rows.
      const columnsAdded = await ensureLibraryColumns(db);

      schemaChecked = true;
      return { ok: true, applied: statements.length + columnsAdded, note: 'applied' };
    } catch (error) {
      return { ok: false, applied: 0, note: (error as Error).message };
    } finally {
      db.close();
      schemaPromise = null;
    }
  })();
  return schemaPromise;
}

export const schemaReady = () => schemaChecked;

/**
 * Split a SQL file into statements.
 *
 * Only what this repository's schema needs: semicolons outside strings, outside
 * quoted identifiers, and outside `begin … end` trigger bodies. It refuses to
 * guess at anything else, which is why it is sixteen lines rather than a SQL
 * parser. `scripts/turso/apply.mjs` splits the same file the same way.
 */

/**
 * The splitter lives in `src/server/sql.ts`, with the schemas it has to survive.
 * Re-exported here because this is where the schema application happens.
 */
export { splitSql } from './sql';
