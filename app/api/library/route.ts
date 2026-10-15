import {
  POSTGRES_CONFIGURED,
  readLibrary,
  readSpeech,
  readWriter,
  searchLibrary,
} from '@/server/reading';
import { TURSO_CONFIGURED, TURSO_URL, libraryTableExists, turso } from '@/server/turso';

/**
 * The reading room — public reads for the browser.
 *
 * Reading is free and reading is most of the traffic, so it is served from a
 * SQLite copy close to the reader, with FTS5 behind the search box. This is the
 * only endpoint that holds the Turso token; the browser never sees it.
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
 * A 503 is not an outage: the browser falls back to reading the same rows from
 * Postgres, and the server components read them directly. That is why this
 * endpoint can be honest about being absent.
 *
 * The reads themselves live in `src/server/reading.ts`, because the server now
 * performs the same ones to render HTML before the browser runs. One
 * implementation, two callers — this endpoint can never answer differently
 * from the page it is loading.
 */

export const runtime = 'nodejs';

/** How long a reader may be served from the edge's last answer. */
const EDGE_TTL_SECONDS = 60;

function json(status: number, body: unknown, cache = false) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': cache
        ? `public, max-age=${EDGE_TTL_SECONDS}, s-maxage=${EDGE_TTL_SECONDS}`
        : 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function methodNotAllowed(method: string) {
  return Response.json(
    {
      error: 'method_not_allowed',
      method,
      message:
        'This endpoint only accepts GET. It serves the public library: /api/library?q=…, ?username=…, ?id=…',
    },
    { status: 405, headers: { Allow: 'GET, OPTIONS', 'Cache-Control': 'no-store' } },
  );
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: { Allow: 'GET, OPTIONS' } });
}

export async function GET(request: Request) {
  /*
   * The one case where this endpoint has nothing to say.
   *
   * Two databases can answer a read: the reading room, and Postgres behind it.
   * With neither configured there is no library at all — and *that* is a
   * diagnosable state, not an outage to hide: the environment panel and
   * `npm run check:routes` both read this answer.
   *
   * With either one configured, the read proceeds. That asymmetry is
   * deliberate. A 503 used to be returned whenever the reading room was
   * missing, which told a browser "there is no library" while a perfectly good
   * Postgres sat there — the endpoint disagreeing with the page it loads.
   */
  if (!TURSO_CONFIGURED && !POSTGRES_CONFIGURED) {
    return json(503, {
      error: 'library_not_configured',
      message:
        'No library database is configured. Set TURSO_DATABASE_URL / TURSO_AUTH_TOKEN ' +
        'for the reading room, or VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY for Postgres.',
    });
  }

  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  const username = (url.searchParams.get('username') ?? '').trim().toLowerCase();
  const term = (url.searchParams.get('q') ?? '').trim();
  const max = Math.min(Math.max(Number(url.searchParams.get('max') ?? 50) || 50, 1), 200);
  const offset = Math.max(Number(url.searchParams.get('offset') ?? 0) || 0, 0);

  try {
    if (id) {
      const speech = await readSpeech(id);
      // An id lookup is always fresh; listings may sit at the edge for a
      // minute, because the library changes on the order of minutes.
      return json(200, { items: speech ? [speech] : [] });
    }
    if (username) {
      return json(200, { items: await readWriter(username, max) }, true);
    }
    if (term) {
      const items = await searchLibrary(term, max);
      return json(200, { items, total: items.length }, true);
    }
    const page = await readLibrary({ max, offset });
    if (!page.items.length) {
      /*
       * `source` is what actually answered — so an empty list is reported as
       * empty only when something really did answer it. "" (nothing answered)
       * reaches the probe below, which explains itself.
       */
      if (page.source === 'none') {
        const failure = await unreachableUnlessFallback();
        if (failure) return failure;
      }

    }
    return json(200, { items: page.items }, true);
  } catch (error) {
    // Nothing here throws by design — every source failure is handled inside
    // the reader — so this is the backstop, and it says what actually broke.
    return json(503, { error: 'library_unreachable', message: (error as Error).message });
  }
}

/**
 * Turso is configured but the reading room has no tables yet, and there is no
 * Postgres to fall back to. That is the one situation where "empty" would be a
 * lie, so it is reported with the fix in it.
 */
async function unreachableUnlessFallback(): Promise<Response | null> {
  if (!TURSO_CONFIGURED || POSTGRES_CONFIGURED) return null;
  const db = await turso();
  if (!db) {
    return json(503, {
      error: 'library_unreachable',
      message: `The reading room could not be reached (TURSO_DATABASE_URL is ${TURSO_URL ? 'set' : 'missing'}).`,
    });
  }
  try {
    if (await libraryTableExists(db)) return null;
  } finally {
    db.close();
  }
  return json(503, {
    error: 'library_unreachable',
    message:
      'The reading room exists but has no tables yet. Open the site signed in and use the reading-room rebuild, or apply turso/schema.sql to that database.',
  });
}

/**
 * The one honest "not set up" answer.
 *
 * Deliberately not a 503 on every read: without Turso the reader silently uses
 * Postgres and the site is complete. This method exists so that a *deliberate*
 * probe — the environment panel, the route check — can ask the question and get
 * a straight answer.
 */
export async function HEAD() {
  const configured = TURSO_CONFIGURED || POSTGRES_CONFIGURED;
  return new Response(null, {
    status: configured ? 204 : 503,
    headers: {
      'X-Library-Configured': String(configured),
      // Named separately, because they are two different pieces of setup and
      // an operator staring at this header wants to know which one is missing.
      'X-Reading-Room': TURSO_CONFIGURED ? 'configured' : 'absent',
      'X-Postgres': POSTGRES_CONFIGURED ? 'configured' : 'absent',
      'Cache-Control': 'no-store',
    },
  });
}

export const POST = (request: Request) => methodNotAllowed(request.method);
export const PUT = (request: Request) => methodNotAllowed(request.method);
export const PATCH = (request: Request) => methodNotAllowed(request.method);
export const DELETE = (request: Request) => methodNotAllowed(request.method);
