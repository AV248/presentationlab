/**
 * One-time, non-destructive import of legacy Supabase presentations into Turso.
 *
 * This module is called by the local CLI migration only. The public site does
 * not project or mirror content from Supabase. New shares, edits and deletes
 * go directly to Turso; a legacy import may only add a missing row and never
 * replaces, clears, or deletes anything already in the authoritative store.
 */

interface LegacyPresentationRow {
  id?: unknown;
  uid?: unknown;
  username?: unknown;
  folder?: unknown;
  slug?: unknown;
  title?: unknown;
  author?: unknown;
  author_photo_url?: unknown;
  author_badges?: unknown;
  preview?: unknown;
  content?: unknown;
  category?: unknown;
  occasion?: unknown;
  tags?: unknown;
  credits?: unknown;
  signature?: unknown;
  allow_copy?: unknown;
  source_type?: unknown;
  source_name?: unknown;
  source_url?: unknown;
  license?: unknown;
  views?: unknown;
  likes?: unknown;
  dislikes?: unknown;
  shares?: unknown;
  created_at?: unknown;
  published_at?: unknown;
  updated_at?: unknown;
}

export interface ImportOptions {
  supabaseUrl: string;
  /** Supabase service-role key, supplied only by the local migration CLI. */
  apiKey: string;
  tursoUrl: string;
  tursoToken: string;
}

export interface ImportResult {
  read: number;
  imported: number;
  skipped: number;
}

const PAGE = 500;
const CHUNK = 100;

function text(value: unknown, fallback = '', max = 100_000): string {
  return typeof value === 'string' ? value.trim().slice(0, max) : fallback;
}

function count(value: unknown): number {
  const n = Number(value ?? 0);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 0;
}

function publicUrl(value: unknown): string {
  const raw = text(value, '', 2_000);
  if (!raw) return '';
  try {
    const url = new URL(raw);
    return url.protocol === 'https:' ? url.toString() : '';
  } catch {
    return '';
  }
}

function sourceType(value: unknown): 'person' | 'archive' | 'admin' {
  return value === 'archive' || value === 'admin' ? value : 'person';
}

function badges(value: unknown, kind: 'person' | 'archive' | 'admin'): string {
  const raw = Array.isArray(value) ? value.map(String) : text(value).split(',');
  const valid = raw.map((badge) => badge.trim().toLowerCase()).filter((badge) =>
    badge === 'quintal' || badge === 'sole' || badge === 'grey',
  );
  if (kind === 'archive') valid.push('grey');
  return [...new Set(valid)].join(',');
}

function toLibraryArgs(row: LegacyPresentationRow): (string | number)[] {
  const type = sourceType(row.source_type);
  const tags = Array.isArray(row.tags) ? row.tags.map(String).join(', ') : text(row.tags);
  const publishedAt = text(row.published_at, text(row.created_at, new Date().toISOString()), 80);
  return [
    text(row.id, '', 100),
    text(row.uid, '', 256),
    text(row.username, '', 100).toLowerCase(),
    text(row.folder, '', 60),
    text(row.slug, '', 60),
    text(row.title, 'Untitled', 140),
    text(row.author, 'Anonymous', 180),
    publicUrl(row.author_photo_url),
    badges(row.author_badges, type),
    text(row.preview, '', 500),
    text(row.content),
    text(row.category, 'General', 80),
    text(row.occasion, '', 120),
    tags.slice(0, 2_000),
    text(row.credits, '', 2_000),
    text(row.signature, '', 300),
    row.allow_copy === false ? 0 : 1,
    type,
    text(row.source_name, '', 180),
    publicUrl(row.source_url),
    text(row.license, '', 240),
    count(row.views),
    count(row.likes),
    count(row.dislikes),
    count(row.shares),
    publishedAt,
    text(row.updated_at, publishedAt, 80),
  ];
}

