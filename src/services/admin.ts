/**
 * The owner's toolkit.
 *
 * Three jobs live here:
 *
 *   • the second lock on /admin — a password the role-holder sets, stored as a
 *     PBKDF2-SHA256 hash and never in plain text. It is a *convenience* lock,
 *     not the security boundary: the database's row policies refuse writes from anyone
 *     without the role, password or not. This only keeps a borrowed laptop out
 *     of the desk.
 *   • ads, in `servingads` — create, edit, delete, from inside the site.
 *   • handles — reserve a username, hand it to a person, take one back.
 *
 * Every write is validated before it goes out, and every write clears the
 * browser's ad cache so a change is visible immediately rather than in ten
 * minutes.
 */

import { loadBackend } from './backend';
import { clearAdCache } from './ads';
import { validateUsername } from '../lib/identity';
import { slugifySegment } from '../lib/paths';
import { clerkSessionToken } from './clerk';

async function fs() {
  const bundle = await loadBackend();
  if (!bundle) throw new Error('Cloud is not configured on this installation.');
  return bundle;
}

function adminText(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value instanceof Date) return value.toISOString();
  return '';
}

/* ------------------------------------------------------------------ */
/* The password on /admin                                              */
/* ------------------------------------------------------------------ */

const GATE_COLLECTION = 'adminPrivate';
const GATE_DOC = 'gate';
const UNLOCK_KEY = 'pb.admin.unlocked';
const ITERATIONS = 210_000;

export interface GateState {
  configured: boolean;
  error?: string;
}

function toBase64(bytes: Uint8Array): string {
  return btoa(String.fromCharCode(...bytes));
}

async function derive(password: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: salt as unknown as BufferSource, iterations, hash: 'SHA-256' },
    key,
    256,
  );
  return toBase64(new Uint8Array(bits));
}

/** Is a password set? Missing document (or no cloud) means "no password". */
export async function fetchGateState(): Promise<GateState> {
  try {
    const { fs: f, db } = await fs();
    const snap = await f.getDoc(f.doc(db, GATE_COLLECTION, GATE_DOC));
    return { configured: snap.exists() && typeof (snap.data() ?? {}).hash === 'string' };
  } catch (error) {
    return { configured: false, error: (error as Error).message };
  }
}

export async function setAdminPassword(password: string): Promise<void> {
  if (password.length < 8) throw new Error('Use at least 8 characters.');
  const { fs: f, db } = await fs();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derive(password, salt, ITERATIONS);
  await f.setDoc(f.doc(db, GATE_COLLECTION, GATE_DOC), {
    salt: toBase64(salt),
    hash,
    iterations: ITERATIONS,
    updatedAt: f.serverTimestamp(),
  });
}

export async function clearAdminPassword(): Promise<void> {
  const { fs: f, db } = await fs();
  await f.deleteDoc(f.doc(db, GATE_COLLECTION, GATE_DOC));
}

/** True when the password matches — or when there is no password at all. */
export async function verifyAdminPassword(password: string): Promise<boolean> {
  const { fs: f, db } = await fs();
  const snap = await f.getDoc(f.doc(db, GATE_COLLECTION, GATE_DOC));
  if (!snap.exists()) return true;
  const data = snap.data() ?? {};
  const salt = typeof data.salt === 'string' ? data.salt : '';
  const hash = typeof data.hash === 'string' ? data.hash : '';
  const iterations = typeof data.iterations === 'number' ? data.iterations : ITERATIONS;
  if (!salt || !hash) return false;
  const raw = Uint8Array.from(atob(salt), (c) => c.charCodeAt(0));
  return (await derive(password, raw, iterations)) === hash;
}

/* Unlock lives in sessionStorage: it lasts this browser session, not forever. */
export function isAdminUnlocked(): boolean {
  try {
    return sessionStorage.getItem(UNLOCK_KEY) === '1';
  } catch {
    return false;
  }
}

