import { revalidatePath } from 'next/cache';
import { ensureLibrarySchema } from '@/server/reading';
import { turso, TURSO_CONFIGURED } from '@/server/turso';
import { isAdministrator, PresentationError, verifyClerkRequest } from '@/server/presentations';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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

export async function GET(request: Request) {
  try {
    const identity = await authorize(request);
    if (!identity) return json(403, { error: 'forbidden' });
    if (!TURSO_CONFIGURED) return json(503, { error: 'turso_unavailable', message: 'The presentation store is not configured.' });
    const schema = await ensureLibrarySchema();
    if (!schema.ok) return json(503, { error: 'turso_schema_unavailable', message: 'The moderation table is unavailable.' });
    const db = await turso();
    if (!db) return json(503, { error: 'turso_unavailable' });
    try {
      const result = await db.execute({
        sql: `select id, username, slug, folder, title, preview, category, author,
                     moderation_status, moderation_note, updated_at, published_at
              from library order by updated_at desc, published_at desc limit 500`,
      });
      const items = result.rows.map((raw) => {
        const row = raw as Record<string, unknown>;
        return {
          id: String(row.id ?? ''),
          username: String(row.username ?? ''),
          slug: String(row.slug ?? ''),
          folder: String(row.folder ?? ''),
          title: String(row.title ?? 'Untitled'),
          preview: String(row.preview ?? ''),
          category: String(row.category ?? ''),
          author: String(row.author ?? ''),
          status: row.moderation_status === 'published' ? 'published' : 'held',
          note: String(row.moderation_note ?? ''),
          updatedAt: String(row.updated_at ?? row.published_at ?? ''),
        };
      }).filter((item) => item.id);
      return json(200, { items });
    } finally {
      db.close();
    }
  } catch (error) {
    const status = error instanceof PresentationError ? error.status : 500;
    return json(status, {
      error: 'moderation_unavailable',
      message: status === 401 ? 'Sign in again to use moderation.' : 'The moderation list could not be loaded.',
    });
  }
}

export async function POST(request: Request) {
  try {
    const identity = await authorize(request);
    if (!identity) return json(403, { error: 'forbidden' });
    const length = Number(request.headers.get('content-length') ?? 0);
    if (length > 8000) return json(413, { error: 'request_too_large' });
    const body = await request.json() as Record<string, unknown>;
    const id = typeof body.id === 'string' ? body.id.trim() : '';
    const status = body.status;
    const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) : '';
    if (!/^[A-Za-z0-9_-]{1,100}$/.test(id) || (status !== 'published' && status !== 'held')) {
      return json(400, { error: 'invalid_moderation_request', message: 'Choose a presentation and a valid moderation status.' });
    }
    if (!TURSO_CONFIGURED) return json(503, { error: 'turso_unavailable' });
    const schema = await ensureLibrarySchema();
    if (!schema.ok) return json(503, { error: 'turso_schema_unavailable' });
    const db = await turso();
    if (!db) return json(503, { error: 'turso_unavailable' });
    try {
      const now = new Date().toISOString();
      const result = await db.execute({
        sql: 'update library set moderation_status = ?, moderation_note = ?, updated_at = ? where id = ?',
        args: [status, note, now, id],
      });
      if (!result.rowsAffected) return json(404, { error: 'presentation_not_found' });
      const record = await db.execute({
        sql: 'select username, slug, folder from library where id = ? limit 1',
        args: [id],
      });
      const row = record.rows[0] as Record<string, unknown> | undefined;
      if (row) {
        const username = String(row.username ?? '');
        const slug = String(row.slug ?? id);
        const folder = String(row.folder ?? '');
        revalidatePath(`/read/${encodeURIComponent(id)}`);
        if (username) revalidatePath(`/${[username, folder, slug].filter(Boolean).map(encodeURIComponent).join('/')}`);
      }
      revalidatePath('/');
      revalidatePath('/sitemap.xml');
      return json(200, { ok: true, id, status, actorUid: identity.uid });
    } finally {
      db.close();
    }
  } catch (error) {
    const status = error instanceof PresentationError ? error.status : 500;
    return json(status, {
      error: 'moderation_update_failed',
      message: status === 401 ? 'Sign in again to use moderation.' : 'The moderation change could not be saved.',
    });
  }
}

export async function PUT() { return json(405, { error: 'method_not_allowed' }); }
export async function PATCH() { return json(405, { error: 'method_not_allowed' }); }
export async function DELETE() { return json(405, { error: 'method_not_allowed' }); }
