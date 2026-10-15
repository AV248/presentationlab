/**
 * Data access for Presentation Buddy.
 *
 * Everything durable lives in Postgres (Supabase). The names below are the
 * app's own collection names; src/services/backend/supabase.ts maps each one
 * to a table, and to the column behind every field:
 *
 *   presentations — speeches. Public read; authors may write their own.
 *   bloggerblogs  — community posts ("open mic"). Authors may write.
 *   users         — one row per person, carrying their own like score.
 *   handles       — the username lock: one row per claimed name.
 *   reactions     — one row per (person, speech): like or dislike.
 *   shares        — one row per (person, speech) share.
 *   admins        — role rows: 'owner' | 'admin'.
 *   adminPrivate  — the second lock; readable only by a role-holder.
 *   servingads    — sponsored cards.
 *   sponsors      — optional sponsor slots used by the ad gate.
 *   feedback      — what people tell us.
 *   siteSettings  — one row per site-wide setting.
 *
 * Nothing here invents numbers. Counters only ever move by real increments
 * tied to a signed-in person, and the two that must be atomic — reacting and
 * sharing — are single database functions rather than a sequence of writes.
 */

import type { Speech } from '../data/speeches';
import { loadBackend, BACKEND_ENABLED } from './backend';

export type CloudStatus = 'off' | 'connecting' | 'online' | 'error';
export type Role = 'owner' | 'admin' | null;

/* ------------------------------------------------------------------ */
/* mapping                                                             */
/* ------------------------------------------------------------------ */

function str(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  return fallback;
}

