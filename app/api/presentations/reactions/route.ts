import { revalidatePath } from 'next/cache';
import { PresentationError, verifyClerkRequest } from '@/server/presentations';
import { readJsonObject, RequestBodyTooLarge } from '@/server/http';
import {
  readMyPresentationReactions,
  setPresentationReaction,
  type PresentationReactionKind,
} from '@/server/reactions';

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

async function identityFor(request: Request) {
  try {
    return await verifyClerkRequest(request);
  } catch (error) {
    const status = error instanceof PresentationError ? error.status : 401;
    const code = error instanceof PresentationError ? error.code : 'session_verification_failed';
    throw Object.assign(new Error(status === 401 ? 'Sign in again to react.' : 'The reaction service is unavailable.'), { status, code });
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: { Allow: 'GET, POST, OPTIONS' } });
}

export async function GET(request: Request) {
  let identity;
  try { identity = await identityFor(request); }
  catch (error) {
    const status = Number((error as { status?: number }).status ?? 401);
    return json(status, {
      error: status === 401 ? 'unauthorized' : 'session_verification_unavailable',
      message: (error as Error).message,
    });
  }
  return json(200, { reactions: await readMyPresentationReactions(identity.uid) });
}

export async function POST(request: Request) {
  let identity;
  try { identity = await identityFor(request); }
  catch (error) {
    const status = Number((error as { status?: number }).status ?? 401);
    return json(status, {
      error: status === 401 ? 'unauthorized' : 'session_verification_unavailable',
      message: (error as Error).message,
    });
  }
  if (overLimit(identity.uid)) return json(429, { error: 'rate_limited', message: 'Wait a moment before reacting again.' });

  let body: Record<string, unknown>;
  try { body = await readJsonObject(request, 2048); }
  catch (error) {
    return json(error instanceof RequestBodyTooLarge ? 413 : 400, {
      error: error instanceof RequestBodyTooLarge ? 'request_too_large' : 'invalid_json',
    });
  }
  const speechId = typeof body.id === 'string' ? body.id.trim() : '';
  const kind = body.kind;
  if (!/^[A-Za-z0-9_-]{1,100}$/.test(speechId) || (kind !== 'like' && kind !== 'dislike')) {
    return json(400, { error: 'invalid_reaction', message: 'Choose a published presentation and a like or dislike.' });
  }

  try {
    const state = await setPresentationReaction(identity, speechId, kind as PresentationReactionKind);
    revalidatePath('/api/library');
    return json(200, state);
  } catch (error) {
    const status = error instanceof PresentationError ? error.status : 503;
    return json(status, {
      error: error instanceof PresentationError ? error.code : 'reaction_write_failed',
      message: error instanceof Error ? error.message : 'That reaction could not be saved.',
    });
  }
}

function methodNotAllowed(request: Request) {
  return json(405, { error: 'method_not_allowed', method: request.method });
}

export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;
