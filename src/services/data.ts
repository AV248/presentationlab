/**
 * Data access for Presentation Buddy.
 *
 * Shared presentations are authoritative in Turso and are read through
 * `/api/library`; a writer's draft stays on-device until they explicitly share.
 * Supabase/Postgres remains the account and relationship store used by the
 * existing services in this module:
 *
 *   users / profiles — the person's account and public profile.
 *   handles          — the username lock: one row per claimed name.
 *   reactions / shares — one row per signed-in person and Turso presentation.
 *                        The server writes both beside canonical content.
 *   admins           — role rows: 'owner' | 'admin'.
 *   adminPrivate     — the second lock; readable only by a role-holder.
 *   ads / sponsors   — sponsored cards and optional sponsor slots.
 *   posts / feedback / siteSettings — other account-backed site data.
 *
 * The legacy `speeches` table is retained for additive import and compatibility;
 * new presentations are written directly to Turso, not mirrored here.
 *
 * Nothing here invents numbers. Engagement counters move only from verified
 * signed-in actions; reaction/share rows and counters commit together in a
 * server-side Turso transaction.
 */

import { loadBackend, BACKEND_ENABLED } from './backend';
import { fetchLibrary, fetchOne } from './backend/library';
import { clerkConvexToken, clerkSessionToken } from './clerk';
import { mapSpeechRow, str, num, isoTimestamp, type CloudSpeech } from '../lib/speech';
import { publicCommunityAuthor, type PublicCommunityPost } from '../lib/community';

export type CloudStatus = 'off' | 'connecting' | 'online' | 'error';
export type Role = 'owner' | 'admin' | null;

/*
 * The row → speech mapping used to live here. It moved to `@/lib/speech`
 * because the server needs it too: server components render these rows into
 * HTML before the browser runs, and a second copy of the mapping would be a
 * second answer to "what does this speech look like".
 */
export { mapSpeechRow } from '../lib/speech';
export type { CloudSpeech, SpeechRow } from '../lib/speech';

/* ------------------------------------------------------------------ */
/* helpers                                                             */
/* ------------------------------------------------------------------ */

async function fs() {
  const bundle = await loadBackend();
  if (!bundle) return null;
  return bundle;
}

export interface CloudResult {
  items: CloudSpeech[];
  status: CloudStatus;
  error?: string;
}

/* ------------------------------------------------------------------ */
/* presentations                                                       */
/* ------------------------------------------------------------------ */

export async function fetchSpeeches(): Promise<CloudResult> {
  try {
    const page = await fetchLibrary({ max: 200 });
    if (page.source === 'none') {
      return {
        items: [],
        status: 'error',
        error: page.error ?? 'The shared presentation store could not be reached.',
      };
    }
    return {
      items: page.items.map((row) => mapSpeechRow(String(row.id ?? ''), row)),
      status: 'online',
    };
  } catch (error) {
    return { items: [], status: 'error', error: describeError(error) };
  }
}

export async function getSpeech(id: string): Promise<CloudSpeech | null> {
  const row = await fetchOne(id);
  return row ? mapSpeechRow(String(row.id ?? id), row) : null;
}

/**
 * A real published read. A tab-scoped random identifier deduplicates reloads
 * for the same presentation on the same UTC day; it contains no account id or
 * network address and stays in sessionStorage only.
 */
export async function registerView(id: string): Promise<void> {
  if (typeof window === 'undefined') return;
  try {
    const key = 'pb.reader.session.v1';
    let sessionId = sessionStorage.getItem(key) ?? '';
    if (!/^[A-Za-z0-9_-]{16,100}$/.test(sessionId)) {
      sessionId = crypto.randomUUID();
      sessionStorage.setItem(key, sessionId);
    }
    await fetch('/api/presentations/view', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, sessionId }),
      keepalive: true,
    });
  } catch {
    /* Private mode, offline reads, and a missing counter do not block reading. */
  }
}

