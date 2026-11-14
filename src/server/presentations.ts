import type { Client } from '@libsql/client';
import { ensureLibrarySchema } from './reading';
import { serverEnv, serverEnvAny } from './env';
import { TURSO_CONFIGURED, turso } from './turso';

const CLERK_SECRET_KEY = serverEnv('CLERK_SECRET_KEY');
const AUTHORIZED_PARTIES = serverEnv('CLERK_AUTHORIZED_PARTIES')
  .split(',')
  .map((party) => party.trim())
  .filter(Boolean);
const SUPABASE_URL = serverEnvAny('VITE_SUPABASE_URL', 'SUPABASE_URL').replace(/\/+$/, '');
const SUPABASE_ANON_KEY = serverEnvAny('VITE_SUPABASE_ANON_KEY', 'SUPABASE_ANON_KEY');
const MAX_TEXT = 200_000;

export interface VerifiedIdentity {
  uid: string;
  token: string;
}

export interface AuthorProfile {
  uid: string;
  username: string;
  displayName: string;
  photoURL: string;
  signature: string;
  badges: string[];
}

export interface ShareInput {
  id?: string;
  title: string;
  content: string;
  preview?: string;
  category?: string;
  credits?: string;
  slug?: string;
  folder?: string;
  allowCopy?: boolean;
}

export class PresentationError extends Error {
  constructor(
    message: string,
    readonly status = 400,
    readonly code = 'invalid_request',
  ) {
    super(message);
    this.name = 'PresentationError';
  }
}

let clerkSdk: typeof import('@clerk/backend') | null = null;

export async function verifyClerkRequest(request: Request): Promise<VerifiedIdentity> {
  if (!CLERK_SECRET_KEY) {
    throw new PresentationError('Sign-in verification is not configured.', 503, 'clerk_not_configured');
  }
  const authorization = request.headers.get('authorization') ?? '';
  const token = /^Bearer\s+(.+)$/i.exec(authorization.trim())?.[1]?.trim();
  if (!token) throw new PresentationError('Sign in first.', 401, 'missing_session_token');

  try {
    clerkSdk ??= await import('@clerk/backend');
    const claims = (await clerkSdk.verifyToken(token, {
      secretKey: CLERK_SECRET_KEY,
      ...(AUTHORIZED_PARTIES.length ? { authorizedParties: AUTHORIZED_PARTIES } : {}),
    })) as { sub?: unknown };
    if (typeof claims.sub !== 'string' || !claims.sub) throw new Error('missing subject');
    return { uid: claims.sub, token };
  } catch {
    throw new PresentationError('Your sign-in has expired. Sign in again and retry.', 401, 'invalid_session_token');
  }
}

export async function readAuthorProfile(identity: VerifiedIdentity): Promise<AuthorProfile> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new PresentationError('The profile service is not configured.', 503, 'profile_store_unavailable');
  }
  const url = new URL('/rest/v1/profiles', SUPABASE_URL);
  url.searchParams.set('select', 'uid,username,display_name,photo_url,signature');
  url.searchParams.set('uid', `eq.${identity.uid}`);
  url.searchParams.set('limit', '1');
  try {
    const response = await fetch(url, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${identity.token}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(4000),
    });
    if (!response.ok) throw new Error(`profile query ${response.status}`);
    const [row] = (await response.json()) as Record<string, unknown>[];
    if (!row) throw new PresentationError('Finish setting up your profile before sharing.', 409, 'profile_missing');
    const username = typeof row.username === 'string' ? row.username.trim().toLowerCase() : '';
    if (!username) throw new PresentationError('Claim your username before sharing.', 409, 'username_required');
    return {
      uid: identity.uid,
      username,
      displayName: cleanText(row.display_name, 80) || username,
      photoURL: safeImageUrl(row.photo_url),
      signature: cleanText(row.signature, 120),
      badges: [],
    };
  } catch (error) {
    if (error instanceof PresentationError) throw error;
    throw new PresentationError('The profile service could not be reached. Try again shortly.', 502, 'profile_lookup_failed');
  }
}