function num(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function isoTimestamp(value: unknown): string {
  if (!value) return '';
  try {
    // Rows carry ISO strings; the shape below is for anything older.
    const maybe = value as { toDate?: () => Date; seconds?: number };
    if (typeof maybe.toDate === 'function') return maybe.toDate().toISOString();
    if (typeof maybe.seconds === 'number') return new Date(maybe.seconds * 1000).toISOString();
  } catch {
    /* fall through */
  }
  return str(value);
}

export interface CloudSpeech extends Speech {
  uid: string;
  /** One optional sub-folder, so a work can live at /user/folder/slug. */
  folder?: string;
  views: number;
  likes: number;
  dislikes: number;
  shares: number;
  ad: boolean;
  updatedAt: string;
  createdMs: number;
}

function mapSpeech(id: string, data: Record<string, unknown>): CloudSpeech {
  const content = str(data.Content ?? data.content);
  const title = str(data.Title ?? data.title, 'Untitled');
  const created = isoTimestamp(data.createdAt ?? data.Date ?? data.date);
  return {
    id,
    kind: 'speech',
    title,
    author: str(data.Author ?? data.author, 'Anonymous'),
    category: str(data.Category ?? data.category, 'General'),
    occasion: str(data.Occasion ?? data.occasion, 'Shared speech'),
    level: 'Standard',
    tags: str(data.Tags ?? data.tags)
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean),
    preview: str(data.Preview ?? data.preview) || content.replace(/[#>*`]/g, '').slice(0, 180),
    content: content || 'This speech has no body text yet.',
    createdAt: created ? created.slice(0, 10) : new Date().toISOString().slice(0, 10),
    uid: str(data.uid ?? data.authorUid),
    username: str(data.username) || undefined,
    slug: str(data.slug) || undefined,
    folder: str(data.folder) || undefined,
    credits: str(data.Credits ?? data.credits) || undefined,
    signature: str(data.Signature ?? data.signature) || undefined,
    allowCopy: data.allowCopy === false ? false : true,
    views: num(data.views),
    likes: num(data.likes),
    dislikes: num(data.dislikes),
    shares: num(data.shares),
    ad: Boolean(data.ad),
    updatedAt: isoTimestamp(data.updatedAt),
    createdMs: created ? new Date(created).getTime() : 0,
  };
}

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
  if (!BACKEND_ENABLED) return { items: [], status: 'off' };
  try {
    const bundle = await fs();
    if (!bundle) return { items: [], status: 'off' };
    const { fs: f, db } = bundle;
    const snap = await f.getDocs(f.query(f.collection(db, 'presentations'), f.limit(200)));
    const items = snap.docs.map((doc) => mapSpeech(doc.id, doc.data()));
    return { items, status: 'online' };
  } catch (error) {
    return {
      items: [],
      status: 'error',
      error: describeError(error),
    };
  }
}

export async function getSpeech(id: string): Promise<CloudSpeech | null> {
  const bundle = await fs();
  if (!bundle) return null;
  const { fs: f, db } = bundle;
  const snap = await f.getDoc(f.doc(db, 'presentations', id));
  if (!snap.exists()) return null;
  return mapSpeech(snap.id, snap.data() ?? {});
}

/** A real view: one increment per open. Fails silently if rules forbid it. */
export async function registerView(id: string): Promise<void> {
  const bundle = await fs();
  if (!bundle) return;
  try {
    await bundle.fs.updateDoc(bundle.fs.doc(bundle.db, 'presentations', id), {
      views: bundle.fs.increment(1),
    });
  } catch {
    /* read-only rules are a perfectly normal configuration */
  }
}

export interface PublishInput {
  title: string;
  content: string;
  preview: string;
  category: string;
  occasion: string;
  tags: string[];
  ad?: boolean;
  username?: string;
  slug?: string;
  /** One optional sub-folder: `/user/folder/slug`. Never more than one. */
  folder?: string;
  credits?: string;
  signature?: string;
  allowCopy?: boolean;
}

export async function publishSpeech(
  input: PublishInput,
  uid: string,
  authorName: string,
): Promise<{ id: string }> {
  const bundle = await fs();
  if (!bundle) throw new Error('Cloud publishing is not configured on this installation.');
  const { fs: f, db } = bundle;
  const now = new Date().toISOString().slice(0, 10);
  const payload = {
    Title: input.title,
    Content: input.content,
    Preview: input.preview,
    Category: input.category,
    Occasion: input.occasion,
    Tags: input.tags.join(', '),
    Author: authorName,
    uid,
    username: input.username ?? '',
    slug: input.slug ?? '',
    folder: input.folder ?? '',
    Credits: input.credits ?? '',
    Signature: input.signature ?? '',
    allowCopy: input.allowCopy !== false,
    ad: Boolean(input.ad),
    views: 0,
    likes: 0,
    dislikes: 0,
    shares: 0,
    Date: now,
    createdAt: f.serverTimestamp(),
    updatedAt: f.serverTimestamp(),
  };
  const ref = await f.addDoc(f.collection(db, 'presentations'), payload);
  return { id: ref.id };
}

export async function updateSpeechDoc(id: string, patch: Partial<PublishInput>): Promise<void> {
  const bundle = await fs();
  if (!bundle) throw new Error('Cloud sync is not configured.');
  const { fs: f, db } = bundle;
  const payload: Record<string, unknown> = { updatedAt: f.serverTimestamp() };
  if (patch.title !== undefined) payload.Title = patch.title;
  if (patch.content !== undefined) payload.Content = patch.content;
  if (patch.preview !== undefined) payload.Preview = patch.preview;
  if (patch.category !== undefined) payload.Category = patch.category;
  if (patch.occasion !== undefined) payload.Occasion = patch.occasion;
  if (patch.tags !== undefined) payload.Tags = patch.tags.join(', ');
  if (patch.ad !== undefined) payload.ad = Boolean(patch.ad);
  if (patch.credits !== undefined) payload.Credits = patch.credits;
  if (patch.signature !== undefined) payload.Signature = patch.signature;
  if (patch.allowCopy !== undefined) payload.allowCopy = patch.allowCopy !== false;
  if (patch.folder !== undefined) payload.folder = patch.folder;
  if (patch.slug !== undefined) payload.slug = patch.slug;
  if (patch.username !== undefined) payload.username = patch.username;
  await f.updateDoc(f.doc(db, 'presentations', id), payload);
}

export async function deleteSpeechDoc(id: string): Promise<void> {
  const bundle = await fs();
  if (!bundle) throw new Error('Cloud sync is not configured.');
  await bundle.fs.deleteDoc(bundle.fs.doc(bundle.db, 'presentations', id));
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

/**
 * Sets or clears a reaction.
 *
 * The whole operation — the reaction row, the speech's counters and the
 * author's points — happens inside one Postgres function
 * (`public.react_to_speech`), so it is atomic on the server rather than
 * transactional in a browser tab. Clicking the same reaction twice takes it
 * back; points are +1 per like, −1 per 3 dislikes, exactly as on the original
 * site.
 *
 * `uid` is passed for the reader's own bookkeeping; the function takes the
 * identity from the verified token, so it cannot be spoofed from here.
 */
export async function setReaction(
  speechId: string,
  uid: string,
  kind: ReactionKind,
): Promise<ReactionState> {
  const bundle = await fs();
  if (!bundle) throw new Error('Sign-in is required to react.');
  const { rpc } = bundle;

  const result = await rpc<{ kind: string | null; likes: number; dislikes: number }>(
    'react_to_speech',
    { p_speech_id: speechId, p_kind: kind },
  );
  void uid;
  return {
    kind: (result?.kind ?? null) as ReactionKind | null,
    likes: Number(result?.likes ?? 0),
    dislikes: Number(result?.dislikes ?? 0),
  };
}


export async function fetchMyReactions(uid: string): Promise<Record<string, ReactionKind>> {
  const bundle = await fs();
  if (!bundle || !uid) return {};
  const { fs: f, db } = bundle;
  try {
    const snap = await f.getDocs(
      f.query(f.collection(db, 'reactions'), f.where('uid', '==', uid), f.limit(300)),
    );
    const out: Record<string, ReactionKind> = {};
    for (const doc of snap.docs) {
      const data = doc.data();
      const key = str(data.speechId);
      if (key) out[key] = str(data.kind) === 'dislike' ? 'dislike' : 'like';
    }
    return out;
  } catch {
    return {};
  }
}

/* ------------------------------------------------------------------ */
/* shares — signed in only                                            */
/* ------------------------------------------------------------------ */

/**
 * Count a share, once per person per speech.
 *
 * `public.record_share` inserts the row and moves the counter in one
 * statement, so two taps in another tab cannot double-count; a repeat share by
 * the same person is a no-op that returns the current number.
 */
export async function recordShare(speechId: string, uid: string): Promise<number> {
  const bundle = await fs();
  if (!bundle) throw new Error('Sign-in is required to share.');
  void uid;
  const total = await bundle.rpc<number>('record_share', { p_speech_id: speechId });
  return num(total);
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
  const bundle = await fs();
  if (!bundle) return [];
  const { fs: f, db } = bundle;
  try {
    const snap = await f.getDocs(f.query(f.collection(db, 'posts'), f.limit(100)));
    return snap.docs
      .map((doc) => {
        const data = doc.data();
        const created = isoTimestamp(data.createdAt ?? data.Date);
        return {
          id: doc.id,
          title: str(data.Title ?? data.title, 'Untitled note'),
          body: str(data.Content ?? data.body ?? data.content),
          author: str(data.Author ?? data.author, 'Anonymous'),
          uid: str(data.uid),
          createdAt: created,
          createdMs: created ? new Date(created).getTime() : 0,
        };
      })
      .sort((a, b) => b.createdMs - a.createdMs);
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
    Author: author,
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
  const bundle = await fs();
  if (!bundle) return [];
  const { fs: f, db } = bundle;
  try {
    // One row per person. `likes_received`/`dislikes_received` are maintained
    // by public.react_to_speech, so the points column is always explainable
    // from the reactions themselves.
    const snap = await f.getDocs(
      f.query(f.collection(db, 'users'), f.orderBy('likesReceived', 'desc'), f.limit(200)),
    );
    const rows = snap.docs.map((doc) => {
      const data = doc.data();
      const likesReceived = num(data.likesReceived);
      const dislikesReceived = num(data.dislikesReceived);
      return {
        uid: doc.id,
        name: str(data.displayName, 'Anonymous'),
        email: typeof data.email === 'string' ? data.email : null,
        photoURL: typeof data.photoURL === 'string' ? data.photoURL : null,
        posts: num(data.points),
        likesReceived,
        dislikesReceived,
        points: pointsFor(likesReceived, dislikesReceived),
      };
    });
    return rows.sort((a, b) => b.points - a.points || b.likesReceived - a.likesReceived);
  } catch {
    return [];
  }
}

export async function fetchUsers(): Promise<
  { uid: string; displayName: string | null; email: string | null; providerId: string | null }[]
> {
  const bundle = await fs();
  if (!bundle) return [];
  const { fs: f, db } = bundle;
  try {
    const snap = await f.getDocs(f.query(f.collection(db, 'users'), f.limit(200)));
    return snap.docs.map((doc) => {
      const data = doc.data();
      return {
        uid: doc.id,
        displayName: typeof data.displayName === 'string' ? data.displayName : null,
        email: typeof data.email === 'string' ? data.email : null,
        providerId: typeof data.providerId === 'string' ? data.providerId : null,
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

export async function fetchSpeechesByUsername(username: string): Promise<CloudSpeech[]> {
  if (!BACKEND_ENABLED) return [];
  const bundle = await fs(); if (!bundle) return [];
  const { fs: f, db } = bundle;
  try {
    const snap = await f.getDocs(f.query(f.collection(db, 'presentations'), f.where('username', '==', username), f.limit(100)));
    return snap.docs.map((d) => mapSpeech(d.id, d.data()));
  } catch { return []; }
}
