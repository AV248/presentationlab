import { fetchArrivals, fetchWebSpeech, searchWebSpeeches, SOURCES, type SourceId, type WebSpeech } from '@/services/webSources';

export const runtime = 'nodejs';
export const revalidate = 300;

const WINDOW_MS = 60_000;
const LIMIT = 45;
const requestCounts = new Map<string, { count: number; resetsAt: number }>();
const SOURCE_IDS = new Set<SourceId>(['wikisource', 'gutenberg', 'wikiquote']);
const SOURCE_HOSTS: Record<SourceId, string[]> = {
  wikisource: ['en.wikisource.org'],
  gutenberg: ['www.gutenberg.org', 'gutenberg.org'],
  wikiquote: ['en.wikiquote.org'],
};

function clientKey(request: Request): string {
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';
}

function overLimit(key: string): boolean {
  const now = Date.now();
  const current = requestCounts.get(key);
  if (!current || now >= current.resetsAt) {
    if (requestCounts.size > 4_000) {
      for (const [candidate, entry] of requestCounts) if (now >= entry.resetsAt) requestCounts.delete(candidate);
    }
    requestCounts.set(key, { count: 1, resetsAt: now + WINDOW_MS });
    return false;
  }
  current.count += 1;
  return current.count > LIMIT;
}

function json(status: number, body: unknown, cache = false) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': cache
        ? 'public, max-age=60, s-maxage=300, stale-while-revalidate=1800'
        : 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex',
    },
  });
}

function clampedInt(value: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? Math.min(Math.max(Math.floor(parsed), min), max) : fallback;
}

function publicSpeech(value: unknown): WebSpeech | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const sourceId = row.sourceId;
  if (typeof sourceId !== 'string' || !SOURCE_IDS.has(sourceId as SourceId)) return null;
  const source = sourceId as SourceId;
  const id = typeof row.id === 'string' ? row.id.trim() : '';
  const title = typeof row.title === 'string' ? row.title.trim().slice(0, 180) : '';
  const sourceUrl = typeof row.sourceUrl === 'string' ? row.sourceUrl : '';
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(id) || !title) return null;
  if (!id.startsWith(source === 'wikisource' ? 'ws-' : source === 'wikiquote' ? 'wq-' : 'pg-')) return null;
  try {
    const parsed = new URL(sourceUrl);
    if (parsed.protocol !== 'https:' || !SOURCE_HOSTS[source].includes(parsed.hostname)) return null;
  } catch {
    return null;
  }
  return {
    id,
    title,
    author: typeof row.author === 'string' ? row.author.slice(0, 180) : 'Unknown author',
    preview: typeof row.preview === 'string' ? row.preview.slice(0, 500) : '',
    content: typeof row.content === 'string' ? row.content.slice(0, 30_000) : '',
    sourceUrl,
    source: SOURCES[source].name,
    sourceId: source,
    licence: SOURCES[source].licence,
    fetchedAt: typeof row.fetchedAt === 'string' ? row.fetchedAt.slice(0, 40) : new Date().toISOString(),
  };
}

export async function GET(request: Request) {
  if (overLimit(clientKey(request))) return json(429, { error: 'rate_limited', message: 'Please wait a moment before asking the archives again.' });
  const url = new URL(request.url);
  const mode = url.searchParams.get('mode') ?? 'batch';

  try {
    if (mode === 'search') {
      const query = (url.searchParams.get('q') ?? '').trim().slice(0, 120);
      if (query.length < 2) return json(200, { speeches: [] }, true);
      const limit = clampedInt(url.searchParams.get('limit'), 12, 1, 20);
      const speeches = await searchWebSpeeches(query, limit);
      return json(200, { speeches }, true);
    }

    if (mode !== 'batch') return json(400, { error: 'unknown_mode' });
    const rawKnown = (url.searchParams.get('known') ?? '').slice(0, 4_000);
    const known = rawKnown.split(',').filter((id) => /^[A-Za-z0-9_-]{1,100}$/.test(id)).slice(-40);
    const goal = clampedInt(url.searchParams.get('goal'), 5, 1, 5);
    const offset = clampedInt(url.searchParams.get('offset'), 0, 0, 64);
    const seed = clampedInt(url.searchParams.get('seed'), 0, 0, 999_999);
    return json(200, await fetchArrivals(known, goal, offset, seed), true);
  } catch {
    return json(503, { error: 'archives_unavailable', message: 'The open archives could not be reached just now.' });
  }
}

export async function POST(request: Request) {
  if (overLimit(clientKey(request))) return json(429, { error: 'rate_limited', message: 'Please wait a moment before asking the archives again.' });
  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > 40_000) return json(413, { error: 'request_too_large' });
  try {
    const body = await request.json() as Record<string, unknown>;
    if (body.mode !== 'text') return json(400, { error: 'unknown_mode' });
    const speech = publicSpeech(body.speech);
    if (!speech) return json(400, { error: 'invalid_source_reference' });
    return json(200, { speech: await fetchWebSpeech(speech) });
  } catch {
    return json(400, { error: 'invalid_request' });
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: { Allow: 'GET, HEAD, POST, OPTIONS' } });
}

export async function HEAD(request: Request) {
  if (overLimit(clientKey(request))) return new Response(null, { status: 429, headers: { 'Cache-Control': 'no-store' } });
  return new Response(null, { status: 204, headers: { 'Cache-Control': 'public, max-age=60, s-maxage=300, stale-while-revalidate=1800' } });
}

function methodNotAllowed(request: Request) {
  return json(405, { error: 'method_not_allowed', method: request.method });
}

export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;
