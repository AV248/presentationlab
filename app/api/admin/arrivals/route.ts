import { revalidatePath } from 'next/cache';
import { ensureLibrarySchema } from '@/server/reading';
import { turso, TURSO_CONFIGURED } from '@/server/turso';
import { isAdministrator, PresentationError, verifyClerkRequest } from '@/server/presentations';
import { serverEnvAny } from '@/server/env';
import { readWebSpeechById } from '@/services/webSources';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SUPABASE_URL = serverEnvAny('VITE_SUPABASE_URL', 'SUPABASE_URL').replace(/\/+$/, '');
const SUPABASE_ANON_KEY = serverEnvAny('VITE_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY');
const requests = new Map<string, { count: number; resetsAt: number }>();

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

function limited(uid: string): boolean {
  const now = Date.now();
  const current = requests.get(uid);
  if (!current || now >= current.resetsAt) {
    if (requests.size > 2000) for (const [key, value] of requests) if (now >= value.resetsAt) requests.delete(key);
    requests.set(uid, { count: 1, resetsAt: now + 60_000 });
    return false;
  }
  current.count += 1;
  return current.count > 24;
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && /^(ws|wq|pg)-\d{1,12}$/.test(value.trim());
}

async function authorized(request: Request) {
  const identity = await verifyClerkRequest(request);
  if (!await isAdministrator(identity)) return null;
  return identity;
}

async function readyStore() {
  if (!TURSO_CONFIGURED) return null;
  const schema = await ensureLibrarySchema();
  if (!schema.ok) return null;
  return turso();
}

export async function GET(request: Request) {
  try {
    const identity = await authorized(request);
    if (!identity) return json(403, { error: 'forbidden' });
    const db = await readyStore();
    if (!db) return json(503, { error: 'source_review_unavailable', message: 'The archive review store is not available.' });
    try {
      const result = await db.execute({
        sql: `select id, source_id, title, author, preview, content, source_url, license,
                     fetched_at, tags, status, official_slug, curator_note, published_speech_id, updated_at
              from arrival_entries order by fetched_at desc limit 120`,
      });
      const items = result.rows.map((raw) => {
        const row = raw as Record<string, unknown>;
        const status = String(row.status ?? 'candidate');
        return {
          id: String(row.id ?? ''),
          sourceId: String(row.source_id ?? ''),
          title: String(row.title ?? ''),
          author: String(row.author ?? ''),
          preview: String(row.preview ?? ''),
          content: String(row.content ?? '').slice(0, 12_000),
          sourceUrl: String(row.source_url ?? ''),
          license: String(row.license ?? ''),
          fetchedAt: String(row.fetched_at ?? ''),
          tags: String(row.tags ?? ''),
          status: ['candidate', 'approved', 'rejected', 'published'].includes(status) ? status : 'candidate',
          officialSlug: String(row.official_slug ?? ''),
          note: String(row.curator_note ?? ''),
          publishedSpeechId: String(row.published_speech_id ?? ''),
          updatedAt: String(row.updated_at ?? ''),
        };
      }).filter((item) => item.id);
      return json(200, { items });
    } finally { db.close(); }
  } catch (error) {
    const status = error instanceof PresentationError ? error.status : 500;
    return json(status, { error: 'source_review_unavailable', message: status === 401 ? 'Sign in again to use source review.' : 'The archive review list could not be loaded.' });
  }
}

async function stage(db: NonNullable<Awaited<ReturnType<typeof turso>>>, id: string) {
  const existing = await db.execute({ sql: 'select id from arrival_entries where id = ? limit 1', args: [id] });
  if (existing.rows.length) return { id, alreadyStaged: true };
  const speech = await readWebSpeechById(id);
  if (!speech || speech.id !== id || speech.content.trim().length < 100) {
    throw new Error('The archive did not return a readable text for that item.');
  }
  const sourceId = speech.sourceId;
  const expected = sourceId === 'wikisource' ? 'ws' : sourceId === 'wikiquote' ? 'wq' : 'pg';
  if (!id.startsWith(`${expected}-`)) throw new Error('The returned archive identity did not match the requested item.');
  const now = new Date().toISOString();
  await db.execute({
    sql: `insert or ignore into arrival_entries (
      id, source_id, title, author, preview, content, source_url, license,
      fetched_at, tags, status, official_slug, curator_note, published_speech_id, updated_at
    ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'candidate', '', '', '', ?)`,
    args: [
      id, sourceId, speech.title.slice(0, 180), speech.author.slice(0, 180),
      speech.preview.slice(0, 500), speech.content.slice(0, 40_000), speech.sourceUrl,
      speech.licence.slice(0, 240), speech.fetchedAt, `archive, ${sourceId}`, now,
    ],
  });
  return { id, alreadyStaged: false };
}

