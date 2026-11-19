import type { Client } from '@libsql/client';
import { createHash } from 'node:crypto';
import { makeSafetySlice } from '../../convex/lib/safetySlice';
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
  /** Optional Clerk JWT-template token used only for the Convex safety mirror. */
  convexToken?: string;
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
    const uid = claims.sub;
    let convexToken: string | undefined;
    const candidate = request.headers.get('x-convex-token')?.trim() ?? '';
    if (candidate && candidate.length <= 12_000) {
      try {
        const convexClaims = (await clerkSdk.verifyToken(candidate, {
          secretKey: CLERK_SECRET_KEY,
          ...(AUTHORIZED_PARTIES.length ? { authorizedParties: AUTHORIZED_PARTIES } : {}),
        })) as { sub?: unknown };
        if (convexClaims.sub === uid) convexToken = candidate;
      } catch {
        // An unavailable/misconfigured Convex template must never block a share.
      }
    }
    return { uid, token, ...(convexToken ? { convexToken } : {}) };
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

export interface SafetySampleState {
  actorUid: string;
  canonicalCount: number;
  sampledIds: string[];
}

export interface SafetySnapshot extends SafetySampleState {
  presentationId: string;
  ownerUid: string;
  selected: boolean;
  checksum?: string;
  sourceBytes?: number;
  recoverySlice?: string;
  recoveryBytes?: number;
  byteLimit?: number;
  updatedAt?: string;
}

const MAX_SAFETY_SAMPLE_IDS = 20_000;

function assertSafetySampleState(canonicalCount: number, sampledIds: string[]): void {
  if (!Number.isSafeInteger(canonicalCount) || canonicalCount < 0
    || sampledIds.length > MAX_SAFETY_SAMPLE_IDS
    || sampledIds.length > Math.floor(canonicalCount / 100)) {
    throw new PresentationError('The safety sample is not within its global limit.', 503, 'safety_sample_invalid');
  }
}

/** The global sample membership, from Turso's metadata-only selection flags. */
export async function readSafetySampleState(identity: VerifiedIdentity): Promise<SafetySampleState> {
  const db = await ensurePresentationStore();
  const tx = await db.transaction('read');
  try {
    const countResult = await tx.execute("select count(*) as n from library where moderation_status = 'published'");
    const canonicalCount = Number((countResult.rows[0] as Record<string, unknown> | undefined)?.n ?? 0);
    const selected = await tx.execute(`select id from library
      where moderation_status = 'published' and source_type = 'person' and safety_sampled = 1
      order by id`);
    const sampledIds = selected.rows.map((row) => String((row as Record<string, unknown>).id ?? '')).filter(Boolean);
    assertSafetySampleState(canonicalCount, sampledIds);
    await tx.commit();
    return { actorUid: identity.uid, canonicalCount, sampledIds };
  } catch (error) {
    await tx.rollback();
    throw error;
  } finally {
    db.close();
  }
}

/**
 * Return only an author's already-selected recovery slice. The full body stays
 * in Turso; the signed-in owner cannot submit content to this endpoint.
 */
