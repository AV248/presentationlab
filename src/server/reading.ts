import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  mapSpeechRow,
  speechRowFromLibrary,
  speechRowFromPostgres,
  type CloudSpeech,
  type SpeechRow,
} from '@/lib/speech';
import { libraryTableExists, toMatchQuery, turso, TURSO_CONFIGURED } from './turso';
import { serverEnvAny } from './env';
import { splitSql } from './sql';

/**
 * Reading, on the server.
 *
 * ── What this is for ────────────────────────────────────────────────────────
 * Everything a visitor can read without signing in — the published library,
 * one speech, one writer's page — should exist as HTML before the browser runs.
 * That is what makes a shared link open instantly, what lets a crawler read the
 * actual text, and what means a slow phone on a bad connection still sees the
 * speech rather than a spinner.
 *
 * Before this module the browser did all of it: the page arrived empty and the
 * text appeared once JavaScript had fetched it. The browser still fetches —
 * that is how the app stays live — but it no longer *has* to.
 *
 * ── Two sources, one answer ─────────────────────────────────────────────────
 *   • **Turso** (the reading room) is asked first: it is a copy of published
 *     rows, built for exactly this read, and it is close to the reader.
 *   • **Postgres** (the truth) answers when Turso is not configured, or is
 *     unreachable, or does not have its schema yet.
 *
 * A reader never learns which one answered, and never gets a partial answer:
 * a failed read returns null or an empty list, and the screen renders the
 * honest empty state.
 *
 * ── Caching ─────────────────────────────────────────────────────────────────
 * `REVALIDATE_SECONDS` is how long a page of the library may be reused before
 * the read happens again. It is deliberately short (a minute): publishing is
 * meant to be visible almost at once, and one minute of staleness on a *list*
 * is invisible to a reader who can already open the speech itself.
 */

const REVALIDATE_SECONDS = 60;

/** Nothing on this path may hold a page hostage. */
const READ_TIMEOUT_MS = 3000;

/**
 * The public Postgres read: the anon key, which the policies already allow.
 *
 * Read through `serverEnv` rather than directly, because this file runs on the
 * server while those variables are inlined at build time for the browser — see
 * `src/server/env.ts` for why that distinction decides whether a deployment
 * talks to the database it was actually given.
 */
const SUPABASE_URL = serverEnvAny('VITE_SUPABASE_URL', 'SUPABASE_URL').replace(/\/+$/, '');
const SUPABASE_ANON_KEY = serverEnvAny('VITE_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY');

export const POSTGRES_CONFIGURED = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/* ------------------------------------------------------------------ */
/* Postgres, over the REST API the app already uses                    */
/* ------------------------------------------------------------------ */

/**
 * One PostgREST read of `speeches`, filtered to published work.
 *
 * `select=*` deliberately: naming columns here would mean a second field
 * mapping to keep in step with `src/lib/speech.ts`, and a column added to the
 * schema would silently vanish from the site until somebody remembered this
 * file.
 */
async function postgresSpeeches(
  params: Record<string, string>,
  signal: AbortSignal,
): Promise<CloudSpeech[] | null> {
  if (!POSTGRES_CONFIGURED) return null;

  const url = new URL('/rest/v1/speeches', SUPABASE_URL);
  url.searchParams.set('select', '*');
  url.searchParams.set('status', 'eq.published');
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);

  const response = await fetch(url, {
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      Accept: 'application/json',
    },
    signal,
    next: { revalidate: REVALIDATE_SECONDS },
  });

  if (!response.ok) return null;
  const rows = (await response.json()) as SpeechRow[];
  return rows.map((row) => mapSpeechRow(String(row.id ?? ''), speechRowFromPostgres(row)));
}

/* ------------------------------------------------------------------ */
/* Turso                                                              */
/* ------------------------------------------------------------------ */

type LibraryQuery =
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
        sql = `select library.* from library_fts
                 join library on library.rowid = library_fts.rowid
                where library_fts match ?
                order by bm25(library_fts)
                limit ?`;
        args = [match, query.max];
        break;
      }
      default:
        sql = 'select * from library order by published_at desc limit ? offset ?';
        args = [query.max, query.offset];
        break;
    }

    const result = await db.execute({ sql, args });
    return (result.rows as unknown as SpeechRow[]).map((row) =>
      mapSpeechRow(String(row.id ?? ''), speechRowFromLibrary(row)),
    );
  } catch {
    // A missing table, a revoked token, a database asleep: all of it means the
    // same thing to a reader — ask the other source.
    return null;
  } finally {
    db.close();
  }
}