export function markAdminUnlocked(): void {
  try {
    sessionStorage.setItem(UNLOCK_KEY, '1');
  } catch {
    /* private mode — the password will simply be asked again */
  }
}

export function lockAdmin(): void {
  try {
    sessionStorage.removeItem(UNLOCK_KEY);
  } catch {
    /* ignore */
  }
}

/* ------------------------------------------------------------------ */
/* Ads                                                                 */
/* ------------------------------------------------------------------ */

export interface AdDraft {
  Title: string;
  DescriptionPreview: string;
  Content: string;
  ImageURL: string;
  RedirectURL: string;
  weight: number;
}

function cleanAd(draft: AdDraft): Record<string, unknown> {
  const httpsOrEmpty = (value: string) => {
    const trimmed = value.trim();
    if (!trimmed) return '';
    if (!/^https:\/\//i.test(trimmed)) throw new Error('Links must start with https://');
    return trimmed;
  };
  const title = draft.Title.trim();
  if (!title) throw new Error('An ad needs a title.');
  return {
    Title: title,
    DescriptionPreview: draft.DescriptionPreview.trim(),
    Content: draft.Content.trim(),
    ImageURL: httpsOrEmpty(draft.ImageURL),
    RedirectURL: httpsOrEmpty(draft.RedirectURL),
    weight: Math.max(1, Math.min(10, Math.round(draft.weight) || 1)),
  };
}

/** Create (id = null) or update an ad. Returns the document id. */
export async function saveAd(id: string | null, draft: AdDraft): Promise<string> {
  const { fs: f, db } = await fs();
  const payload = { ...cleanAd(draft), updatedAt: f.serverTimestamp() };
  if (id) {
    await f.setDoc(f.doc(db, 'servingads', id), payload, { merge: true });
    clearAdCache();
    return id;
  }
  const created = await f.addDoc(f.collection(db, 'servingads'), {
    ...payload,
    createdAt: f.serverTimestamp(),
  });
  clearAdCache();
  // A stable id beats a random one: the link people share keeps working.
  const slug = slugifySegment(draft.Title).slice(0, 40) || 'ad';
  const stableId = `${slug}-${created.id.slice(0, 6)}`;
  await f.setDoc(f.doc(db, 'servingads', stableId), payload, { merge: true });
  await f.deleteDoc(f.doc(db, 'servingads', created.id));
  return stableId;
}

export async function deleteAd(id: string): Promise<void> {
  const { fs: f, db } = await fs();
  await f.deleteDoc(f.doc(db, 'servingads', id));
  clearAdCache();
}

/* ------------------------------------------------------------------ */
/* Handles — reserving and handing out                                 */
/* ------------------------------------------------------------------ */

export interface HandleRow {
  username: string;
  uid: string;
  email: string;
  note: string;
  reserved: boolean;
  updatedAt?: string;
}

export async function listHandles(): Promise<HandleRow[]> {
  const { fs: f, db } = await fs();
  const snap = await f.getDocs(f.query(f.collection(db, 'handles'), f.limit(300)));
  return snap.docs
    .map((doc) => {
      const data = doc.data() ?? {};
      return {
        username: doc.id,
        uid: typeof data.uid === 'string' ? data.uid : '',
        email: typeof data.reservedForEmail === 'string' ? data.reservedForEmail : '',
        note: typeof data.note === 'string' ? data.note : '',
        reserved: data.reserved === true,
        updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : '',
      };
    })
    .sort((a, b) => a.username.localeCompare(b.username));
}

/** Hold a name back from the public, optionally for one person. */
export async function reserveHandle(
  raw: string,
  options: { forEmail?: string; note?: string } = {},
): Promise<string> {
  const check = validateUsername(raw);
  if (!check.ok) throw new Error(check.error ?? 'That username is not valid.');
  const username = check.username.toLowerCase();
  const { fs: f, db } = await fs();
  const ref = f.doc(db, 'handles', username);
  const existing = await f.getDoc(ref);
  if (existing.exists()) {
    const data = existing.data() ?? {};
    if (data.uid && data.uid !== '') {
      throw new Error(`@${username} already belongs to somebody — take it back first if that is wrong.`);
    }
  }
  const email = (options.forEmail ?? '').trim().toLowerCase();
  await f.setDoc(
    ref,
    {
      username,
      uid: '',
      reserved: true,
      reservedForEmail: email,
      note: (options.note ?? '').trim(),
      reservedAt: f.serverTimestamp(),
      updatedAt: f.serverTimestamp(),
    },
    { merge: true },
  );
  return username;
}

/** Give a reserved (or free) handle to a person, by their account id. */
export async function assignHandle(
  username: string,
  person: { uid: string; email: string; displayName?: string },
): Promise<void> {
  if (!person.uid) throw new Error('Pick a person first.');
  const { fs: f, db } = await fs();
  // `handles.uid` has a real FK to `profiles.uid`. Upsert the profile first;
  // otherwise a new Clerk identity can lose a race and fail with handles_uid_fkey.
  await f.setDoc(f.doc(db, 'users', person.uid), {
    uid: person.uid,
    email: person.email ?? '',
    displayName: person.displayName ?? '',
    providerId: 'clerk',
    updatedAt: f.serverTimestamp(),
  }, { merge: true });
  await f.setDoc(
    f.doc(db, 'handles', username),
    {
      username,
      uid: person.uid,
      reserved: false,
      reservedForEmail: '',
      assignedTo: person.uid,
      assignedEmail: person.email ?? '',
      updatedAt: f.serverTimestamp(),
    },
    { merge: true },
  );
  // Mirror it into their profile so the site shows the handle immediately.
  await f.setDoc(
    f.doc(db, 'users', person.uid),
    { uid: person.uid, username, updatedAt: f.serverTimestamp() },
    { merge: true },
  );
}

/** Take a handle back (from a person, or from the reserve list). */
export async function releaseHandle(username: string): Promise<void> {
  const { fs: f, db } = await fs();
  await f.deleteDoc(f.doc(db, 'handles', username));
}

export interface AdminProfileDetails {
  displayName: string;
  bio: string;
  location: string;
  website: string;
  signature: string;
}

export async function updateProfileAsAdmin(uid: string, details: AdminProfileDetails): Promise<AdminProfileDetails> {
  if (!uid) throw new Error('Choose a profile first.');
  const clean: AdminProfileDetails = {
    displayName: details.displayName.trim().slice(0, 80),
    bio: details.bio.trim().slice(0, 500),
    location: details.location.trim().slice(0, 100),
    website: details.website.trim().slice(0, 200),
    signature: details.signature.trim().slice(0, 120),
  };
  if (clean.website) {
    let parsed: URL;
    try { parsed = new URL(clean.website); }
    catch { throw new Error('Website must be a full URL beginning with https:// or http://.'); }
    if (!['https:', 'http:'].includes(parsed.protocol)) throw new Error('Website must use https:// or http://.');
  }
  const { fs: f, db } = await fs();
  await f.setDoc(f.doc(db, 'users', uid), { uid, ...clean, updatedAt: f.serverTimestamp() }, { merge: true });
  return clean;
}

export type AdminBadge = 'quintal' | 'sole' | 'grey';
export type BadgePrincipal = 'person' | 'official';

export interface BadgeAssignment {
  principalType: BadgePrincipal;
  principalId: string;
  badge: AdminBadge;
  reason: string;
  grantedAt: string;
}

export interface BadgeAuditRecord extends BadgeAssignment {
  action: 'grant' | 'revoke';
  actorUid: string;
  createdAt: string;
}

export interface OfficialAccount {
  slug: string;
  identityUid: string;
  displayName: string;
  logoURL: string;
  bio: string;
  canonicalURL: string;
  active: boolean;
  createdAt: string;
}

export interface OfficialAccountDraft extends Omit<OfficialAccount, 'active' | 'createdAt' | 'identityUid'> {
  email: string;
  handle: string;
}

export interface ModerationItem {
  id: string;
  username: string;
  slug: string;
  folder: string;
  title: string;
  preview: string;
  category: string;
  author: string;
  status: 'published' | 'held';
  note: string;
  updatedAt: string;
}

export interface ArrivalReviewItem {
  id: string;
  sourceId: string;
  title: string;
  author: string;
  preview: string;
  content: string;
  sourceUrl: string;
  license: string;
  fetchedAt: string;
  tags: string;
  status: 'candidate' | 'approved' | 'rejected' | 'published';
  officialSlug: string;
  note: string;
  publishedSpeechId: string;
  updatedAt: string;
}

async function adminApi<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await clerkSessionToken();
  if (!token) throw new Error('Sign in again to use the admin workspace.');
  const response = await fetch(path, {
    ...init,
    headers: {
      Accept: 'application/json',
      Authorization: `Bearer ${token}`,
      ...(init.body ? { 'Content-Type': 'application/json' } : {}),
      ...init.headers,
    },
    cache: 'no-store',
  });
  const payload = await response.json().catch(() => ({})) as T & { message?: string; error?: string; failedStep?: string };
  if (!response.ok) {
    const message = payload.message ?? payload.error ?? `Admin request failed (${response.status}).`;
    const failedStep = payload.failedStep;
    const knownStep = failedStep === 'clerk.createUser' || failedStep === 'supabase.admin_create_official_account';
    throw new Error(`${message}${knownStep ? ` [${failedStep}]` : ''}`);
  }
  return payload;
}

