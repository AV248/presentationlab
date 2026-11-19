import { PresentationError, verifyClerkRequest } from '@/server/presentations';
import { serverEnvAny } from '@/server/env';
import { readJsonObject, RequestBodyTooLarge } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SUPABASE_URL = serverEnvAny('VITE_SUPABASE_URL', 'SUPABASE_URL').replace(/\/+$/, '');
const SUPABASE_ANON_KEY = serverEnvAny('VITE_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY');
const KINDS = new Set(['feedback', 'report', 'message']);
const rate = new Map<string, { count: number; resetsAt: number }>();

function response(status: number, body: unknown) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'X-Robots-Tag': 'noindex, nofollow',
    },
  });
}

export async function POST(request: Request) {
  let identity;
  try { identity = await verifyClerkRequest(request); }
  catch (error) {
    const status = error instanceof PresentationError ? error.status : 401;
    return response(status, {
      error: status === 401 ? 'unauthorized' : 'auth_service_unavailable',
      message: status === 401 ? 'Sign in before sending a private message.' : 'Session verification is temporarily unavailable.',
    });
  }
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return response(503, { error: 'contact_unavailable' });

  const now = Date.now();
  if (rate.size > 5000) {
    for (const [key, entry] of rate) if (now >= entry.resetsAt) rate.delete(key);
  }
  const current = rate.get(identity.uid);
  if (current && current.resetsAt > now && current.count >= 6) {
    return response(429, { error: 'rate_limited', message: 'Please wait before sending another note.' });
  }
  if (!current || current.resetsAt <= now) rate.set(identity.uid, { count: 1, resetsAt: now + 10 * 60_000 });
  else current.count += 1;

  let body: Record<string, unknown>;
  try { body = await readJsonObject(request, 20_000); }
  catch (error) {
    return response(error instanceof RequestBodyTooLarge ? 413 : 400, {
      error: error instanceof RequestBodyTooLarge ? 'request_too_large' : 'invalid_json',
    });
  }

  const kind = typeof body.kind === 'string' ? body.kind : '';
  const category = typeof body.category === 'string' ? body.category.trim().slice(0, 80) : '';
  const subject = typeof body.subject === 'string' ? body.subject.trim().slice(0, 200) : '';
  const message = typeof body.message === 'string' ? body.message.trim() : '';
  const pageURL = typeof body.pageUrl === 'string' ? body.pageUrl.trim().slice(0, 1000) : '';
  const contactEmail = typeof body.contactEmail === 'string' ? body.contactEmail.trim().slice(0, 254) : '';
  if (!KINDS.has(kind) || message.length < 1 || message.length > 5000) {
    return response(400, { error: 'invalid_message', message: 'Choose a message type and enter between 1 and 5,000 characters.' });
  }
  if (contactEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(contactEmail)) {
    return response(400, { error: 'invalid_email', message: 'That contact email does not look right.' });
  }
  let cleanPageURL = '';
  if (pageURL) {
    try {
      const parsed = new URL(pageURL, request.url);
      if (parsed.protocol === 'https:' || parsed.protocol === 'http:') cleanPageURL = parsed.toString();
    } catch { /* ignore malformed optional page context */ }
  }

  const target = new URL('/rest/v1/inbox_messages', SUPABASE_URL);
  const inserted = await fetch(target, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${identity.token}`,
      'Content-Type': 'application/json',
      Prefer: 'return=minimal',
    },
    body: JSON.stringify({
      uid: identity.uid,
      kind,
      category,
      subject,
      message,
      page_url: cleanPageURL,
      contact_email: contactEmail,
    }),
    signal: AbortSignal.timeout(5000),
  }).catch(() => null);
  if (!inserted?.ok) {
    const reason = inserted ? await inserted.text().catch(() => '') : '';
    console.error('[contact] inbox insert failed', inserted?.status ?? 'network', reason.slice(0, 200));
    return response(503, { error: 'contact_write_failed', message: 'The note could not be saved. Please try again later.' });
  }
  return response(201, { ok: true });
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: { Allow: 'POST, OPTIONS' } });
}

function methodNotAllowed(request: Request) {
  return response(405, { error: 'method_not_allowed', method: request.method });
}
export const GET = methodNotAllowed;
export const HEAD = methodNotAllowed;
export const PUT = methodNotAllowed;
export const PATCH = methodNotAllowed;
export const DELETE = methodNotAllowed;