async function sourceAccount(identityToken: string, slug: string): Promise<{
  slug: string; uid: string; username: string; displayName: string; photoURL: string;
}> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) throw new Error('Account storage is not configured.');
  const url = new URL('/rest/v1/official_accounts', SUPABASE_URL);
  url.searchParams.set('select', 'slug,identity_uid,display_name,logo_url,active');
  url.searchParams.set('slug', `eq.${slug}`);
  url.searchParams.set('active', 'eq.true');
  url.searchParams.set('limit', '1');
  const response = await fetch(url, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${identityToken}`, Accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(4000),
  });
  if (!response.ok) throw new Error('The official account could not be checked.');
  const [account] = await response.json() as Record<string, unknown>[];
  const uid = typeof account?.identity_uid === 'string' ? account.identity_uid : '';
  if (!account || account.slug !== slug || account.active !== true || !uid) throw new Error('Choose an active official account before publishing.');

  const profileURL = new URL('/rest/v1/profiles', SUPABASE_URL);
  profileURL.searchParams.set('select', 'uid,username,display_name,photo_url');
  profileURL.searchParams.set('uid', `eq.${uid}`);
  profileURL.searchParams.set('limit', '1');
  const profileResponse = await fetch(profileURL, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${identityToken}`, Accept: 'application/json' },
    cache: 'no-store',
    signal: AbortSignal.timeout(4000),
  });
  if (!profileResponse.ok) throw new Error('The official identity profile could not be read.');
  const [profile] = await profileResponse.json() as Record<string, unknown>[];
  const username = typeof profile?.username === 'string' ? profile.username.trim().toLowerCase() : '';
  if (!profile || !/^[a-z0-9_]{3,24}$/.test(username)) throw new Error('The official account must have a claimed public handle.');
  return {
    slug,
    uid,
    username,
    displayName: typeof account.display_name === 'string' ? account.display_name.slice(0, 80) : username,
    photoURL: typeof account.logo_url === 'string' ? account.logo_url.slice(0, 1000) : '',
  };
}

function slugFor(title: string, id: string): string {
  const base = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'archive-text';
  const suffix = id.slice(-10).replace(/[^a-z0-9-]/g, '');
  return `${base}-${suffix}`.slice(0, 60).replace(/-+$/g, '');
}

async function publish(
  db: NonNullable<Awaited<ReturnType<typeof turso>>>,
  identityToken: string,
  id: string,
  officialSlug: string,
): Promise<{ id: string; username: string; slug: string }> {
  const accounts = await sourceAccount(identityToken, officialSlug);
  const tx = await db.transaction('write');
  try {
    const candidateResult = await tx.execute({
      sql: `select id, source_id, title, author, preview, content, source_url, license, fetched_at, tags, status
            from arrival_entries where id = ? limit 1`,
      args: [id],
    });
    const candidate = candidateResult.rows[0] as Record<string, unknown> | undefined;
    if (!candidate) throw new Error('That archive item is no longer in the review queue.');
    if (candidate.status === 'published') throw new Error('That archive item is already published.');
    if (candidate.status !== 'approved') throw new Error('Approve the item before publishing it.');
    const sourceId = String(candidate.source_id ?? '');
    const source = sourceId === 'wikisource' ? 'Wikisource' : sourceId === 'wikiquote' ? 'Wikiquote' : sourceId === 'gutenberg' ? 'Project Gutenberg' : '';
    if (!source) throw new Error('The archive source is not recognized.');
    const slug = slugFor(String(candidate.title ?? ''), id);
    const now = new Date().toISOString();
    const insert = await tx.execute({
      sql: `insert or ignore into library (
        id, uid, username, folder, slug, title, author, author_photo_url, author_badges,
        preview, content, category, occasion, tags, credits, signature, allow_copy,
        source_type, source_name, source_url, source_title, source_fetched_at, official_slug,
        source_item_id, license, moderation_status, moderation_note, featured, safety_sampled,
        views, likes, dislikes, shares, published_at, updated_at
      ) values (${Array.from({ length: 35 }, () => '?').join(', ')})`,
      args: [
        id, accounts.uid, accounts.username, '', slug,
        String(candidate.title ?? '').slice(0, 180), String(candidate.author ?? '').slice(0, 180),
        accounts.photoURL, 'grey', String(candidate.preview ?? '').slice(0, 500),
        String(candidate.content ?? '').slice(0, 40_000), 'From the archives', source,
        String(candidate.tags ?? ''), '', '', 1, 'archive', source,
        String(candidate.source_url ?? ''), String(candidate.title ?? '').slice(0, 180),
        String(candidate.fetched_at ?? ''), officialSlug, id,
        String(candidate.license ?? '').slice(0, 240), 'published', '', 0, 0,
        0, 0, 0, 0, now, now,
      ],
    });
    if (!insert.rowsAffected) {
      const existing = await tx.execute({ sql: 'select source_type, official_slug from library where id = ? limit 1', args: [id] });
      const row = existing.rows[0] as Record<string, unknown> | undefined;
      if (row?.source_type !== 'archive' || row?.official_slug !== officialSlug) {
        throw new Error('A different library item already uses this archive id.');
      }
    }
    await tx.execute({
      sql: `update arrival_entries set status = 'published', official_slug = ?, published_speech_id = ?, updated_at = ? where id = ?`,
      args: [officialSlug, id, now, id],
    });
    await tx.commit();
    return { id, username: accounts.username, slug };
  } catch (error) {
    await tx.rollback();
    throw error;
  }
}

