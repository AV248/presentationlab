import { revalidatePath } from 'next/cache';
import { PresentationError, verifyClerkRequest } from '@/server/presentations';
import { recordPresentationShare } from '@/server/reactions';
import { readJsonObject, RequestBodyTooLarge } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const rate = new Map<string, { count: number; resetsAt: number }>();
const WINDOW_MS = 60_000;
const LIMIT = 90;

function json(status: number, body: unknown) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow',
      Vary: 'Authorization',
    },
  });
}

function overLimit(uid: string): boolean {
  const now = Date.now();
  const current = rate.get(uid);
  if (!current || now >= current.resetsAt) {
    if (rate.size > 5000) {
      for (const [key, entry] of rate) if (now >= entry.resetsAt) rate.delete(key);
    }
    rate.set(uid, { count: 1, resetsAt: now + WINDOW_MS });
    return false;
  }
  current.count += 1;
  return current.count > LIMIT;
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: { Allow: 'POST, OPTIONS' } });
}

export async function POST(request: Request) {
  let identity;
  try {
    identity = await verifyClerkRequest(request);
  } catch (error) {
    const status = error instanceof PresentationError ? error.status : 401;
    return json(status, {
      error: status === 401 ? 'unauthorized' : 'session_verification_unavailable',
      message: status === 401 ? 'Sign in again to count this share.' : 'The share counter is unavailable.',
    });
  }
  if (overLimit(identity.uid)) return json(429, { error: 'rate_limited', message: 'Wait a moment before counting another share.' });

  let body: Record<string, unknown>;
  try { body = await readJsonObject(request, 2048); }
  catch (error) {
    return json(error instanceof RequestBodyTooLarge ? 413 : 400, {
      error: error instanceof RequestBodyTooLarge ? 'request_too_large' : 'invalid_json',
    });
  }
  const speechId = typeof body.id === 'string' ? body.id.trim() : '';
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(speechId)) return json(400, { error: 'invalid_presentation_id' });

  try {
    const shares = await recordPresentationShare(identity, speechId);
    revalidatePath('/api/library');
    return json(200, { shares });
  } catch (error) {
    const status = error instanceof PresentationError ? error.status : 503;
    return json(status, {
      error: error instanceof PresentationError ? error.code : 'share_write_failed',
      message: error instanceof Error ? error.message : 'The share count could not be saved.',
    });
  }
}

function methodNotAllowed(request: Request) {
  return json(405, { error: 'method_not_allowed', method: request.method });
}

export const GET = methodNotAllowed;
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;