export type InboxStatus = 'new' | 'read' | 'resolved' | 'dismissed';
export type InboxSource = 'inbox' | 'feedback';
export type InboxKind = 'feedback' | 'report' | 'message';

export interface AdminInboxItem {
  id: string;
  source: InboxSource;
  kind: InboxKind;
  category: string;
  subject: string;
  message: string;
  pageUrl: string;
  contactEmail: string;
  uid: string;
  status: InboxStatus;
  adminNote: string;
  rating: number | null;
  createdAt: string;
  updatedAt: string;
}

export async function fetchAdminInbox(): Promise<{ items: AdminInboxItem[]; warnings: string[] }> {
  const result = await adminApi<{ items?: AdminInboxItem[]; warnings?: string[] }>('/api/admin/inbox');
  return {
    items: Array.isArray(result.items) ? result.items : [],
    warnings: Array.isArray(result.warnings) ? result.warnings : [],
  };
}

export async function updateAdminInboxItem(
  item: Pick<AdminInboxItem, 'id' | 'source'>,
  status: InboxStatus,
  adminNote: string,
): Promise<void> {
  await adminApi('/api/admin/inbox', {
    method: 'PATCH',
    body: JSON.stringify({ id: item.id, source: item.source, status, adminNote: adminNote.trim().slice(0, 1000) }),
  });
}

