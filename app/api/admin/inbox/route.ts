import { isAdministrator, PresentationError, verifyClerkRequest } from '@/server/presentations';
import { serverEnvAny } from '@/server/env';
import { readJsonObject, RequestBodyTooLarge } from '@/server/http';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SUPABASE_URL = serverEnvAny('VITE_SUPABASE_URL', 'SUPABASE_URL').replace(/\/+$/, '');
const SUPABASE_ANON_KEY = serverEnvAny('VITE_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY');
const VALID_STATUS = new Set(['new', 'read', 'resolved', 'dismissed']);

function json(status: number, body: unknown) {
  return Response.json(body, {
    status,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, private',
      'X-Robots-Tag': 'noindex, nofollow',
      'X-Content-Type-Options': 'nosniff',
      Vary: 'Authorization',
    },
  });
}

async function authorize(request: Request) {
  const identity = await verifyClerkRequest(request);
  if (!await isAdministrator(identity)) return null;
  return identity;
}

function tableURL(table: string, params: Record<string, string>) {
  const url = new URL(`/rest/v1/${table}`, SUPABASE_URL);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url;
}

async function readTable(table: string, params: Record<string, string>, token: string) {
  try {
    const response = await fetch(tableURL(table, params), {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${token}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      return { ok: false as const, status: response.status, rows: [] as Record<string, unknown>[] };
    }
    return { ok: true as const, status: response.status, rows: await response.json() as Record<string, unknown>[] };
  } catch {
    return { ok: false as const, status: 0, rows: [] as Record<string, unknown>[] };
  }
}

async function readFeedback(token: string) {
  const order = { order: 'created_at.desc', limit: '500' };
  const current = await readTable('feedback', {
    ...order,
    select: 'id,uid,rating,text,path,status,admin_note,created_at,updated_at',
  }, token);
  if (current.ok) return { ...current, workflowColumns: true };
  // Older installations may not yet have the workflow columns. Keep their
  // feedback readable, but make the missing moderation migration visible.
  const legacy = await readTable('feedback', {
    ...order,
    select: 'id,uid,rating,text,path,created_at',
  }, token);
  return { ...legacy, workflowColumns: false };
}

function normalizedStatus(value: unknown): 'new' | 'read' | 'resolved' | 'dismissed' {
  return typeof value === 'string' && VALID_STATUS.has(value)
    ? value as 'new' | 'read' | 'resolved' | 'dismissed'
    : 'new';
}

export async function GET(request: Request) {
  let identity;
  try {
    identity = await authorize(request);
    if (!identity) return json(403, { error: 'forbidden' });
  } catch (error) {
    const status = error instanceof PresentationError ? error.status : 401;
    return json(status, { error: 'unauthorized', message: status === 401 ? 'Sign in again to open the admin inbox.' : 'Admin authorization could not be checked.' });
  }
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return json(503, { error: 'inbox_unavailable', message: 'The profile database is not configured.' });

  const [messages, feedback] = await Promise.all([
    readTable('inbox_messages', {
      select: 'id,uid,kind,category,subject,message,page_url,contact_email,status,admin_note,created_at,updated_at',
      order: 'created_at.desc',
      limit: '500',
    }, identity.token),
    readFeedback(identity.token),
  ]);

  const items = [
    ...messages.rows.map((row) => ({
      id: String(row.id ?? ''),
      source: 'inbox' as const,
      kind: row.kind === 'report' || row.kind === 'message' ? row.kind : 'feedback' as const,
      category: String(row.category ?? ''),
      subject: String(row.subject ?? ''),
      message: String(row.message ?? ''),
      pageUrl: String(row.page_url ?? ''),
      contactEmail: String(row.contact_email ?? ''),
      uid: String(row.uid ?? ''),
      status: normalizedStatus(row.status),
      adminNote: String(row.admin_note ?? ''),
      rating: null as number | null,
      createdAt: String(row.created_at ?? ''),
      updatedAt: String(row.updated_at ?? ''),
    })),
    ...feedback.rows.map((row) => ({
      id: String(row.id ?? ''),
      source: 'feedback' as const,
      kind: 'feedback' as const,
      category: 'Site feedback',
      subject: '',
      message: String(row.text ?? ''),
      pageUrl: String(row.path ?? ''),
      contactEmail: '',
      uid: String(row.uid ?? ''),
      status: normalizedStatus(row.status),
      adminNote: String(row.admin_note ?? ''),
      rating: Number.isFinite(Number(row.rating)) ? Number(row.rating) : null,
      createdAt: String(row.created_at ?? ''),
      updatedAt: String(row.updated_at ?? row.created_at ?? ''),
    })),
  ].filter((item) => item.id && item.message).sort((a, b) => {
    const left = Date.parse(a.createdAt) || 0;
    const right = Date.parse(b.createdAt) || 0;
    return right - left;
  });

  const warnings: string[] = [];
  if (!messages.ok) warnings.push(messages.status === 404
    ? 'The private inbox table is missing. Apply the additive Supabase schema before accepting database messages.'
    : 'Private inbox messages could not be read. Check the database policies and connection.');
  if (!feedback.ok) warnings.push('Legacy star feedback could not be read. Check the feedback table and admin read policy.');
  else if (!feedback.workflowColumns) warnings.push('Feedback is readable, but its status/note columns are not installed yet. Apply the additive Supabase schema to enable moderation updates.');
  return json(200, { items, warnings, actorUid: identity.uid });
}

export async function PATCH(request: Request) {
  let identity;
  try {
    identity = await authorize(request);
    if (!identity) return json(403, { error: 'forbidden' });
  } catch (error) {
    const status = error instanceof PresentationError ? error.status : 401;
    return json(status, { error: 'unauthorized', message: status === 401 ? 'Sign in again to update the admin inbox.' : 'Admin authorization could not be checked.' });
  }
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return json(503, { error: 'inbox_unavailable' });

  let body: Record<string, unknown>;
  try { body = await readJsonObject(request, 5000); }
  catch (error) {
    return json(error instanceof RequestBodyTooLarge ? 413 : 400, {
      error: error instanceof RequestBodyTooLarge ? 'request_too_large' : 'invalid_json',
    });
  }
  const id = typeof body.id === 'string' ? body.id.trim() : '';
  const source = body.source;
  const status = body.status;
  const adminNote = typeof body.adminNote === 'string' ? body.adminNote.trim().slice(0, 1000) : '';
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)
    || (source !== 'inbox' && source !== 'feedback')
    || typeof status !== 'string' || !VALID_STATUS.has(status)) {
    return json(400, { error: 'invalid_inbox_update', message: 'Choose a message and a valid status.' });
  }

  const table = source === 'inbox' ? 'inbox_messages' : 'feedback';
  try {
    const response = await fetch(tableURL(table, { id: `eq.${id}` }), {
      method: 'PATCH',
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${identity.token}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify({ status, admin_note: adminNote, updated_at: new Date().toISOString() }),
      cache: 'no-store',
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      console.error('[admin/inbox] status update failed', response.status, detail.slice(0, 200));
      return json(response.status === 401 || response.status === 403 ? 403 : 503, {
        error: 'inbox_update_failed',
        message: response.status === 404
          ? 'This inbox table or its workflow columns are not installed yet.'
          : 'The database could not save this moderation update.',
      });
    }
    const rows = await response.json().catch(() => []) as unknown[];
    if (!rows.length) return json(404, { error: 'inbox_item_not_found' });
    return json(200, { ok: true, id, source, status, actorUid: identity.uid });
  } catch {
    return json(503, { error: 'inbox_update_failed', message: 'The database could not be reached.' });
  }
}

export function OPTIONS() {
  return new Response(null, { status: 204, headers: { Allow: 'GET, PATCH, OPTIONS' } });
}

function methodNotAllowed(request: Request) {
  return json(405, { error: 'method_not_allowed', method: request.method });
}
export const HEAD = methodNotAllowed;
export const POST = methodNotAllowed;
export const PUT = methodNotAllowed;
export const DELETE = methodNotAllowed;
