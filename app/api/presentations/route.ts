import { after } from 'next/server';
import { reconcileConvexSafetySamples } from '@/server/convexSafety';
import {
  deletePresentation,
  normalizeShareInput,
  PresentationError,
  publishPresentation,
  readAuthorProfile,
  updatePresentation,
  verifyClerkRequest,
} from '@/server/presentations';

export const runtime = 'nodejs';

const MAX_BODY_CHARS = 210_000;

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

async function bodyOf(request: Request): Promise<Record<string, unknown>> {
  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > MAX_BODY_CHARS) throw new PresentationError('This presentation is too large to share.');
  const text = await request.text();
  if (!text || text.length > MAX_BODY_CHARS) throw new PresentationError('The request is empty or too large.');
  try {
    const body = JSON.parse(text) as unknown;
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error('invalid shape');
    return body as Record<string, unknown>;
  } catch {
    throw new PresentationError('The request could not be read. Send valid presentation details.');
  }
}

function failure(error: unknown) {
  if (error instanceof PresentationError) {
    return json(error.status, { error: error.code, message: error.message });
  }
  console.error('[presentations]', error);
  return json(500, { error: 'internal_error', message: 'The presentation could not be saved. Try again shortly.' });
}

/** Run optional Convex safety work without delaying the canonical Turso reply. */
function deferSafetyWork(task: () => Promise<void>) {
  try {
    after(task);
  } catch {
    // Direct route-harness calls have no Next request context; keep the fallback
    // best-effort and do not turn the primary share into an error.
    void task();
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: { Allow: 'POST, PUT, DELETE, OPTIONS' } });
}

export async function POST(request: Request) {
  try {
    const identity = await verifyClerkRequest(request);
    const input = normalizeShareInput(await bodyOf(request));
    const profile = await readAuthorProfile(identity);
    // New ids are server-generated so writers cannot grind the global sample
    // ordering by choosing their own presentation id.
    const id = await publishPresentation(identity, profile, { ...input, id: undefined });
    return json(201, { ok: true, id, username: profile.username, slug: input.slug });
  } catch (error) {
    return failure(error);
  }
}

export async function PUT(request: Request) {
  try {
    const identity = await verifyClerkRequest(request);
    const input = normalizeShareInput(await bodyOf(request));
    if (!input.id) throw new PresentationError('The presentation id is missing.');
    const profile = await readAuthorProfile(identity);
    await updatePresentation(identity, profile, { ...input, id: input.id });
    return json(200, { ok: true, id: input.id, username: profile.username, slug: input.slug });
  } catch (error) {
    return failure(error);
  }
}

export async function DELETE(request: Request) {
  try {
    const identity = await verifyClerkRequest(request);
    const body = await bodyOf(request);
    const id = typeof body.id === 'string' ? body.id.trim() : '';
    if (!/^[\w-]{1,100}$/.test(id)) throw new PresentationError('The presentation id is invalid.');
    await deletePresentation(identity, id);
    if (identity.convexToken) deferSafetyWork(() => reconcileConvexSafetySamples(identity));
    return json(200, { ok: true, id });
  } catch (error) {
    return failure(error);
  }
}

function methodNotAllowed(request: Request) {
  return json(405, {
    error: 'method_not_allowed',
    method: request.method,
    message: 'Use POST to share, PUT to edit, or DELETE to remove one of your published presentations.',
  });
}

export const GET = methodNotAllowed;
export const PATCH = methodNotAllowed;