export async function listBadgeAssignments(): Promise<BadgeAssignment[]> {
  const { fs: f, db } = await fs();
  const snap = await f.getDocs(f.query(
    f.collection(db, 'badgeAssignments'),
    f.where('active', '==', true),
    f.limit(500),
  ));
  return snap.docs.map(({ data }) => {
    const row = data();
    return {
      principalType: adminText(row.principalType) === 'official' ? 'official' as const : 'person' as const,
      principalId: adminText(row.principalId),
      badge: adminText(row.badge) as AdminBadge,
      reason: adminText(row.reason),
      grantedAt: adminText(row.grantedAt),
    };
  }).filter((row) => row.principalId && ['quintal', 'sole', 'grey'].includes(row.badge));
}

export async function listBadgeAudit(limit = 80): Promise<BadgeAuditRecord[]> {
  const { fs: f, db } = await fs();
  const snap = await f.getDocs(f.query(
    f.collection(db, 'badgeAudit'),
    f.orderBy('createdAt', 'desc'),
    f.limit(Math.min(Math.max(limit, 1), 200)),
  ));
  return snap.docs.map(({ data }) => {
    const row = data();
    return {
      principalType: adminText(row.principalType) === 'official' ? 'official' as const : 'person' as const,
      principalId: adminText(row.principalId),
      badge: adminText(row.badge) as AdminBadge,
      action: adminText(row.action) === 'revoke' ? 'revoke' as const : 'grant' as const,
      reason: adminText(row.reason),
      grantedAt: adminText(row.grantedAt),
      actorUid: adminText(row.actorUid),
      createdAt: adminText(row.createdAt),
    };
  });
}