async function readPublished(options: ImportOptions): Promise<LegacyPresentationRow[]> {
  const rows: LegacyPresentationRow[] = [];
  for (let offset = 0; ; offset += PAGE) {
    const url = new URL('/rest/v1/speeches', options.supabaseUrl);
    url.searchParams.set('select', '*');
    url.searchParams.set('status', 'eq.published');
    url.searchParams.set('order', 'created_at.asc');
    url.searchParams.set('limit', String(PAGE));
    url.searchParams.set('offset', String(offset));
    const response = await fetch(url, {
      headers: {
        apikey: options.apiKey,
        Authorization: `Bearer ${options.apiKey}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      throw new Error(`Supabase refused the legacy read (${response.status}). ${detail.slice(0, 200)}`.trim());
    }
    const page = await response.json() as LegacyPresentationRow[];
    rows.push(...page);
    if (page.length < PAGE) break;
  }
  return rows.filter((row) => text(row.id, '', 100));
}

const INSERT = `insert or ignore into library (
  id, uid, username, folder, slug, title, author, author_photo_url, author_badges,
  preview, content, category, occasion, tags, credits, signature, allow_copy,
  source_type, source_name, source_url, license, views, likes, dislikes, shares,
  published_at, updated_at
) values (${Array.from({ length: 27 }, () => '?').join(', ')})`;

/** Count legacy rows that are not already represented in Turso; performs no writes. */
export async function inspectLegacyLibrary(options: ImportOptions): Promise<{ read: number; missing: number; present: number }> {
  const rows = await readPublished(options);
  const { createClient } = await import('@libsql/client');
  const db = createClient({ url: options.tursoUrl, authToken: options.tursoToken });
  try {
    const existing = await db.execute('select id, username, folder, slug from library');
    const ids = new Set<string>();
    const addresses = new Set<string>();
    for (const row of existing.rows as unknown as LegacyPresentationRow[]) {
      ids.add(text(row.id, '', 100));
      const username = text(row.username, '', 100).toLowerCase();
      const folder = text(row.folder, '', 60);
      const slug = text(row.slug, '', 60);
      if (username && slug) addresses.add(`${username}\\u001f${folder}\\u001f${slug}`);
    }
    let missing = 0;
    for (const row of rows) {
      const id = text(row.id, '', 100);
      const username = text(row.username, '', 100).toLowerCase();
      const folder = text(row.folder, '', 60);
      const slug = text(row.slug, '', 60);
      const address = `${username}\\u001f${folder}\\u001f${slug}`;
      if (ids.has(id) || (username && slug && addresses.has(address))) continue;
      missing += 1;
      ids.add(id);
      if (username && slug) addresses.add(address);
    }
    return { read: rows.length, missing, present: rows.length - missing };
  } catch (error) {
    const message = (error as Error).message ?? '';
    if (/no such table|no such column/i.test(message)) {
      throw new Error(`${message} — apply turso/schema.sql first with npm run db:turso.`);
    }
    throw error;
  } finally {
    db.close();
  }
}

/** Add only missing legacy rows. Existing Turso rows always remain authoritative. */
export async function importLegacyLibrary(options: ImportOptions): Promise<ImportResult> {
  const rows = await readPublished(options);
  const { createClient } = await import('@libsql/client');
  const db = createClient({ url: options.tursoUrl, authToken: options.tursoToken });
  let imported = 0;
  try {
    for (let start = 0; start < rows.length; start += CHUNK) {
      const batch = rows.slice(start, start + CHUNK);
      const results = await db.batch(
        batch.map((row) => ({ sql: INSERT, args: toLibraryArgs(row) })),
        'write',
      );
      imported += results.reduce((sum, result) => sum + Number(result.rowsAffected ?? 0), 0);
    }
  } catch (error) {
    const message = (error as Error).message ?? '';
    if (/no such table|no such column/i.test(message)) {
      throw new Error(`${message} — apply turso/schema.sql first with npm run db:turso.`);
    }
    throw error;
  } finally {
    db.close();
  }
  return { read: rows.length, imported, skipped: rows.length - imported };
}
