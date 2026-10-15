/**
 * The reading room — public reads from Turso.
 *
 * Reading is free and reading is most of the traffic, so it is served from a
 * SQLite database replicated close to whoever is asking, with FTS5 behind the
 * search box. This function is the only holder of the Turso read token; the
 * browser never sees it.
 *
 * GET /api/library?id=<speech>          one speech
 * GET /api/library?username=<handle>    one writer's published work
 * GET /api/library?q=<words>            full-text search
 * GET /api/library?max=50&offset=0      the library, newest first
 *
 * Answers:
 *   200  { items: [...], total?: n }
 *   405  a GET-only endpoint being asked something else
 *   503  { error: 'library_not_configured' | 'library_unreachable' }
 *
 * A 503 is not an outage: the app falls back to reading the same rows from
 * Postgres, so the library works before Turso is ever set up. That is why this
 * endpoint is allowed to be honest about being absent.
 */

import type { IncomingMessage, ServerResponse } from 'node:http';

/* ------------------------------------------------------------------ */
/* Configuration                                                       */
/* ------------------------------------------------------------------ */

const TURSO_URL = (process.env.TURSO_DATABASE_URL ?? '').trim();
const TURSO_TOKEN = (process.env.TURSO_AUTH_TOKEN ?? '').trim();

/** How long a reader may be served from this instance's last answer. */
const EDGE_TTL_SECONDS = 60;

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function send(res: ServerResponse, status: number, body: unknown, cache = false) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader(
    'Cache-Control',
    cache ? `public, max-age=${EDGE_TTL_SECONDS}, s-maxage=${EDGE_TTL_SECONDS}` : 'no-store',
  );
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(body));
}

interface Row {
  id: string;
  uid: string;
  username: string;
  folder: string;
  slug: string;
  title: string;
  author: string;
  preview: string;
  content: string;
  category: string;
  occasion: string;
  tags: string;
  credits: string;
  signature: string;
  allow_copy: number;
  views: number;
  likes: number;
  dislikes: number;
  shares: number;
  published_at: string;
  updated_at: string;
}

/** The shape the app's readers expect — identical to a Postgres row's mapping. */
function toItem(row: Row) {
  return {
    id: row.id,
    kind: 'speech',
    title: row.title || 'Untitled',
    author: row.author || 'Anonymous',
    category: row.category || 'General',
    occasion: row.occasion || '',
    tags: row.tags || '',
    preview: row.preview || '',
    content: row.content || '',
    uid: row.uid,
    username: row.username || undefined,
    slug: row.slug || undefined,
    folder: row.folder || undefined,
    credits: row.credits || undefined,
    signature: row.signature || undefined,
    allowCopy: row.allow_copy !== 0,
    ad: false,
    views: Number(row.views ?? 0),
    likes: Number(row.likes ?? 0),
    dislikes: Number(row.dislikes ?? 0),
    shares: Number(row.shares ?? 0),
    createdAt: String(row.published_at ?? '').slice(0, 10),
    updatedAt: String(row.updated_at ?? ''),
    createdMs: row.published_at ? new Date(row.published_at).getTime() : 0,
  };
}

/**
 * FTS5 rejects bare punctuation and can be *made* to mean something if we pass
 * a query through, so every term is quoted and the whole thing is joined with
 * AND. A search for `"dragon's" breath` becomes `"dragon" AND "s" AND "breath"`
 * rather than a syntax error or a wildcard the caller did not ask for.
 */
function toMatchQuery(term: string): string {
  return term
    // Punctuation goes first, so `dr"agon;--` is the word `dragon` rather than
    // two fragments — and so nothing a reader types can become FTS5 syntax.
    .replace(/[^a-z0-9\s]/gi, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 1)
    .slice(0, 8)
    .map((word) => `"${word}"`)
    .join(' AND ');
}

/* ------------------------------------------------------------------ */
/* Handler                                                             */
/* ------------------------------------------------------------------ */

export default async function handler(req: IncomingMessage, res: ServerResponse) {
  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.setHeader('Allow', 'GET, OPTIONS');
    res.end();
    return;
  }

  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    send(res, 405, {
      error: 'method_not_allowed',
      method: req.method,
      message:
        'This endpoint only accepts GET. It serves the public library: /api/library?q=…, ?username=…, ?id=…',
    });
    return;
  }

  if (!TURSO_URL || !TURSO_TOKEN) {
    send(res, 503, {
      error: 'library_not_configured',
      message:
        'The reading room is not configured (TURSO_DATABASE_URL / TURSO_AUTH_TOKEN). ' +
        'The app is reading the same rows from Postgres instead.',
    });
    return;
  }

  const url = new URL(req.url ?? '/api/library', 'http://localhost');
  const id = url.searchParams.get('id');
  const username = (url.searchParams.get('username') ?? '').trim().toLowerCase();
  const term = (url.searchParams.get('q') ?? '').trim();
  const max = Math.min(Math.max(Number(url.searchParams.get('max') ?? 50) || 50, 1), 200);
  const offset = Math.max(Number(url.searchParams.get('offset') ?? 0) || 0, 0);

  let createClient: typeof import('@libsql/client').createClient;
  try {
    ({ createClient } = await import('@libsql/client'));
  } catch (error) {
    send(res, 503, {
      error: 'library_unreachable',
      message: `The SQLite client could not be loaded: ${(error as Error).message}`,
    });
    return;
  }

  const db = createClient({ url: TURSO_URL, authToken: TURSO_TOKEN });

  try {
    let rows: Row[] = [];
    let total: number | undefined;

    if (id) {
      const result = await db.execute({ sql: 'select * from library where id = ?', args: [id] });
      rows = result.rows as unknown as Row[];
    } else if (username) {
      const result = await db.execute({
        sql: 'select * from library where lower(username) = ? order by published_at desc limit ? offset ?',
        args: [username, max, offset],
      });
      rows = result.rows as unknown as Row[];
    } else if (term) {
      const match = toMatchQuery(term);
      if (!match) {
        send(res, 200, { items: [], total: 0 }, true);
        return;
      }
      const result = await db.execute({
        sql: `select library.* from library_fts
                join library on library.rowid = library_fts.rowid
               where library_fts match ?
               order by bm25(library_fts)
               limit ? offset ?`,
        args: [match, max, offset],
      });
      rows = result.rows as unknown as Row[];
      const count = await db.execute({
        sql: 'select count(*) as n from library_fts where library_fts match ?',
        args: [match],
      });
      total = Number((count.rows[0] as unknown as { n: number })?.n ?? rows.length);
    } else {
      const result = await db.execute({
        sql: 'select * from library order by published_at desc limit ? offset ?',
        args: [max, offset],
      });
      rows = result.rows as unknown as Row[];
    }

    // An id lookup is always fresh; listings may sit at the edge for a minute,
    // because the library changes on the order of minutes, not seconds.
    send(res, 200, { items: rows.map(toItem), total }, !id);
    return;
  } catch (error) {
    // A missing table means the schema has not been applied yet; anything else
    // is a genuine failure. Both are reported as-is rather than swallowed.
    send(res, 503, {
      error: 'library_unreachable',
      message: (error as Error).message,
    });
  }
}
