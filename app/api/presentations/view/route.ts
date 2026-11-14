import { countPresentationView, PresentationError } from '@/server/presentations';

export const runtime = 'nodejs';

const hits = new Map<string, { count: number; resetsAt: number }>();
const WINDOW_MS = 60_000;
const LIMIT_PER_WINDOW = 90;

function clientKey(request: Request): string {
  // Used in memory for coarse abuse control only. It is never logged or stored.
  return request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || request.headers.get('x-real-ip')
    || 'unknown';
}

function overLimit(key: string): boolean {
  const now = Date.now();
  const current = hits.get(key);
  if (!current || now >= current.resetsAt) {
    if (hits.size > 4_000) {
      for (const [candidate, entry] of hits) if (now >= entry.resetsAt) hits.delete(candidate);
    }
    hits.set(key, { count: 1, resetsAt: now + WINDOW_MS });
    return false;
  }
  current.count += 1;
  return current.count > LIMIT_PER_WINDOW;
}

function json(status: number, body: unknown) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex',
    },
  });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: { Allow: 'POST, OPTIONS' } });
}

export async function POST(request: Request) {
  if (overLimit(clientKey(request))) return json(429, { error: 'rate_limited' });
  try {
    const length = Number(request.headers.get('content-length') ?? 0);
    if (length > 2048) throw new PresentationError('The view details are too large.');
    const body = await request.json() as Record<string, unknown>;
    const id = typeof body.id === 'string' ? body.id.trim() : '';
    const sessionId = typeof body.sessionId === 'string' ? body.sessionId.trim() : '';
    if (!/^[\w-]{1,100}$/.test(id)) throw new PresentationError('The presentation id is invalid.');
    if (!/^[A-Za-z0-9_-]{16,100}$/.test(sessionId)) throw new PresentationError('The reader session is invalid.');
    const result = await countPresentationView(id, sessionId);
    return json(200, result);
  } catch (error) {
    if (error instanceof PresentationError) return json(error.status, { error: error.code, message: error.message });
    return json(503, { error: 'view_write_failed', message: 'This read could not be counted just now.' });
  }
}

function methodNotAllowed(request: Request) {
  return json(405, { error: 'method_not_allowed', method: request.method });
}

export const GET = methodNotAllowed;
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;
