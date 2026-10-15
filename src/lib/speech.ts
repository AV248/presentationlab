/**
 * The speech shape the app reads, and the one function that produces it.
 *
 * ── Why this is its own module ──────────────────────────────────────────────
 * Three places need to turn a database row into the object the screens render:
 *
 *   • the browser, after signing in and reading Postgres directly;
 *   • the **server**, rendering the same rows into HTML before the browser has
 *     run at all (server components — see `src/server/reading.ts`);
 *   • `/api/library`, serving the reading room.
 *
 * If those three disagreed by a single field, the app would render one thing
 * on the server and something subtly different a moment later — the classic
 * hydration mismatch, except the interesting part is not React's warning, it
 * is that a crawler and a reader would see different text.
 *
 * So the mapper is defined once, here, with no dependencies at all: this file
 * is imported by client code and by server code, so it may not touch `window`,
 * `fetch`, or any SDK.
 */

export interface CloudSpeech {
  id: string;
  kind: 'speech';
  title: string;
  author: string;
  category: string;
  occasion: string;
  level: 'Standard';
  tags: string[];
  preview: string;
  content: string;
  createdAt: string;
  uid: string;
  username?: string;
  slug?: string;
  folder?: string;
  credits?: string;
  signature?: string;
  allowCopy: boolean;
  views: number;
  likes: number;
  dislikes: number;
  shares: number;
  ad: boolean;
  updatedAt: string;
  createdMs: number;
}

/** A row, as either database hands it over. Field names differ; that is all. */
export type SpeechRow = Record<string, unknown>;

export function str(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return fallback;
}

export function num(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export function isoTimestamp(value: unknown): string {
  if (!value) return '';
  try {
    const maybe = value as { toDate?: () => Date; seconds?: number };
    if (typeof maybe.toDate === 'function') return maybe.toDate().toISOString();
    if (typeof maybe.seconds === 'number') return new Date(maybe.seconds * 1000).toISOString();
  } catch {
    /* fall through to the string form */
  }
  return str(value);
}

/**
 * One row → one speech.
 *
 * Reads both spellings of every field (`Content` and `content`) because the
 * two databases name their columns differently and neither is going to change
 * for the convenience of this function.
 */
export function mapSpeechRow(id: string, data: SpeechRow): CloudSpeech {
  const content = str(data.Content ?? data.content);
  const title = str(data.Title ?? data.title, 'Untitled');
  const created = isoTimestamp(data.createdAt ?? data.Date ?? data.date);

  const rawTags = data.Tags ?? data.tags;
  const tags = Array.isArray(rawTags)
    ? rawTags.map((tag) => String(tag).trim()).filter(Boolean)
    : str(rawTags)
        .split(',')
        .map((tag) => tag.trim())
        .filter(Boolean);

  return {
    id,
    kind: 'speech',
    title,
    author: str(data.Author ?? data.author, 'Anonymous'),
    category: str(data.Category ?? data.category, 'General'),
    occasion: str(data.Occasion ?? data.occasion, 'Shared speech'),
    level: 'Standard',
    tags,
    preview: str(data.Preview ?? data.preview) || content.replace(/[#>*`]/g, '').slice(0, 180),
    content: content || 'This speech has no body text yet.',
    createdAt: created ? created.slice(0, 10) : new Date().toISOString().slice(0, 10),
    uid: str(data.uid ?? data.authorUid),
    username: str(data.username) || undefined,
    slug: str(data.slug) || undefined,
    folder: str(data.folder) || undefined,
    credits: str(data.Credits ?? data.credits) || undefined,
    signature: str(data.Signature ?? data.signature) || undefined,
    allowCopy: data.allowCopy === false ? false : true,
    views: num(data.views),
    likes: num(data.likes),
    dislikes: num(data.dislikes),
    shares: num(data.shares),
    ad: Boolean(data.ad),
    updatedAt: isoTimestamp(data.updatedAt),
    createdMs: created ? new Date(created).getTime() : 0,
  };
}

/**
 * A PostgREST row (snake_case columns) → the field names `mapSpeechRow` reads.
 *
 * One table, one mapping, and no guessing: every column is named, so adding a
 * column to `supabase/schema.sql` without adding it here is visible rather than
 * silently undefined. `scripts/check-schema.mjs` compares this list against the
 * schema for exactly that reason.
 */
export function speechRowFromPostgres(row: SpeechRow): SpeechRow {
  return {
    Title: row.title,
    Content: row.content,
    Preview: row.preview,
    Category: row.category,
    Occasion: row.occasion,
    Author: row.author,
    Tags: row.tags,
    Credits: row.credits,
    Signature: row.signature,
    allowCopy: row.allow_copy,
    ad: row.ad,
    status: row.status,
    uid: row.uid,
    username: row.username,
    slug: row.slug,
    folder: row.folder,
    views: row.views,
    likes: row.likes,
    dislikes: row.dislikes,
    shares: row.shares,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    Date: row.published_at,
  };
}

/**
 * A row of the Turso reading room (SQLite, columns already close to ours) →
 * the same field names. `allow_copy` is an integer there and a boolean here;
 * that is the only real difference, and getting it wrong would take the copy
 * button away from every reader.
 */
export function speechRowFromLibrary(row: SpeechRow): SpeechRow {
  return {
    Title: row.title,
    Content: row.content,
    Preview: row.preview,
    Category: row.category,
    Occasion: row.occasion,
    Author: row.author,
    Tags: row.tags,
    Credits: row.credits,
    Signature: row.signature,
    allowCopy: Number(row.allow_copy ?? 1) !== 0,
    ad: false,
    status: 'published',
    uid: row.uid,
    username: row.username,
    slug: row.slug,
    folder: row.folder,
    views: row.views,
    likes: row.likes,
    dislikes: row.dislikes,
    shares: row.shares,
    createdAt: row.published_at,
    updatedAt: row.updated_at,
    Date: row.published_at,
  };
}
