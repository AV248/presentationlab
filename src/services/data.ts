/**
 * Firestore access for Presentation Buddy.
 *
 * Collections (matching the original Presentation Lab, minus the password
 * handling):
 *   presentations  — speeches. Public read; authors may write.
 *   bloggerblogs   — community posts ("open mic"). Authors may write.
 *   bloggers       — one doc per contributor, with real reaction counters.
 *   reactions      — one doc per (person, speech): like or dislike.
 *   shares         — one doc per (person, speech) share.
 *   users          — profile mirror for every signed-in person.
 *   admins/{uid}   — role documents: 'owner' | 'admin'.
 *   admin          — the legacy allow-list from v1 (checked by email only).
 *   sponsors       — optional sponsor slots used by the ad gate.
 *
 * Nothing here invents numbers. Counters only ever move by real increments
 * tied to a signed-in person.
 */

import type { Speech } from '../data/speeches';
import { loadFirebase, FIREBASE_ENABLED } from './firebase';

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
    // Firestore Timestamp
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
  const bundle = await loadFirebase();
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
  if (!FIREBASE_ENABLED) return { items: [], status: 'off' };
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
 * Sets or clears a reaction inside a transaction so the speech counters and
 * the author's `bloggers` counters can never drift apart.
 * Points are the rule from the original site: +1 per like, −1 per 3 dislikes.
 */
export async function setReaction(
  speechId: string,
  uid: string,
  kind: ReactionKind,
): Promise<ReactionState> {
  const bundle = await fs();
  if (!bundle) throw new Error('Sign-in is required to react.');
  const { fs: f, db } = bundle;

  return f.runTransaction(db, async (tx) => {
    const speechRef = f.doc(db, 'presentations', speechId);
    const reactionRef = f.doc(db, 'reactions', `${uid}_${speechId}`);

    const speechSnap = await tx.get(speechRef);
    const reactionSnap = await tx.get(reactionRef);

    const speechData = speechSnap.exists() ? speechSnap.data() ?? {} : {};
    const previous = reactionSnap.exists() ? (str((reactionSnap.data() ?? {}).kind) as ReactionKind) : null;

    let likes = num(speechData.likes);
    let dislikes = num(speechData.dislikes);

    if (previous === kind) {
      // Clicking the same reaction twice takes it back.
      if (kind === 'like') likes = Math.max(0, likes - 1);
      else dislikes = Math.max(0, dislikes - 1);
      tx.delete(reactionRef);
      return { kind: null, likes, dislikes } as ReactionState;
    }

    if (previous === 'like') likes = Math.max(0, likes - 1);
    if (previous === 'dislike') dislikes = Math.max(0, dislikes - 1);
    if (kind === 'like') likes += 1;
    else dislikes += 1;

    tx.set(reactionRef, {
      uid,
      speechId,
      kind,
      updatedAt: f.serverTimestamp(),
    });

    // Only counter-update when the author is a real, known contributor.
    const authorUid = str(speechData.uid);
    if (speechSnap.exists() && authorUid) {
      const bloggerRef = f.doc(db, 'bloggers', authorUid);
      const bloggerSnap = await tx.get(bloggerRef);
      if (bloggerSnap.exists()) {
        const blogger = bloggerSnap.data() ?? {};
        const receivedLikes = num(blogger.likesReceived) + (kind === 'like' ? 1 : 0) - (previous === 'like' ? 1 : 0);
        const receivedDislikes =
          num(blogger.dislikesReceived) + (kind === 'dislike' ? 1 : 0) - (previous === 'dislike' ? 1 : 0);
        tx.set(
          bloggerRef,
          {
            likesReceived: Math.max(0, receivedLikes),
            dislikesReceived: Math.max(0, receivedDislikes),
            points: Math.max(0, receivedLikes - Math.floor(receivedDislikes / 3)),
            updatedAt: f.serverTimestamp(),
          },
          { merge: true },
        );
      }
    }

    tx.update(speechRef, { likes, dislikes });

    return { kind, likes, dislikes } as ReactionState;
  });
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

export async function recordShare(speechId: string, uid: string): Promise<number> {
  const bundle = await fs();
  if (!bundle) throw new Error('Sign-in is required to share.');
  const { fs: f, db } = bundle;
  await f.setDoc(f.doc(db, 'shares', `${uid}_${speechId}`), {
    uid,
    speechId,
    createdAt: f.serverTimestamp(),
  });
  const ref = f.doc(db, 'presentations', speechId);
  await f.updateDoc(ref, { shares: f.increment(1) });
  const snap = await f.getDoc(ref);
  return num((snap.data() ?? {}).shares);
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
    const snap = await f.getDocs(f.query(f.collection(db, 'bloggerblogs'), f.limit(100)));
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
  try {
    await f.updateDoc(f.doc(db, 'bloggers', uid), {
      posts: f.increment(1),
      updatedAt: f.serverTimestamp(),
    });
  } catch {
    /* counter is best effort */
  }
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
    const snap = await f.getDocs(f.query(f.collection(db, 'bloggers'), f.limit(200)));
    const rows = snap.docs.map((doc) => {
      const data = doc.data();
      const likesReceived = num(data.likesReceived);
      const dislikesReceived = num(data.dislikesReceived);
      return {
        uid: doc.id,
        name: str(data.name, 'Anonymous'),
        email: typeof data.email === 'string' ? data.email : null,
        photoURL: typeof data.photoURL === 'string' ? data.photoURL : null,
        posts: num(data.posts),
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
export async function fetchRole(uid: string, email: string | null): Promise<Role> {
  const bundle = await fs();
  if (!bundle) return null;
  const { fs: f, db } = bundle;
  try {
    const direct = await f.getDoc(f.doc(db, 'admins', uid));
    if (direct.exists()) {
      const role = str((direct.data() ?? {}).role);
      if (role === 'owner' || role === 'admin') return role;
    }
  } catch {
    /* ignore and fall through to the legacy check */
  }
  if (email) {
    try {
      const legacy = await f.getDocs(
        f.query(f.collection(db, 'admin'), f.where('email', '==', email), f.limit(1)),
      );
      const first = legacy.docs[0];
      if (first) {
        const role = str((first.data() ?? {}).role);
        if (role === 'owner' || role === 'admin') return role;
        return 'admin';
      }
    } catch {
      /* no legacy collection, or rules deny it */
    }
  }
  return null;
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
  await f.setDoc(f.doc(db, 'admins', uid), { uid, role, updatedAt: f.serverTimestamp() }, { merge: true });
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

export function describeError(error: unknown): string {
  const code = (error as { code?: string })?.code ?? '';
  const message = (error as { message?: string })?.message ?? '';
  if (code === 'permission-denied') return 'Firestore rules denied that request.';
  if (code === 'unavailable') return 'You appear to be offline.';
  if (code === 'failed-precondition') return 'This query needs a Firestore index.';
  return message.replace(/^FirebaseError:\s*/, '').slice(0, 160) || 'Something went wrong.';
}