export async function isAdministrator(identity: VerifiedIdentity): Promise<boolean> {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) return false;
  const url = new URL('/rest/v1/admins', SUPABASE_URL);
  url.searchParams.set('select', 'role');
  url.searchParams.set('uid', `eq.${identity.uid}`);
  url.searchParams.set('limit', '1');
  try {
    const response = await fetch(url, {
      headers: {
        apikey: SUPABASE_ANON_KEY,
        Authorization: `Bearer ${identity.token}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return false;
    const [row] = (await response.json()) as { role?: unknown }[];
    return row?.role === 'owner' || row?.role === 'admin';
  } catch {
    return false;
  }
}

export async function ensurePresentationStore(): Promise<Client> {
  if (!TURSO_CONFIGURED) {
    throw new PresentationError('The presentation store is not configured.', 503, 'turso_not_configured');
  }
  const schema = await ensureLibrarySchema();
  if (!schema.ok) {
    throw new PresentationError('The presentation store could not be prepared.', 503, 'turso_schema_unavailable');
  }
  const db = await turso();
  if (!db) throw new PresentationError('The presentation store could not be reached.', 503, 'turso_unreachable');
  return db;
}

export function normalizeShareInput(value: unknown): ShareInput {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new PresentationError('The share details are missing.');
  }
  const body = value as Record<string, unknown>;
  const title = cleanText(body.title, 140);
  const content = typeof body.content === 'string' ? body.content.trim() : '';
  if (!title) throw new PresentationError('Give the presentation a title.');
  if (!content) throw new PresentationError('Write a few words before sharing.');
  if (content.length > MAX_TEXT) throw new PresentationError('Presentations must be 200,000 characters or fewer.');
  const preview = cleanText(body.preview, 240) || makePreview(content);
  const slug = safeSlug(typeof body.slug === 'string' ? body.slug : title);
  const folder = safeFolder(typeof body.folder === 'string' ? body.folder : '');
  const id = typeof body.id === 'string' && /^[\w-]{1,100}$/.test(body.id) ? body.id : undefined;
  return {
    ...(id ? { id } : {}),
    title,
    content,
    preview,
    category: cleanText(body.category, 80),
    credits: cleanText(body.credits, 1000),
    slug,
    folder,
    allowCopy: body.allowCopy !== false,
  };
}

export function makePreview(content: string): string {
  const plain = content
    .replace(/^\s*#+\s+/gm, '')
    .replace(/^\s*>\s?/gm, '')
    .replace(/[*_`~]/g, '')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
  if (plain.length <= 200) return plain;
  const sentence = plain.slice(0, 240).match(/^.{80,200}?[.!?](?:\s|$)/)?.[0]?.trim();
  return sentence || `${plain.slice(0, 197).trimEnd()}…`;
}

export async function publishPresentation(
  identity: VerifiedIdentity,
  profile: AuthorProfile,
  input: ShareInput,
): Promise<string> {
  const db = await ensurePresentationStore();
  const id = input.id ?? crypto.randomUUID();
  const now = new Date().toISOString();
  try {
    await db.execute({
      sql: `insert into library (
        id, uid, username, folder, slug, title, author, author_photo_url, author_badges,
        preview, content, category, occasion, tags, credits, signature, allow_copy,
        source_type, source_name, source_url, license, views, likes, dislikes, shares,
        published_at, updated_at
      ) values (${Array.from({ length: 27 }, () => '?').join(', ')})`,
      args: [
        id, identity.uid, profile.username, input.folder ?? '', input.slug ?? '', input.title,
        profile.displayName, profile.photoURL, profile.badges.join(','), input.preview ?? '', input.content,
        input.category || 'General', '', '', input.credits ?? '', profile.signature,
        input.allowCopy === false ? 0 : 1, 'person', '', '', '', 0, 0, 0, 0, now, now,
      ],
    });
    return id;
  } catch (error) {
    const message = (error as Error).message ?? '';
    if (/unique constraint failed/i.test(message)) {
      throw new PresentationError('That presentation address is already in use. Choose a different title or link.', 409, 'address_taken');
    }
    if (/no such table|no such column/i.test(message)) {
      throw new PresentationError('The presentation store needs its schema applied before sharing.', 503, 'turso_schema_incomplete');
    }
    throw new PresentationError('The presentation could not be saved. Try again.', 502, 'write_failed');
  } finally {
    db.close();
  }
}

export async function updatePresentation(
  identity: VerifiedIdentity,
  profile: AuthorProfile,
  input: ShareInput & { id: string },
): Promise<void> {
  const db = await ensurePresentationStore();
  try {
    const prior = await db.execute({
      sql: 'select id, uid from library where id = ? limit 1',
      args: [input.id],
    });
    const row = prior.rows[0] as Record<string, unknown> | undefined;
    if (!row) throw new PresentationError('That shared presentation no longer exists.', 404, 'not_found');
    const admin = String(row.uid ?? '') !== identity.uid && await isAdministrator(identity);
    if (String(row.uid ?? '') !== identity.uid && !admin) {
      throw new PresentationError('Only its author can change this presentation.', 403, 'not_author');
    }

    await db.execute({
      sql: `update library set
        username = ?, folder = ?, slug = ?, title = ?, author = ?, author_photo_url = ?,
        author_badges = ?, preview = ?, content = ?, category = ?, credits = ?,
        signature = ?, allow_copy = ?, updated_at = ? where id = ?`,
      args: [
        profile.username, input.folder ?? '', input.slug ?? '', input.title, profile.displayName,
        profile.photoURL, profile.badges.join(','), input.preview ?? '', input.content,
        input.category || 'General', input.credits ?? '', profile.signature,
        input.allowCopy === false ? 0 : 1, new Date().toISOString(), input.id,
      ],
    });
  } catch (error) {
    if (error instanceof PresentationError) throw error;
    if (/unique constraint failed/i.test((error as Error).message ?? '')) {
      throw new PresentationError('That presentation address is already in use.', 409, 'address_taken');
    }
    throw new PresentationError('The presentation could not be updated. Try again.', 502, 'write_failed');
  } finally {
    db.close();
  }
}

export async function deletePresentation(identity: VerifiedIdentity, id: string): Promise<void> {
  const db = await ensurePresentationStore();
  try {
    const result = await db.execute({ sql: 'select uid from library where id = ? limit 1', args: [id] });
    const row = result.rows[0] as Record<string, unknown> | undefined;
    if (!row) return;
    const admin = String(row.uid ?? '') !== identity.uid && await isAdministrator(identity);
    if (String(row.uid ?? '') !== identity.uid && !admin) {
      throw new PresentationError('Only its author can remove this presentation.', 403, 'not_author');
    }
    const tx = await db.transaction('write');
    try {
      await tx.execute({ sql: 'delete from presentation_views where speech_id = ?', args: [id] });
      await tx.execute({ sql: 'delete from library where id = ?', args: [id] });
      await tx.commit();
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  } catch (error) {
    if (error instanceof PresentationError) throw error;
    throw new PresentationError('The presentation could not be removed. Try again.', 502, 'delete_failed');
  } finally {
    db.close();
  }
}

export async function countPresentationView(
  id: string,
  sessionId: string,
): Promise<{ counted: boolean; views: number }> {
  const db = await ensurePresentationStore();
  const day = new Date().toISOString().slice(0, 10);
  const now = new Date().toISOString();
  try {
    const tx = await db.transaction('write');
    try {
      const result = await tx.execute({
        sql: 'insert or ignore into presentation_views (speech_id, session_id, view_day, created_at) select ?, ?, ?, ? where exists (select 1 from library where id = ?)',
        args: [id, sessionId, day, now, id],
      });
      const counted = result.rowsAffected > 0;
      if (counted) {
        await tx.execute({ sql: 'update library set views = views + 1 where id = ?', args: [id] });
      }
      const total = await tx.execute({ sql: 'select views from library where id = ?', args: [id] });
      const views = Number((total.rows[0] as Record<string, unknown> | undefined)?.views ?? 0);
      await tx.commit();
      return { counted, views };
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  } catch (error) {
    if (error instanceof PresentationError) throw error;
    throw new PresentationError('This reading could not be recorded just now.', 503, 'view_write_failed');
  } finally {
    db.close();
  }
}

export async function recordAuthorBadge(
  uid: string,
  badge: 'sole' | 'quintal' | 'grey',
  speechId: string,
  metricValue: number,
): Promise<void> {
  const db = await ensurePresentationStore();
  try {
    await db.execute({
      sql: `insert into author_badges (uid, badge, speech_id, views_at_award, awarded_at)
            values (?, ?, ?, ?, ?)
            on conflict (uid, badge) do nothing`,
      args: [uid, badge, speechId, metricValue, new Date().toISOString()],
    });
  } finally {
    db.close();
  }
}

function cleanText(value: unknown, limit: number): string {
  if (typeof value !== 'string') return '';
  return value.replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, limit);
}

function safeImageUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString().slice(0, 1000) : '';
  } catch {
    return '';
  }
}

function safeSlug(value: string): string {
  return cleanText(value, 180)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || `presentation-${Date.now().toString(36)}`;
}

function safeFolder(value: string): string {
  return cleanText(value, 100)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
