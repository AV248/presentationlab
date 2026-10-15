/**
 * Turso — the reading room.
 *
 * Reading is free and reading is most of the traffic, so it is served from a
 * SQLite projection that sits close to whoever is reading, with FTS5 for
 * search. The browser never holds a Turso token: it asks `/api/library`, and
 * that function — running on the server — holds the scoped read-only token.
 *
 * The projection is *derived*. Supabase owns every speech; this one is rebuilt
 * from it by `scripts/turso/sync.mjs` (and by `/api/sync-library` after an
 * owner action). If Turso is not configured yet, this module quietly falls back
 * to reading the same rows straight from Postgres, so the library works before
 * the second database is ever set up.
 */

import { LIBRARY_ENDPOINT } from './config';
import { getDocs, query, collection, db, where, limit } from './supabase';

export interface LibraryPage {
  items: Record<string, unknown>[];
  /** 'turso' when the reading room answered, 'postgres' for the fallback. */
  source: 'turso' | 'postgres' | 'none';
  total?: number;
}

/** Translate a Postgres row into the shape the app's readers expect. */
function fromPostgresRow(id: string, row: Record<string, unknown>): Record<string, unknown> {
  const tags = Array.isArray(row.tags) ? (row.tags as string[]).join(', ') : String(row.tags ?? '');
  return {
    id,
    kind: 'speech',
    title: String(row.title ?? 'Untitled'),
    author: String(row.author ?? 'Anonymous'),
    category: String(row.category ?? 'General'),
    occasion: String(row.occasion ?? ''),
    tags,
    preview: String(row.preview ?? ''),
    content: String(row.content ?? ''),
    uid: String(row.uid ?? ''),
    username: String(row.username ?? '') || undefined,
    slug: String(row.slug ?? '') || undefined,
    folder: String(row.folder ?? '') || undefined,
    credits: String(row.credits ?? '') || undefined,
    signature: String(row.signature ?? '') || undefined,
    allowCopy: row.allow_copy !== false,
    ad: row.ad === true,
    views: Number(row.views ?? 0),
    likes: Number(row.likes ?? 0),
    dislikes: Number(row.dislikes ?? 0),
    shares: Number(row.shares ?? 0),
    createdAt: String(row.created_at ?? '').slice(0, 10) || new Date().toISOString().slice(0, 10),
    updatedAt: String(row.updated_at ?? ''),
    createdMs: row.created_at ? new Date(String(row.created_at)).getTime() : 0,
  };
}

/** Read straight from Postgres — the fallback, and the truth underneath. */
async function fromPostgres(options: { username?: string; max?: number }): Promise<LibraryPage> {
  try {
    const constraints = [
      where('status', '==', 'published'),
      ...(options.username ? [where('username', '==', options.username)] : []),
      limit(options.max ?? 200),
    ];
    const snap = await getDocs(query(collection(db, 'presentations'), ...constraints));
    return {
      items: snap.docs.map((doc) => fromPostgresRow(doc.id, doc.data())),
      source: 'postgres',
    };
  } catch {
    return { items: [], source: 'none' };
  }
}

/** The reading room, if it is configured and up. */
async function askLibrary(params: Record<string, string>): Promise<LibraryPage | null> {
  try {
    const response = await fetch(`${LIBRARY_ENDPOINT}?${new URLSearchParams(params)}`, {
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as { items?: Record<string, unknown>[]; total?: number };
    return { items: payload.items ?? [], source: 'turso', total: payload.total };
  } catch {
    return null;
  }
}

/** The public library: newest first, optionally one writer's work. */
export async function fetchLibrary(options: { username?: string; max?: number } = {}): Promise<LibraryPage> {
  const params: Record<string, string> = { max: String(options.max ?? 200) };
  if (options.username) params.username = options.username;
  return (await askLibrary(params)) ?? fromPostgres(options);
}

/** Full-text search across every published speech. */
export async function searchLibrary(term: string, max = 50): Promise<LibraryPage> {
  const trimmed = term.trim();
  if (!trimmed) return { items: [], source: 'none' };
  const page = await askLibrary({ q: trimmed, max: String(max) });
  if (page) return page;

  // No reading room: a plain `ilike` on Postgres. Slower, but honest, and it
  // never returns something the reader cannot open.
  try {
    const snap = await getDocs(
      query(collection(db, 'presentations'), where('status', '==', 'published'), limit(max)),
    );
    const needle = trimmed.toLowerCase();
    const items = snap.docs
      .map((doc) => fromPostgresRow(doc.id, doc.data()))
      .filter((item) =>
        `${item.title} ${item.preview} ${item.content}`.toLowerCase().includes(needle),
      );
    return { items, source: 'postgres' };
  } catch {
    return { items: [], source: 'none' };
  }
}

/** One speech, by id — the reader's own route. */
export async function fetchOne(id: string): Promise<Record<string, unknown> | null> {
  const page = await askLibrary({ id });
  if (page && page.items.length) return page.items[0];
  try {
    const { getDoc, doc } = await import('./supabase');
    const snap = await getDoc(doc(db, 'presentations', id));
    if (!snap.exists()) return null;
    return fromPostgresRow(id, snap.data() ?? {});
  } catch {
    return null;
  }
}