export async function readSafetySnapshot(
  identity: VerifiedIdentity,
  presentationId: string,
): Promise<SafetySnapshot> {
  if (!/^[\w-]{1,100}$/.test(presentationId)) {
    throw new PresentationError('The presentation id is invalid.');
  }
  const db = await ensurePresentationStore();
  const tx = await db.transaction('read');
  try {
    const countResult = await tx.execute("select count(*) as n from library where moderation_status = 'published'");
    const canonicalCount = Number((countResult.rows[0] as Record<string, unknown> | undefined)?.n ?? 0);
    const selected = await tx.execute(`select id from library
      where moderation_status = 'published' and source_type = 'person' and safety_sampled = 1
      order by id`);
    const sampledIds = selected.rows.map((row) => String((row as Record<string, unknown>).id ?? '')).filter(Boolean);
    assertSafetySampleState(canonicalCount, sampledIds);

    const result = await tx.execute({
      sql: `select id, uid, content, updated_at from library
            where id = ? and source_type = 'person' and moderation_status = 'published' limit 1`,
      args: [presentationId],
    });
    const row = result.rows[0] as Record<string, unknown> | undefined;
    if (!row) throw new PresentationError('That published presentation is not available for a safety snapshot.', 404, 'safety_source_unavailable');
    if (String(row.uid ?? '') !== identity.uid) {
      throw new PresentationError('Only the presentation owner can request its safety slice.', 403, 'not_author');
    }

    const response: SafetySnapshot = {
      actorUid: identity.uid,
      ownerUid: identity.uid,
      presentationId,
      canonicalCount,
      sampledIds,
      selected: sampledIds.includes(presentationId),
    };
    if (response.selected) {
      const content = String(row.content ?? '');
      if (content.length > MAX_TEXT) {
        throw new PresentationError('This presentation is outside the safety mirror size limit.', 413, 'safety_source_too_large');
      }
      const slice = makeSafetySlice(content);
      response.checksum = createHash('sha256').update(content, 'utf8').digest('hex');
      response.sourceBytes = slice.sourceBytes;
      response.recoverySlice = slice.recoverySlice;
      response.recoveryBytes = slice.recoveryBytes;
      response.byteLimit = slice.byteLimit;
      response.updatedAt = String(row.updated_at ?? '').slice(0, 40) || new Date().toISOString();
    }
    await tx.commit();
    return response;
  } catch (error) {
    await tx.rollback();
    throw error;
  } finally {
    db.close();
  }
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
  const tx = await db.transaction('write');
  try {
    await tx.execute({
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
    await tx.execute({
      sql: `insert into presentation_versions (
        presentation_id, version, title, preview, content, category, credits,
        folder, slug, allow_copy, created_by, created_at, change_note
      ) values (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '')`,
      args: [
        id, input.title, input.preview ?? '', input.content, input.category || 'General',
        input.credits ?? '', input.folder ?? '', input.slug ?? '',
        input.allowCopy === false ? 0 : 1, identity.uid, now,
      ],
    });
    await tx.commit();
    return id;
  } catch (error) {
    await tx.rollback();
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
      sql: 'select uid from library where id = ? limit 1',
      args: [input.id],
    });
    const priorRow = prior.rows[0] as Record<string, unknown> | undefined;
    if (!priorRow) throw new PresentationError('That shared presentation no longer exists.', 404, 'not_found');
    const ownerUid = String(priorRow.uid ?? '');
    const admin = ownerUid !== identity.uid && await isAdministrator(identity);
    if (ownerUid !== identity.uid && !admin) {
      throw new PresentationError('Only its author can change this presentation.', 403, 'not_author');
    }

    const tx = await db.transaction('write');
    try {
      const latest = await tx.execute({
        sql: `select title, preview, content, category, credits, folder, slug, allow_copy,
                     uid, published_at, updated_at
              from library where id = ? limit 1`,
        args: [input.id],
      });
      const row = latest.rows[0] as Record<string, unknown> | undefined;
      if (!row) throw new PresentationError('That shared presentation no longer exists.', 404, 'not_found');
      if (String(row.uid ?? '') !== ownerUid) {
        throw new PresentationError('The presentation owner changed; retry the update.', 409, 'owner_changed');
      }

      const next = {
        title: input.title,
        preview: input.preview ?? '',
        content: input.content,
        category: input.category || 'General',
        credits: input.credits ?? '',
        folder: input.folder ?? '',
        slug: input.slug ?? '',
        allowCopy: input.allowCopy !== false,
      };
      const changed = String(row.title ?? '') !== next.title
        || String(row.preview ?? '') !== next.preview
        || String(row.content ?? '') !== next.content
        || String(row.category ?? '') !== next.category
        || String(row.credits ?? '') !== next.credits
        || String(row.folder ?? '') !== next.folder
        || String(row.slug ?? '') !== next.slug
        || (Number(row.allow_copy ?? 1) !== 0) !== next.allowCopy;

      if (changed) {
        const latestVersion = await tx.execute({
          sql: 'select coalesce(max(version), 0) as version from presentation_versions where presentation_id = ?',
          args: [input.id],
        });
        let version = Number((latestVersion.rows[0] as Record<string, unknown> | undefined)?.version ?? 0);
        const now = new Date().toISOString();
        if (version === 0) {
          // A legacy presentation has no version history yet; preserve its
          // current canonical state as version one before recording this edit.
          await tx.execute({
            sql: `insert into presentation_versions (
              presentation_id, version, title, preview, content, category, credits,
              folder, slug, allow_copy, created_by, created_at, change_note
            ) values (?, 1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Imported baseline')`,
            args: [
              input.id, String(row.title ?? ''), String(row.preview ?? ''), String(row.content ?? ''),
              String(row.category ?? ''), String(row.credits ?? ''), String(row.folder ?? ''),
              String(row.slug ?? ''), Number(row.allow_copy ?? 1) === 0 ? 0 : 1,
              ownerUid, String(row.updated_at ?? row.published_at ?? now),
            ],
          });
          version = 1;
        }
        await tx.execute({
          sql: `insert into presentation_versions (
            presentation_id, version, title, preview, content, category, credits,
            folder, slug, allow_copy, created_by, created_at, change_note
          ) values (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, '')`,
          args: [
            input.id, version + 1, next.title, next.preview, next.content, next.category,
            next.credits, next.folder, next.slug, next.allowCopy ? 1 : 0, identity.uid, now,
          ],
        });
      }

      await tx.execute({
        sql: `update library set
          username = ?, folder = ?, slug = ?, title = ?, author = ?, author_photo_url = ?,
          author_badges = ?, preview = ?, content = ?, category = ?, credits = ?,
          signature = ?, allow_copy = ?, updated_at = ? where id = ?`,
        args: [
          profile.username, next.folder, next.slug, next.title, profile.displayName,
          profile.photoURL, profile.badges.join(','), next.preview, next.content,
          next.category, next.credits, profile.signature,
          next.allowCopy ? 1 : 0, new Date().toISOString(), input.id,
        ],
      });
      await tx.commit();
    } catch (error) {
      await tx.rollback();
      throw error;
    }
  } catch (error) {
    if (error instanceof PresentationError) throw error;
    if (/unique constraint failed/i.test((error as Error).message ?? '')) {
      throw new PresentationError('That presentation address is already in use.', 409, 'address_taken');
    }
    throw new PresentationError('The presentation could not be updated. Try again.', 502, 'update_failed');
  } finally {
    db.close();
  }
}