export async function POST(request: Request) {
  let identity;
  try { identity = await authorized(request); }
  catch (error) {
    const status = error instanceof PresentationError ? error.status : 401;
    return json(status, { error: 'unauthorized', message: status === 401 ? 'Sign in again to use source review.' : 'Source review is unavailable.' });
  }
  if (!identity) return json(403, { error: 'forbidden' });
  if (limited(identity.uid)) return json(429, { error: 'rate_limited', message: 'Wait a minute before asking the archives for more.' });
  const length = Number(request.headers.get('content-length') ?? 0);
  if (length > 6000) return json(413, { error: 'request_too_large' });

  let body: Record<string, unknown>;
  try { body = await request.json() as Record<string, unknown>; }
  catch { return json(400, { error: 'invalid_json' }); }
  const action = body.action;
  const id = typeof body.id === 'string' ? body.id.trim() : '';
  if (!validId(id)) return json(400, { error: 'invalid_archive_id', message: 'Choose a recognized Wikisource, Wikiquote or Gutenberg item.' });
  const db = await readyStore();
  if (!db) return json(503, { error: 'source_review_unavailable', message: 'The archive review store is not available.' });
  try {
    if (action === 'stage') {
      const result = await stage(db, id);
      return json(result.alreadyStaged ? 200 : 201, { ok: true, ...result });
    }
    if (action === 'review') {
      const status = body.status;
      if (status !== 'approved' && status !== 'rejected') return json(400, { error: 'invalid_review_status' });
      const note = typeof body.note === 'string' ? body.note.trim().slice(0, 500) : '';
      const result = await db.execute({
        sql: `update arrival_entries set status = ?, curator_note = ?, updated_at = ? where id = ? and status in ('candidate','approved','rejected')`,
        args: [status, note, new Date().toISOString(), id],
      });
      if (!result.rowsAffected) return json(409, { error: 'item_not_reviewable', message: 'That item is not waiting for review.' });
      return json(200, { ok: true, id, status });
    }
    if (action === 'publish') {
      const officialSlug = typeof body.officialSlug === 'string' ? body.officialSlug.trim().toLowerCase() : '';
      if (!/^[a-z0-9-]{2,60}$/.test(officialSlug)) return json(400, { error: 'invalid_official_account' });
      const result = await publish(db, identity.token, id, officialSlug);
      revalidatePath('/');
      revalidatePath('/arrivals');
      revalidatePath(`/read/${encodeURIComponent(id)}`);
      revalidatePath(`/${encodeURIComponent(result.username)}`);
      revalidatePath(`/${encodeURIComponent(result.username)}/${encodeURIComponent(result.slug)}`);
      revalidatePath('/sitemap.xml');
      return json(200, { ok: true, ...result, officialSlug });
    }
    return json(400, { error: 'unknown_action' });
  } catch (error) {
    return json(502, { error: 'source_review_failed', message: (error as Error).message || 'The source review action could not be completed.' });
  } finally {
    db.close();
  }
}

export async function PUT() { return json(405, { error: 'method_not_allowed' }); }
export async function PATCH() { return json(405, { error: 'method_not_allowed' }); }
export async function DELETE() { return json(405, { error: 'method_not_allowed' }); }
