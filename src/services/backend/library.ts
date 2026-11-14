/**
 * Public presentation reads.
 *
 * Turso is the sole presentation-content store. The browser asks `/api/library`;
 * it never receives a database token and never falls back to a second content
 * database when the authoritative library is absent or unreachable.
 */

import { LIBRARY_ENDPOINT } from './config';

export interface LibraryPage {
  items: Record<string, unknown>[];
  source: 'turso' | 'none';
  total?: number;
  error?: string;
}

async function askLibrary(params: Record<string, string>): Promise<LibraryPage> {
  try {
    const response = await fetch(`${LIBRARY_ENDPOINT}?${new URLSearchParams(params)}`, {
      headers: { Accept: 'application/json' },
      cache: 'no-store',
    });
    const payload = (await response.json().catch(() => ({}))) as {
      items?: Record<string, unknown>[];
      total?: number;
      error?: string;
      message?: string;
    };
    if (!response.ok) {
      return { items: [], source: 'none', error: payload.message ?? payload.error ?? `http_${response.status}` };
    }
    return { items: payload.items ?? [], source: 'turso', total: payload.total };
  } catch (error) {
    return { items: [], source: 'none', error: (error as Error).message || 'network_error' };
  }
}

/** Public library, newest first, optionally limited to one writer. */
export async function fetchLibrary(options: { username?: string; max?: number; offset?: number } = {}): Promise<LibraryPage> {
  const params: Record<string, string> = {
    max: String(options.max ?? 200),
    offset: String(options.offset ?? 0),
  };
  if (options.username) params.username = options.username.trim().toLowerCase();
  return askLibrary(params);
}

/** Full-text search over the Turso FTS5 index. */
export async function searchLibrary(term: string, max = 50): Promise<LibraryPage> {
  const query = term.trim();
  if (!query) return { items: [], source: 'turso', total: 0 };
  return askLibrary({ q: query, max: String(max) });
}

/** One published presentation by stable id. */
export async function fetchOne(id: string): Promise<Record<string, unknown> | null> {
  const page = await askLibrary({ id });
  return page.items[0] ?? null;
}