export interface PublishInput {
  title: string;
  content: string;
  preview?: string;
  category?: string;
  /** Retained for old call sites; the minimal writer no longer asks for it. */
  occasion?: string;
  tags?: string[];
  ad?: boolean;
  username?: string;
  slug?: string;
  /** One optional sub-folder: `/user/folder/slug`. Never more than one. */
  folder?: string;
  credits?: string;
  signature?: string;
  allowCopy?: boolean;
}

async function optionalConvexToken(): Promise<string | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      clerkConvexToken(),
      new Promise<null>((resolve) => {
        timer = setTimeout(() => resolve(null), 900);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function queueSafetyWork(token: string, operation: 'backup' | 'reconcile', presentationId?: string) {
  // The primary share/delete request never waits for optional Convex token
  // retrieval. Safety work starts in the background after Turso has replied.
  void optionalConvexToken()
    .then(async (convexToken) => {
      if (!convexToken) return;
      const response = await fetch('/api/presentations/safety', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'X-Convex-Token': convexToken,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ operation, ...(presentationId ? { presentationId } : {}) }),
      });
      if (!response.ok && response.status !== 204) {
        // Optional backup failures must never undo a successful canonical write.
        return;
      }
    })
    .catch(() => { /* Convex is an optional mirror. */ });
}

async function writePresentation(method: 'POST' | 'PUT' | 'DELETE', payload: Record<string, unknown>) {
  const token = await clerkSessionToken();
  if (!token) throw new Error('Sign in again before sharing or changing a presentation.');
  const response = await fetch('/api/presentations', {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(payload),
  });
  const result = await response.json().catch(() => ({})) as { id?: string; error?: string; message?: string };
  if (!response.ok) throw new Error(result.message ?? result.error ?? `The presentation request failed (${response.status}).`);
  if (method === 'DELETE') queueSafetyWork(token, 'reconcile');
  else if (result.id) queueSafetyWork(token, 'backup', result.id);
  return result;
}

export async function publishSpeech(
  input: PublishInput,
  uid: string,
  authorName: string,
): Promise<{ id: string }> {
  // Caller-supplied identity is intentionally ignored. The server verifies the
  // Clerk token and reads the author/username/photo from the public profile.
  void uid;
  void authorName;
  const result = await writePresentation('POST', input as unknown as Record<string, unknown>);
  if (!result.id) throw new Error('The presentation was saved without an id. Please check the library.');
  return { id: result.id };
}

export async function updateSpeechDoc(id: string, patch: Partial<PublishInput>): Promise<void> {
  const current = await getSpeech(id);
  if (!current) throw new Error('That shared presentation could not be found.');
  await writePresentation('PUT', {
    id,
    title: patch.title ?? current.title,
    content: patch.content ?? current.content,
    preview: patch.preview ?? current.preview,
    category: patch.category ?? current.category,
    credits: patch.credits ?? current.credits ?? '',
    slug: patch.slug ?? current.slug ?? current.title,
    folder: patch.folder ?? current.folder ?? '',
    allowCopy: patch.allowCopy ?? current.allowCopy,
  });
}

export async function deleteSpeechDoc(id: string): Promise<void> {
  await writePresentation('DELETE', { id });
}

/* ------------------------------------------------------------------ */
/* reactions (like / dislike) — signed in only                         */
/* ------------------------------------------------------------------ */

export type ReactionKind = 'like' | 'dislike';

export interface ReactionState {
  kind: ReactionKind | null;
  likes: number;
  dislikes: number;
}

async function signedPresentationRequest<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = await clerkSessionToken();
  if (!token) throw new Error('Sign in again to continue.');
  const headers = new Headers(init.headers);
  headers.set('Authorization', `Bearer ${token}`);
  headers.set('Accept', 'application/json');
  if (init.body) headers.set('Content-Type', 'application/json');
  const response = await fetch(path, { ...init, headers, cache: 'no-store' });
  const payload = await response.json().catch(() => ({})) as { message?: string; error?: string } & T;
  if (!response.ok) throw new Error(payload.message ?? payload.error ?? `Request failed (${response.status}).`);
  return payload;
}