export async function setBadge(
  principalType: BadgePrincipal,
  principalId: string,
  badge: AdminBadge,
  action: 'grant' | 'revoke',
  reason: string,
): Promise<void> {
  if (badge === 'grey' && principalType !== 'official') throw new Error('Grey is reserved for official source accounts.');
  if (badge !== 'grey' && principalType !== 'person') throw new Error('Quintal and Sole belong to people.');
  const { rpc } = await fs();
  await rpc('admin_set_badge', {
    p_principal_type: principalType,
    p_principal_id: principalId.trim(),
    p_badge: badge,
    p_action: action,
    p_reason: reason.trim().slice(0, 500),
  });
}

export async function listOfficialAccounts(): Promise<OfficialAccount[]> {
  const { fs: f, db } = await fs();
  const snap = await f.getDocs(f.query(f.collection(db, 'officialAccounts'), f.limit(300)));
  return snap.docs.map(({ data }) => {
    const row = data();
    return {
      slug: adminText(row.slug),
      identityUid: adminText(row.identityUid),
      displayName: adminText(row.displayName),
      logoURL: adminText(row.logoURL),
      bio: adminText(row.bio),
      canonicalURL: adminText(row.canonicalURL),
      active: row.active === true,
      createdAt: adminText(row.createdAt),
    };
  }).sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export async function createOfficialAccount(draft: OfficialAccountDraft): Promise<{ uid: string; handle: string; slug: string }> {
  return adminApi('/api/admin/accounts', { method: 'POST', body: JSON.stringify(draft) });
}

export async function setOfficialAccountActive(slug: string, active: boolean, reason = ''): Promise<void> {
  const { rpc } = await fs();
  await rpc('admin_set_official_active', {
    p_slug: slug.trim(),
    p_active: active,
    p_reason: reason.trim().slice(0, 500),
  });
}

export async function fetchModerationItems(): Promise<ModerationItem[]> {
  const result = await adminApi<{ items?: ModerationItem[] }>('/api/admin/moderation');
  return Array.isArray(result.items) ? result.items : [];
}

export async function setModeration(id: string, status: 'published' | 'held', note: string): Promise<void> {
  await adminApi('/api/admin/moderation', {
    method: 'POST',
    body: JSON.stringify({ id, status, note: note.trim().slice(0, 500) }),
  });
}

export async function fetchArrivalReview(): Promise<ArrivalReviewItem[]> {
  const result = await adminApi<{ items?: ArrivalReviewItem[] }>('/api/admin/arrivals');
  return Array.isArray(result.items) ? result.items : [];
}

export async function stageSourceCandidate(id: string): Promise<void> {
  await adminApi('/api/admin/arrivals', { method: 'POST', body: JSON.stringify({ action: 'stage', id }) });
}

export async function reviewSourceCandidate(id: string, status: 'approved' | 'rejected', note: string): Promise<void> {
  await adminApi('/api/admin/arrivals', {
    method: 'POST',
    body: JSON.stringify({ action: 'review', id, status, note: note.trim().slice(0, 500) }),
  });
}

export async function publishSourceCandidate(id: string, officialSlug: string): Promise<void> {
  await adminApi('/api/admin/arrivals', {
    method: 'POST',
    body: JSON.stringify({ action: 'publish', id, officialSlug: officialSlug.trim() }),
  });
}