export async function deletePresentation(identity: VerifiedIdentity, id: string): Promise<boolean> {
  const db = await ensurePresentationStore();
  try {
    const result = await db.execute({ sql: 'select uid from library where id = ? limit 1', args: [id] });
    const row = result.rows[0] as Record<string, unknown> | undefined;
    if (!row) return false;
    const ownerUid = String(row.uid ?? '');
    const admin = ownerUid !== identity.uid && await isAdministrator(identity);
    if (ownerUid !== identity.uid && !admin) {
      throw new PresentationError('Only its author can remove this presentation.', 403, 'not_author');
    }
    const tx = await db.transaction('write');
    try {
      await tx.execute({ sql: 'delete from presentation_views where speech_id = ?', args: [id] });
      await tx.execute({ sql: 'delete from presentation_reactions where speech_id = ?', args: [id] });
      await tx.execute({ sql: 'delete from presentation_shares where speech_id = ?', args: [id] });
      await tx.execute({ sql: 'delete from presentation_versions where presentation_id = ?', args: [id] });
      await tx.execute({ sql: 'delete from library where id = ?', args: [id] });
      await tx.commit();
    } catch (error) {
      await tx.rollback();
      throw error;
    }
    return ownerUid === identity.uid;
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
        sql: "insert or ignore into presentation_views (speech_id, session_id, view_day, created_at) select ?, ?, ?, ? where exists (select 1 from library where id = ? and moderation_status = 'published')",
        args: [id, sessionId, day, now, id],
      });
      const counted = result.rowsAffected > 0;
      if (counted) {
        await tx.execute({ sql: 'update library set views = views + 1 where id = ?', args: [id] });
      }
      const total = await tx.execute({ sql: "select views from library where id = ? and moderation_status = 'published'", args: [id] });
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