/**
 * Toggle a reaction in Turso, where the canonical presentation and its
 * counter live. The route verifies the Clerk token and commits the reaction
 * row plus counter delta in one transaction.
 */
export async function setReaction(
  speechId: string,
  uid: string,
  kind: ReactionKind,
): Promise<ReactionState> {
  void uid; // identity is taken from the verified Clerk session, never the body
  return signedPresentationRequest<ReactionState>('/api/presentations/reactions', {
    method: 'POST',
    body: JSON.stringify({ id: speechId, kind }),
  });
}

export async function fetchMyReactions(uid: string): Promise<Record<string, ReactionKind>> {
  if (!uid) return {};
  try {
    const result = await signedPresentationRequest<{ reactions: Record<string, ReactionKind> }>(
      '/api/presentations/reactions',
    );
    return Object.fromEntries(Object.entries(result.reactions ?? {}).filter(([, kind]) => kind === 'like' || kind === 'dislike'));
  } catch {
    return {};
  }
}

/* ------------------------------------------------------------------ */
/* shares — signed in only                                            */
/* ------------------------------------------------------------------ */

/** Count a share once per signed-in person in the canonical Turso store. */
export async function recordShare(speechId: string, uid: string): Promise<number> {
  void uid;
  const result = await signedPresentationRequest<{ shares: number }>('/api/presentations/share', {
    method: 'POST',
    body: JSON.stringify({ id: speechId }),
  });
  return num(result.shares);
}

/* ------------------------------------------------------------------ */
/* community posts (bloggerblogs)                                      */
/* ------------------------------------------------------------------ */

export interface Post {
  id: string;
  title: string;
  body: string;
  author: string;
  uid: string;
  createdAt: string;
  createdMs: number;
}

export async function fetchPosts(): Promise<Post[]> {
  if (!BACKEND_ENABLED) return [];
  try {
    // Public community reads go through the server-side mapper so legacy rows
    // whose Author field is an email are never delivered to a visitor's browser.
    const response = await fetch('/api/community/posts', { cache: 'no-store' });
    if (!response.ok) return [];
    const payload = await response.json() as { items?: PublicCommunityPost[] };
    return (payload.items ?? []).map((post) => {
      const createdAt = isoTimestamp(post.createdAt);
      return {
        id: post.id,
        title: post.title,
        body: post.body,
        author: publicCommunityAuthor(post.author),
        uid: post.uid,
        createdAt,
        createdMs: createdAt ? new Date(createdAt).getTime() : 0,
      };
    });
  } catch {
    return [];
  }
}

export async function publishPost(title: string, body: string, uid: string, author: string) {
  const bundle = await fs();
  if (!bundle) throw new Error('Sign-in is required to post.');
  const { fs: f, db } = bundle;
  await f.addDoc(f.collection(db, 'bloggerblogs'), {
    Title: title,
    Content: body,
    Author: publicCommunityAuthor(author),
    uid,
    createdAt: f.serverTimestamp(),
  });
  // There used to be a second write here, bumping a `posts` counter on a
  // `bloggers` document. That collection no longer exists — and the leaderboard
  // reads `profiles.points`, maintained by the reaction function, so the
  // counter it fed was never displayed. Removed rather than redirected: a
  // counter nobody reads is a number waiting to be wrong.
}

export async function deletePost(id: string) {
  const bundle = await fs();
  if (!bundle) throw new Error('Cloud sync is not configured.');
  await bundle.fs.deleteDoc(bundle.fs.doc(bundle.db, 'bloggerblogs', id));
}

/* ------------------------------------------------------------------ */
/* people, points, roles                                               */
/* ------------------------------------------------------------------ */

export interface Contributor {
  uid: string;
  name: string;
  email: string | null;
  photoURL: string | null;
  posts: number;
  likesReceived: number;
  dislikesReceived: number;
  points: number;
}

/** Points follow the original rule: +1 per like, −1 per three dislikes. */
export const pointsFor = (likes: number, dislikes: number) =>
  Math.max(0, likes - Math.floor(dislikes / 3));

