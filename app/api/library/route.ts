import { readLibrary, readSpeechResult, readWriterResult, searchLibraryResult } from '@/server/reading';
import { TURSO_CONFIGURED, libraryTableExists, turso } from '@/server/turso';

export const runtime = 'nodejs';

const EDGE_TTL_SECONDS = 10;

function json(status: number, body: unknown, cache = false) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': cache
        ? `public, max-age=${EDGE_TTL_SECONDS}, s-maxage=${EDGE_TTL_SECONDS}, stale-while-revalidate=300`
        : 'no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}

function methodNotAllowed(method: string) {
  return json(405, {
    error: 'method_not_allowed',
    method,
    message: 'This endpoint serves the Turso presentation library with GET only.',
  });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: { Allow: 'GET, HEAD, OPTIONS' } });
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const id = (url.searchParams.get('id') ?? '').trim();
  const username = (url.searchParams.get('username') ?? '').trim().toLowerCase();
  const term = (url.searchParams.get('q') ?? '').trim();
  const max = Math.min(Math.max(Number(url.searchParams.get('max') ?? 50) || 50, 1), 200);
  const offset = Math.max(Number(url.searchParams.get('offset') ?? 0) || 0, 0);

  try {
    if (id) {
      const result = await readSpeechResult(id);
      if (result.source === 'none') return json(503, { error: 'library_unavailable' });
      return json(200, { items: result.speech ? [result.speech] : [] });
    }
    if (username) {
      const page = await readWriterResult(username, max);
      if (page.source === 'none') return json(503, { error: 'library_unavailable' });
      return json(200, { items: page.items, total: page.items.length }, true);
    }
    if (term) {
      const page = await searchLibraryResult(term, max);
      if (page.source === 'none') return json(503, { error: 'library_unavailable' });
      return json(200, { items: page.items, total: page.items.length }, true);
    }
    const page = await readLibrary({ max, offset });
    if (page.source === 'none') return json(503, { error: 'library_unavailable' });
    return json(200, { items: page.items, total: page.items.length }, true);
  } catch {
    return json(503, { error: 'library_unavailable', message: 'The Turso library could not be read.' });
  }
}

export async function HEAD() {
  const configured = TURSO_CONFIGURED;
  const db = configured ? await turso() : null;
  let exists = false;
  try {
    exists = Boolean(db && await libraryTableExists(db));
  } catch {
    exists = false;
  } finally {
    db?.close();
  }
  return new Response(null, {
    status: configured && exists ? 204 : 503,
    headers: {
      'X-Library-Configured': String(configured),
      'X-Reading-Room': configured && exists ? 'ready' : configured ? 'unreachable' : 'absent',
      'X-Profile-Store': 'supabase',
      'Cache-Control': 'no-store',
    },
  });
}

export const POST = (request: Request) => methodNotAllowed(request.method);
export const PUT = (request: Request) => methodNotAllowed(request.method);
export const PATCH = (request: Request) => methodNotAllowed(request.method);
export const DELETE = (request: Request) => methodNotAllowed(request.method);