/** Postgres equivalent of each Turso query, so the two can never differ. */
async function postgresFor(query: LibraryQuery, signal: AbortSignal): Promise<CloudSpeech[] | null> {
  switch (query.kind) {
    case 'one':
      return postgresSpeeches({ id: `eq.${query.id}`, limit: '1' }, signal);
    case 'writer':
      return postgresSpeeches(
        {
          username: `eq.${query.username.toLowerCase()}`,
          order: 'published_at.desc',
          limit: String(query.max),
        },
        signal,
      );
    case 'search': {
      // No full-text index outside Turso, so this is a substring match on the
      // three fields a reader searches. Slower and simpler, and honest: it can
      // only ever return something the reader could have opened anyway.
      const term = query.term.replace(/[%_,()]/g, ' ').trim();
      if (!term) return [];
      return postgresSpeeches(
        {
          or: `(title.ilike.*${term}*,preview.ilike.*${term}*,content.ilike.*${term}*)`,
          limit: String(query.max),
        },
        signal,
      );
    }
    default:
      return postgresSpeeches(
        { order: 'published_at.desc', limit: String(query.max), offset: String(query.offset) },
        signal,
      );
  }
}

/* ------------------------------------------------------------------ */
/* The public API of this module                                      */
/* ------------------------------------------------------------------ */

/**
 * Ask the copy, then the truth — and report which one answered.
 *
 * The order and the fallbacks, in one place:
 *
 *   1. the reading room, because it was built for this read and it is close;
 *   2. Postgres, whenever the copy failed *or* came back empty. Empty matters:
 *      a copy that was never filled answers an empty list perfectly happily,
 *      and reporting that as "the library is empty" would be the exact lie
 *      this module exists to avoid;
 *   3. and whichever of those answered is named honestly in `source`, because
 *      the environment panel and `npm run check:routes` read it — a guess here
 *      would make a real failure look like a working setup.
 */
async function read(query: LibraryQuery): Promise<{ items: CloudSpeech[]; source: LibrarySource }> {
  const signal = AbortSignal.timeout(READ_TIMEOUT_MS);

  const fromCopy = await tursoRead(query);
  if (fromCopy && fromCopy.length) return { items: fromCopy, source: 'turso' };

  try {
    const fromTruth = await postgresFor(query, signal);
    if (fromTruth && fromTruth.length) return { items: fromTruth, source: 'postgres' };
    // Both answered and both were empty: the copy answered first, so it is the
    // one to name. If it never answered at all, `fromCopy` is null and the
    // honest answer is "nothing was able to answer".
    if (fromTruth) return { items: [], source: fromCopy ? 'turso' : 'postgres' };
  } catch {
    /* a timeout or a refused read: fall through */
  }

  return { items: fromCopy ?? [], source: fromCopy ? 'turso' : 'none' };
}

export type LibrarySource = 'turso' | 'postgres' | 'none';

export interface LibraryPage {
  items: CloudSpeech[];
  /** Which database answered. Read by the environment panel, not by readers. */
  source: LibrarySource;
}

/** The published library, newest first. */
export async function readLibrary(options: { max?: number; offset?: number } = {}): Promise<LibraryPage> {
  const max = Math.min(Math.max(options.max ?? 24, 1), 200);
  const offset = Math.max(options.offset ?? 0, 0);
  return read({ kind: 'list', max, offset });
}

/** One speech, by id — what a shared link opens. */
export async function readSpeech(id: string): Promise<CloudSpeech | null> {
  return (await readSpeechResult(id)).speech;
}

/**
 * The same read, with the answer to "did anyone actually look?".
 *
 * The distinction is the difference between a 404 and an outage. A caller that
 * needs to know whether a speech is genuinely absent — the `/read/<id>` route,
 * so that a deleted shared link stops answering 200 — asks for this. Everyone
 * else can keep asking for `readSpeech` and get a speech or nothing.
 */
export async function readSpeechResult(
  id: string,
): Promise<{ speech: CloudSpeech | null; source: LibrarySource }> {
  if (!id) return { speech: null, source: 'none' };
  const { items, source } = await read({ kind: 'one', id });
  return { speech: items[0] ?? null, source };
}

/** One writer's published work, for their own page at /username. */
export async function readWriter(username: string, max = 60): Promise<CloudSpeech[]> {
  const handle = username.trim().toLowerCase();
  if (!handle) return [];
  return (await read({ kind: 'writer', username: handle, max })).items;
}

/** Full-text search, with the same terms the search box sends. */
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
 * It runs at most once per process, and only from a path that already required
 * a signed-in caller (`POST /api/sync-library`). A public read never creates
 * anything.
 */
export async function ensureLibrarySchema(): Promise<{ ok: boolean; applied: number; note: string }> {
  if (!TURSO_CONFIGURED) return { ok: false, applied: 0, note: 'turso_not_configured' };

  const db = await turso();
  if (!db) return { ok: false, applied: 0, note: 'turso_unreachable' };

  try {
    if (await libraryTableExists(db)) {
      schemaChecked = true;
      return { ok: true, applied: 0, note: 'already_present' };
    }

    const file = resolve(process.cwd(), 'turso/schema.sql');
    const statements = splitSql(readFileSync(file, 'utf8'));
    for (const statement of statements) await db.execute(statement);

    schemaChecked = true;
    return { ok: true, applied: statements.length, note: 'applied' };
  } catch (error) {
    return { ok: false, applied: 0, note: (error as Error).message };
  } finally {
    db.close();
  }
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