export async function fetchContributors(): Promise<Contributor[]> {
  try {
    // The server derives engagement from Turso's canonical presentations and
    // exposes only public name/photo fields; profile email and stale Supabase
    // counters never enter the public leaderboard response.
    const response = await fetch('/api/community/contributors', { cache: 'no-store' });
    if (!response.ok) return [];
    const payload = await response.json() as { items?: Omit<Contributor, 'email'>[] };
    return (payload.items ?? []).map((person) => ({ ...person, email: null }));
  } catch {
    return [];
  }
}

export interface AdminUser {
  uid: string;
  displayName: string | null;
  email: string | null;
  providerId: string | null;
  username: string | null;
  photoURL: string | null;
  bio: string;
  location: string;
  website: string;
  signature: string;
  role: 'owner' | 'admin' | null;
}

export async function fetchUsers(): Promise<AdminUser[]> {
  const bundle = await fs();
  if (!bundle) return [];
  const { fs: f, db } = bundle;
  try {
    const [snap, roleRows] = await Promise.all([
      f.getDocs(f.query(f.collection(db, 'users'), f.limit(500))),
      f.getDocs(f.query(f.collection(db, 'admins'), f.limit(500))).catch(() => ({ docs: [] })),
    ]);
    const roles = new Map(roleRows.docs.map((doc) => [doc.id, str(doc.data().role)]));
    return snap.docs.map((doc) => {
      const data = doc.data();
      const role = roles.get(doc.id);
      return {
        uid: doc.id,
        displayName: typeof data.displayName === 'string' ? data.displayName : null,
        email: typeof data.email === 'string' ? data.email : null,
        providerId: typeof data.providerId === 'string' ? data.providerId : null,
        username: typeof data.username === 'string' ? data.username : null,
        photoURL: typeof data.photoURL === 'string' ? data.photoURL : null,
        bio: typeof data.bio === 'string' ? data.bio : '',
        location: typeof data.location === 'string' ? data.location : '',
        website: typeof data.website === 'string' ? data.website : '',
        signature: typeof data.signature === 'string' ? data.signature : '',
        role: role === 'owner' || role === 'admin' ? role : null,
      };
    });
  } catch {
    return [];
  }
}

/**
 * Role lookup. Preferred source is `admins/{uid}`. For installations that
 * still carry the original `admin` collection we also check the e-mail
 * allow-list — never a password, which should never have lived in the client.
 */
/**
 * The role of one person, read from `admins`.
 *
 * The e-mail argument went away with the legacy v1 allow-list: a role is a row
 * keyed by uid now, and the old fallback could only ever have thrown, because
 * the collection it queried no longer exists.
 */
export async function fetchRole(uid: string): Promise<Role> {
  const bundle = await fs();
  if (!bundle) return null;
  const { fs: f, db } = bundle;
  try {
    const row = await f.getDoc(f.doc(db, 'admins', uid));
    if (row.exists()) {
      const role = str((row.data() ?? {}).role);
      if (role === 'owner' || role === 'admin') return role;
    }
    return null;
  } catch {
    // A refused read is not "no role" — but there is nothing else to try: a
    // role the database will not show this person is not a role they hold.
    // The old code fell through to a `admin` collection that no longer exists,
    // which made a permissions problem look like a legacy fallback.
    return null;
  }
}

/** One-time bootstrap: make the signed-in person the owner. */
export async function bootstrapOwner(uid: string, email: string | null, name: string | null) {
  const bundle = await fs();
  if (!bundle) throw new Error('Cloud sync is not configured.');
  const { fs: f, db } = bundle;
  await f.setDoc(f.doc(db, 'admins', uid), {
    uid,
    email,
    displayName: name,
    role: 'owner',
    createdAt: f.serverTimestamp(),
  });
}

