import { after } from 'next/server';
import {
  reconcileConvexSafetySamples,
  writeConvexSafetySnapshot,
} from '@/server/convexSafety';
import {
  PresentationError,
  verifyClerkRequest,
} from '@/server/presentations';

export const runtime = 'nodejs';

function json(status: number, body: unknown) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex',
      Vary: 'Authorization',
    },
  });
}

function defer(task: () => Promise<void>) {
  try {
    after(task);
  } catch {
    // Keep the optional mirror best-effort in route harnesses without Next context.
    void task();
  }
}

export async function POST(request: Request) {
  try {
    const identity = await verifyClerkRequest(request);
    if (!identity.convexToken) {
      return new Response(null, {
        status: 204,
        headers: { 'Cache-Control': 'no-store', Vary: 'Authorization' },
      });
    }

    const raw = await request.text();
    if (!raw || raw.length > 2048) throw new PresentationError('The safety request is empty or too large.');
    let body: unknown;
    try { body = JSON.parse(raw); }
    catch { throw new PresentationError('The safety request could not be read.'); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new PresentationError('The safety request has an invalid shape.');
    }
    const data = body as Record<string, unknown>;
    if (data.operation === 'backup') {
      const presentationId = typeof data.presentationId === 'string' ? data.presentationId.trim() : '';
      if (!/^[\w-]{1,100}$/.test(presentationId)) throw new PresentationError('The presentation id is invalid.');
      defer(() => writeConvexSafetySnapshot(identity, presentationId));
    } else if (data.operation === 'reconcile') {
      defer(() => reconcileConvexSafetySamples(identity));
    } else {
      throw new PresentationError('Choose a valid safety operation.');
    }
    return json(202, { ok: true });
  } catch (error) {
    if (error instanceof PresentationError) {
      return json(error.status, { error: error.code, message: error.message });
    }
    return json(500, { error: 'safety_request_failed', message: 'The optional safety work could not be queued.' });
  }
}

export function GET() {
  return json(405, { error: 'method_not_allowed', message: 'Use POST to queue optional safety work.' });
}
