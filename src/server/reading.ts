import { cache } from 'react';
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
  | { kind: 'writerWork'; username: string; key: string; folder?: string }
  | { kind: 'category'; label: string; max: number }
  | { kind: 'tag'; label: string; max: number }
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
        sql = "select * from library where id = ? and moderation_status = 'published'";
        args = [query.id];
        break;
      case 'writer':
        // Profile cards need only metadata and previews. Do not ship dozens of
        // full presentation bodies into a profile page; the address route below
        // fetches the one body a reader actually opened.
        sql = `select id, uid, username, folder, slug, title, author, author_photo_url,
                      author_badges, preview, category, occasion, tags, credits,
                      signature, allow_copy, source_type, source_name, source_url,
                      source_title, source_fetched_at, official_slug, source_item_id,
                      license, moderation_status, moderation_note, featured, views,
                      likes, dislikes, shares, published_at, updated_at
               from library where lower(username) = ? and moderation_status = 'published'
               order by published_at desc, id desc limit ?`;
        args = [query.username, query.max];
        break;
      case 'writerWork':
        sql = query.folder === undefined
          ? `select * from library where lower(username) = ? and moderation_status = 'published'
             and (slug = ? or id = ?)
             order by case when folder = '' then 0 else 1 end, published_at desc limit 1`
          : `select * from library where lower(username) = ? and folder = ?
             and moderation_status = 'published' and (slug = ? or id = ?)
             order by published_at desc limit 1`;
        args = query.folder === undefined
          ? [query.username, query.key, query.key]
          : [query.username, query.folder, query.key, query.key];
        break;
      case 'category':
        sql = "select * from library where lower(trim(category)) = ? and moderation_status = 'published' order by published_at desc limit ?";
        args = [query.label.trim().toLowerCase(), query.max];
        break;
      case 'tag':
        sql = `select * from library where moderation_status = 'published'
               and instr(',' || lower(replace(replace(replace(replace(tags, ' ', ''), '[', ''), ']', ''), '"', '')) || ',', ',' || ? || ',') > 0
               order by published_at desc limit ?`;
        args = [query.label.trim().toLowerCase().replace(/\s+/g, ''), query.max];
        break;
      case 'search': {
        const match = toMatchQuery(query.term);
        if (!match) return [];
        sql = `select library.* from library_fts join library on library.rowid = library_fts.rowid
               where library_fts match ? and library.moderation_status = 'published'
               order by bm25(library_fts) limit ?`;
        args = [match, query.max];
        break;
      }
      default:
        sql = "select * from library where moderation_status = 'published' order by published_at desc limit ? offset ?";
        args = [query.max, query.offset];
        break;
    }
    const result = await db.execute({ sql, args });
    const rows = result.rows as unknown as SpeechRow[];
    const mapped = rows.map((row) => mapSpeechRow(String(row.id ?? ''), speechRowFromLibrary(row)));
    const items = query.kind === 'writer'
      ? mapped.map((item) => ({ ...item, content: '' }))
      : mapped;
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
  const officialSlugs = [...new Set(items.map((item) => item.officialSlug).filter((value): value is string => Boolean(value)))];
  if (!uids.length && !officialSlugs.length) return items;
  const directory = new Map<string, { displayName?: string; username?: string; photoURL?: string; badges?: string[] }>();

  const profileEnrichment = (async () => {
  if (POSTGRES_CONFIGURED && uids.length) {
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
  })();

  // Active badge assignments live beside profiles in Supabase. Ordinary
  // authors key by Clerk uid; vetted sources key by their official slug.
  if (POSTGRES_CONFIGURED) {
    try {
      const principals = [...new Set([...uids, ...officialSlugs])];
      if (principals.length) {
        const url = new URL('/rest/v1/badge_assignments', SUPABASE_URL);
        url.searchParams.set('select', 'principal_type,principal_id,badge');
        url.searchParams.set('active', 'eq.true');
        url.searchParams.set('principal_id', `in.(${principals.map((id) => `"${id.replace(/[^a-z0-9_-]/gi, '')}"`).join(',')})`);
        const response = await fetch(url, {
          headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, Accept: 'application/json' },
          signal: AbortSignal.timeout(READ_TIMEOUT_MS),
          next: { revalidate: REVALIDATE_SECONDS },
        });
        if (response.ok) {
          const rows = await response.json() as SpeechRow[];
          for (const row of rows) {
            const principalId = String(row.principal_id ?? '');
            const badge = String(row.badge ?? '');
            if (!['quintal', 'sole', 'grey'].includes(badge)) continue;
            const owners = row.principal_type === 'official'
              ? items.filter((item) => item.officialSlug === principalId).map((item) => item.uid)
              : [principalId];
            for (const uid of owners.filter(Boolean)) {
              const current = directory.get(uid) ?? {};
              directory.set(uid, { ...current, badges: [...new Set([...(current.badges ?? []), badge])] });
            }
          }
        }
      }
    } catch {
      // A published row may carry a last-known badge image code.
    }
  }
  // These reads are independent; start both before waiting for either result.
  await profileEnrichment;

  // Sole is retained with the legacy Turso view record for old awards.
  if (db && uids.length) {
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

// Next shares these request-scoped reads between generateMetadata and the page
// render. A content URL therefore resolves its work once, not once for its
// title and again for its body.
const cachedWriterRead = cache((username: string, max: number) =>
  read({ kind: 'writer', username, max }),
);
const cachedWriterWorkRead = cache((username: string, key: string, folder: string | null) =>
  read({ kind: 'writerWork', username, key, ...(folder === null ? {} : { folder }) }),
);

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

/** Public presentations in one human-readable category. */
export async function readCategory(label: string, max = 200): Promise<LibraryPage> {
  const normalized = label.trim();
  if (!normalized) return { items: [], source: TURSO_CONFIGURED ? 'turso' : 'none' };
  return read({ kind: 'category', label: normalized, max: Math.min(Math.max(max, 1), 500) });
}

/** Public presentations carrying one exact tag. */
export async function readTag(label: string, max = 200): Promise<LibraryPage> {
  const normalized = label.trim();
  if (!normalized) return { items: [], source: TURSO_CONFIGURED ? 'turso' : 'none' };
  return read({ kind: 'tag', label: normalized, max: Math.min(Math.max(max, 1), 500) });
}

export interface SitemapPresentation {
  id: string;
  username: string;
  slug: string;
  folder: string;
  category: string;
  tags: string[];
  publishedAt: string;
  lastModified: string;
}

function sitemapTagList(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String).map((tag) => tag.trim()).filter(Boolean);
  const raw = typeof value === 'string' ? value.trim() : '';
  if (!raw) return [];
  if (raw.startsWith('[')) {
    try {
      const parsed: unknown = JSON.parse(raw);
      if (Array.isArray(parsed)) return parsed.map(String).map((tag) => tag.trim()).filter(Boolean);
    } catch { /* older rows use comma-separated tags */ }
  }
  return raw.split(',').map((tag) => tag.trim().replace(/^['\"]|['\"]$/g, '')).filter(Boolean);
}

/** Small, metadata-only query used to refresh sitemap URLs and last-modified dates. */
export async function readSitemapPresentations(max = 5000): Promise<SitemapPresentation[]> {
  if (!TURSO_CONFIGURED) return [];
  const db = await turso();
  if (!db) return [];
  try {
    const result = await db.execute({
      sql: `select id, username, slug, folder, category, tags, published_at, updated_at from library
            where moderation_status = 'published' order by published_at desc limit ?`,
      args: [Math.min(Math.max(Math.floor(max), 1), 10_000)],
    });
    return result.rows.map((raw) => {
      const row = raw as unknown as SpeechRow;
      const publishedAt = String(row.published_at ?? '');
      return {
        id: String(row.id ?? ''),
        username: String(row.username ?? '').trim().toLowerCase(),
        slug: String(row.slug ?? '').trim(),
        folder: String(row.folder ?? '').trim(),
        category: String(row.category ?? '').trim(),
        tags: sitemapTagList(row.tags),
        publishedAt,
        lastModified: String(row.updated_at ?? '') || publishedAt,
      };
    }).filter((row) => row.id.length > 0);
  } catch {
    return [];
  } finally {
    db.close();
  }
}

export interface SitemapProfile {
  username: string;
  lastModified: string;
}

export async function readSitemapProfiles(max = 2000): Promise<SitemapProfile[]> {
  if (!POSTGRES_CONFIGURED) return [];
  try {
    const url = new URL('/rest/v1/profiles', SUPABASE_URL);
    url.searchParams.set('select', 'username,updated_at');
    url.searchParams.set('username', 'not.is.null');
    url.searchParams.set('limit', String(Math.min(Math.max(Math.floor(max), 1), 5000)));
    const response = await fetch(url, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(READ_TIMEOUT_MS),
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!response.ok) return [];
    const rows = await response.json() as SpeechRow[];
    return rows.map((row) => ({
      username: String(row.username ?? '').trim().toLowerCase(),
      lastModified: String(row.updated_at ?? ''),
    })).filter((row) => /^[a-z0-9_]{3,24}$/.test(row.username));
  } catch {
    return [];
  }
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

/** One writer's published work, with metadata-only rows for profile cards. */
export async function readWriterResult(username: string, max = 60): Promise<LibraryPage> {
  const handle = username.trim().toLowerCase();
  if (!handle) return { items: [], source: TURSO_CONFIGURED ? 'turso' : 'none' };
  const bounded = Math.min(Math.max(Math.floor(max), 1), 200);
  return cachedWriterRead(handle, bounded);
}

export async function readWriter(username: string, max = 60): Promise<CloudSpeech[]> {
  return (await readWriterResult(username, max)).items;
}

/** Resolve one writer address without loading the rest of the profile. */
export async function readWriterWorkResult(
  username: string,
  key: string,
  folder?: string,
): Promise<{ speech: CloudSpeech | null; source: LibrarySource }> {
  const handle = username.trim().toLowerCase();
  const address = key.trim();
  if (!handle || !address) return { speech: null, source: TURSO_CONFIGURED ? 'turso' : 'none' };
  const normalizedFolder = folder === undefined ? null : folder.trim();
  const result = await cachedWriterWorkRead(handle, address, normalizedFolder);
  return { speech: result.items[0] ?? null, source: result.source };
}

export async function readWriterWork(username: string, key: string, folder?: string): Promise<CloudSpeech | null> {
  return (await readWriterWorkResult(username, key, folder)).speech;
}

/** Full-text search over Turso's FTS5 index. */
export async function searchLibraryResult(term: string, max = 50): Promise<LibraryPage> {
  const trimmed = term.trim();
  if (!trimmed) return { items: [], source: TURSO_CONFIGURED ? 'turso' : 'none' };
  return read({ kind: 'search', term: trimmed, max: Math.min(Math.max(Math.floor(max), 1), 200) });
}

export async function searchLibrary(term: string, max = 50): Promise<CloudSpeech[]> {
  return (await searchLibraryResult(term, max)).items;
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
export interface PublicHandleLookup {
  handleState: HandleState;
  profile: PublicProfile | null;
}

const PROFILE_COLUMNS = 'uid,username,display_name,bio,location,website,signature,created_at,photo_url,points,likes_received,dislikes_received';

function mapPublicProfile(row: SpeechRow, handle: string): PublicProfile {
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
}

async function readHandleStateRaw(handle: string): Promise<HandleState> {
  try {
    const url = new URL('/rest/v1/handles', SUPABASE_URL);
    url.searchParams.set('select', 'username');
    url.searchParams.set('username', `eq.${handle}`);
    url.searchParams.set('limit', '1');
    const response = await fetch(url, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(READ_TIMEOUT_MS),
      next: { revalidate: 30 },
    });
    if (!response.ok) return 'unknown';
    return ((await response.json()) as unknown[]).length ? 'held' : 'free';
  } catch {
    return 'unknown';
  }
}

async function readProfileRaw(handle: string): Promise<PublicProfile | null> {
  try {
    const url = new URL('/rest/v1/profiles', SUPABASE_URL);
    url.searchParams.set('select', PROFILE_COLUMNS);
    url.searchParams.set('username', `eq.${handle}`);
    url.searchParams.set('limit', '1');
    const response = await fetch(url, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(READ_TIMEOUT_MS),
      next: { revalidate: REVALIDATE_SECONDS },
    });
    if (!response.ok) return null;
    const [row] = await response.json() as SpeechRow[];
    return row ? mapPublicProfile(row, handle) : null;
  } catch {
    return null;
  }
}

async function readPublicHandleRaw(handle: string): Promise<PublicHandleLookup> {
  if (!handle || !POSTGRES_CONFIGURED) return { handleState: 'unknown', profile: null };
  try {
    // The handle lock points to profiles.uid. PostgREST can return both in one
    // round trip, which replaces the old serial handles → profile lookups.
    const url = new URL('/rest/v1/handles', SUPABASE_URL);
    url.searchParams.set('select', `username,uid,profile:profiles!handles_uid_fkey(${PROFILE_COLUMNS})`);
    url.searchParams.set('username', `eq.${handle}`);
    url.searchParams.set('limit', '1');
    const response = await fetch(url, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(READ_TIMEOUT_MS),
      next: { revalidate: 30 },
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      if (response.status === 400 || response.status === 404 || /PGRST200|relationship/i.test(detail)) {
        const [handleState, profile] = await Promise.all([
          readHandleStateRaw(handle),
          readProfileRaw(handle),
        ]);
        return { handleState, profile };
      }
      return { handleState: 'unknown', profile: null };
    }
    const rows = await response.json() as SpeechRow[];
    const lock = rows[0];
    if (lock) {
      const embedded = Array.isArray(lock.profile) ? lock.profile[0] : lock.profile;
      const profile = embedded && typeof embedded === 'object'
        ? mapPublicProfile(embedded as SpeechRow, handle)
        : await readProfileRaw(handle);
      return { handleState: 'held', profile };
    }
    // Preserve the older behavior for an incomplete account migration: a
    // public profile row can still render even if its handle lock is absent.
    return { handleState: 'free', profile: await readProfileRaw(handle) };
  } catch {
    return { handleState: 'unknown', profile: null };
  }
}

const cachedPublicHandle = cache((handle: string) => readPublicHandleRaw(handle));

/** Handle lock and public profile, fetched together and shared within a render. */
export function readPublicHandle(username: string): Promise<PublicHandleLookup> {
  const handle = username.trim().toLowerCase();
  if (!/^[a-z0-9_]{3,24}$/.test(handle)) {
    return Promise.resolve({ handleState: 'unknown', profile: null });
  }
  return cachedPublicHandle(handle);
}

export async function readHandleState(username: string): Promise<HandleState> {
  return (await readPublicHandle(username)).handleState;
}

/** One public profile row — the bio, the name, the counters. */
export async function readProfile(username: string): Promise<PublicProfile | null> {
  return (await readPublicHandle(username)).profile;
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
 * explicit share, edit, reaction, or share-count write. A public read never
 * creates or mutates anything.
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