export async function setRole(uid: string, role: 'owner' | 'admin' | 'none') {
  const bundle = await fs();
  if (!bundle) throw new Error('Cloud sync is not configured.');
  const { fs: f, db } = bundle;
  if (role === 'none') {
    await f.deleteDoc(f.doc(db, 'admins', uid));
    return;
  }
  // `grantedAt` is a real column; the `updatedAt` this used to send matched no
  // field in the map, so it was dropped and the row never recorded the change.
  await f.setDoc(f.doc(db, 'admins', uid), { uid, role, grantedAt: f.serverTimestamp() }, { merge: true });
}

/* ------------------------------------------------------------------ */
/* sponsor slots for the ad gate                                       */
/* ------------------------------------------------------------------ */

export interface Sponsor {
  id: string;
  name: string;
  line: string;
  url: string;
  imageUrl: string;
}

export async function fetchSponsors(): Promise<Sponsor[]> {
  const bundle = await fs();
  if (!bundle) return [];
  const { fs: f, db } = bundle;
  try {
    const snap = await f.getDocs(f.query(f.collection(db, 'sponsors'), f.limit(20)));
    return snap.docs.map((doc) => {
      const data = doc.data();
      return {
        id: doc.id,
        name: str(data.name, 'A friend of the room'),
        line: str(data.line, 'Thanks for keeping this place free.'),
        url: str(data.url),
        imageUrl: str(data.imageUrl ?? data.image),
      };
    });
  } catch {
    return [];
  }
}

/* ------------------------------------------------------------------ */

/**
 * Postgres answers in five-character codes; a person should not have to read
 * them. The ones worth naming are named, and everything else is passed through
 * as the database wrote it — trimmed, never invented.
 */
export function describeError(error: unknown): string {
  const code = (error as { code?: string })?.code ?? '';
  const message = (error as { message?: string })?.message ?? '';
  if (code === '42501' || code === 'PGRST301') return 'The database refused that request — sign in and try again.';
  if (code === '23505') return 'That name is already taken.';
  if (code === '23503') return 'That row refers to something that no longer exists.';
  if (code === '42P01' || code === 'PGRST205') return 'The database is missing a table — apply supabase/schema.sql.';
  if (code === 'P0001') return message.slice(0, 160) || 'The database declined that.';
  if (!navigator.onLine) return 'You appear to be offline.';
  return message.replace(/^BackendError:\s*/, '').slice(0, 160) || 'Something went wrong.';
}

/** All published speeches belonging to one /username handle. */
/**
 * Is this address already taken by another of the author's works?
 *
 * The address belongs to one person, so the check is scoped to their own
 * writing: two authors may both have `/their-name/my-day`. Uniqueness is
 * enforced here for a clear error message, and again by the write itself —
 * the rules do not allow a second work at the same address.
 *
 * `exceptId` is the work being renamed, which is allowed to keep its address.
 */
export async function pathTaken(
  username: string,
  folder: string,
  slug: string,
  exceptId?: string,
): Promise<boolean> {
  const works = await fetchSpeechesByUsername(username);
  return works.some(
    (work) =>
      work.id !== exceptId
      && (work.slug ?? '') === slug
      && (work.folder ?? '') === folder,
  );
}

/** Move a work to a new address (`/user/folder/slug`). */
export async function moveSpeech(
  id: string,
  username: string,
  folder: string,
  slug: string,
): Promise<void> {
  if (await pathTaken(username, folder, slug, id)) {
    throw new Error(`/@${username}/${[folder, slug].filter(Boolean).join('/')} is already one of your links.`);
  }
  await updateSpeechDoc(id, { username, folder, slug });
}

export async function fetchSpeechesByUsernameResult(username: string): Promise<CloudResult> {
  try {
    const page = await fetchLibrary({ username, max: 200 });
    if (page.source === 'none') {
      return { items: [], status: 'error', error: page.error ?? 'The reading room could not be reached.' };
    }
    return { items: page.items.map((row) => mapSpeechRow(String(row.id ?? ''), row)), status: 'online' };
  } catch (error) {
    return { items: [], status: 'error', error: describeError(error) };
  }
}

export async function fetchSpeechesByUsername(username: string): Promise<CloudSpeech[]> {
  return (await fetchSpeechesByUsernameResult(username)).items;
}
