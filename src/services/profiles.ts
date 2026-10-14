import { loadFirebase, FIREBASE_ENABLED } from './firebase';
import { validateUsername } from '../lib/identity';
async function fs() { return loadFirebase(); }
const str = (v: unknown, f = '') => typeof v === 'string' ? v : f;
export interface PublicProfile { username: string; uid: string; displayName: string; bio: string; location: string; website: string; signature: string; createdAt: string }
/** Claim /username: handles/{username} is the uniqueness lock (create-only
 * in firestore.rules); users/{uid} mirrors the profile for the leaderboard. */
/** Does a handle exist? `unknown` when we simply cannot tell (denied read,
 * offline, Firebase unconfigured) — never guess "free" in that case. */
export async function fetchHandleState(username: string): Promise<'held' | 'free' | 'unknown'> {
  if (!FIREBASE_ENABLED) return 'unknown';
  const b = await fs(); if (!b) return 'unknown';
  try {
    const snap = await b.fs.getDoc(b.fs.doc(b.db, 'handles', username));
    return snap.exists() ? 'held' : 'free';
  } catch { return 'unknown'; }
}

/** The outcome of an automatic claim, spelled out for the caller. */
export interface AutoClaimResult { ok: boolean; username: string; reason?: 'taken' | 'unavailable' | 'invalid' }

/**
 * Claim the username a person already set in Clerk.
 *
 * Clerk is where the username lives, but the *site's* address book is
 * `handles/{username}` — so a name set in Manage Account is not a handle
 * until it is written here. Doing that automatically on sign-in is what makes
 * the sidebar say @name instead of asking for something the person already
 * gave. Deliberately quiet and idempotent:
 *
 *   • never steals: a handle held by somebody else is reported, not taken
 *   • never updates the handle document: rules allow create-only, so a retry
 *     skips the write rather than being refused as an "insufficient
 *     permission" error
 *   • only mirrors displayName into `users/{uid}` when we have one, merged, so
 *     nothing a person has already written is blanked
 */
export async function autoClaimUsername(uid: string, raw: string, displayName?: string): Promise<AutoClaimResult> {
  const v = validateUsername(raw);
  if (!v.ok) return { ok: false, username: v.username, reason: 'invalid' };
  if (!FIREBASE_ENABLED) return { ok: false, username: v.username, reason: 'unavailable' };
  const b = await fs(); if (!b) return { ok: false, username: v.username, reason: 'unavailable' };
  const { fs: f, db } = b;
  try {
    // Already claimed on some device? Whatever is recorded wins.
    const own = await fetchOwnProfile(uid);
    if (own?.username) return { ok: true, username: own.username };

    const ref = f.doc(db, 'handles', v.username);
    const existing = await f.getDoc(ref);
    const holder = existing.exists() ? str((existing.data() ?? {}).uid) : '';
    if (holder && holder !== uid) return { ok: false, username: v.username, reason: 'taken' };

    // Create-only: when the document already exists with our own uid, the
    // write is skipped (rules forbid updates, and there is nothing to change).
    if (!holder) {
      await f.setDoc(ref, { uid, username: v.username, updatedAt: f.serverTimestamp() });
    }
    await f.setDoc(
      f.doc(db, 'users', uid),
      { uid, username: v.username, ...(displayName ? { displayName } : {}), updatedAt: f.serverTimestamp() },
      { merge: true },
    );
    return { ok: true, username: v.username };
  } catch {
    return { ok: false, username: v.username, reason: 'unavailable' };
  }
}

export async function claimUsername(uid: string, raw: string, profile: Partial<PublicProfile>): Promise<string> {
  const v = validateUsername(raw); if (!v.ok) throw new Error(v.error);
  // Local-first: claiming works offline as a reservation on this device;
  // Firestore enforces global uniqueness when configured.
  if (!FIREBASE_ENABLED) return v.username;
  const b = await fs(); if (!b) return v.username;
  const { fs: f, db } = b;
  // One username per user, and it can never be changed.
  const own = await fetchOwnProfile(uid);
  if (own?.username && own.username !== v.username) {
    throw new Error(`Your username is @${own.username} — usernames cannot be changed.`);
  }
  const ref = f.doc(db, 'handles', v.username);
  const existing = await f.getDoc(ref);
  const holder = existing.exists() ? str((existing.data() ?? {}).uid) : '';
  if (holder && holder !== uid) throw new Error('That username is already taken. Try another.');
  // rules allow create-only for the claimant, so an existing document of our
  // own is left exactly as it is — rewriting it reads as an update and is
  // refused as "insufficient permissions", which is how a *retry* used to
  // fail for somebody who had already claimed the very same handle.
  if (!holder) {
    await f.setDoc(ref, { uid, username: v.username, updatedAt: f.serverTimestamp() });
  }
  await f.setDoc(f.doc(db, 'users', uid), { uid, username: v.username, displayName: profile.displayName ?? '', bio: profile.bio ?? '', location: profile.location ?? '', website: profile.website ?? '', signature: profile.signature ?? '', updatedAt: f.serverTimestamp() }, { merge: true });
  return v.username;
}
export async function fetchProfile(username: string): Promise<PublicProfile | null> {
  if (!FIREBASE_ENABLED) return null;
  const b = await fs(); if (!b) return null;
  const { fs: f, db } = b;
  try {
    const h = await f.getDoc(f.doc(db, 'handles', username));
    if (!h.exists()) return null;
    const uid = str((h.data() ?? {}).uid); if (!uid) return null;
    const u = await f.getDoc(f.doc(db, 'users', uid));
    const d = u.exists() ? u.data() ?? {} : {};
    return { username, uid, displayName: str(d.displayName, username), bio: str(d.bio), location: str(d.location), website: str(d.website), signature: str(d.signature), createdAt: str(d.createdAt) };
  } catch { return null; }
}
export async function fetchOwnProfile(uid: string): Promise<PublicProfile | null> {
  if (!FIREBASE_ENABLED) return null;
  const b = await fs(); if (!b) return null;
  try {
    const u = await b.fs.getDoc(b.fs.doc(b.db, 'users', uid));
    if (!u.exists()) return null;
    const d = u.data() ?? {};
    if (!str(d.username)) return null;
    return { username: str(d.username), uid, displayName: str(d.displayName), bio: str(d.bio), location: str(d.location), website: str(d.website), signature: str(d.signature), createdAt: str(d.createdAt) };
  } catch { return null; }
}
export async function isUsernameAvailable(raw: string, myUid?: string): Promise<boolean> {
  const v = validateUsername(raw); if (!v.ok) return false;
  if (!FIREBASE_ENABLED) return true;
  const b = await fs(); if (!b) return true;
  try { const s = await b.fs.getDoc(b.fs.doc(b.db, 'handles', v.username)); return !s.exists() || str((s.data() ?? {}).uid) === myUid; } catch { return true; }
}
export async function submitFeedback(uid: string | null, rating: number, text: string): Promise<'cloud' | 'local'> {
  const payload = { rating, text, uid: uid ?? null, path: typeof location !== 'undefined' ? location.pathname : '', createdAt: new Date().toISOString() };
  try {
    const raw = localStorage.getItem('pb.feedback.queue'); const q = raw ? JSON.parse(raw) as unknown[] : []; q.push(payload); localStorage.setItem('pb.feedback.queue', JSON.stringify(q.slice(-50)));
  } catch { /* ignore */ }
  if (!FIREBASE_ENABLED) return 'local';
  const b = await fs(); if (!b) return 'local';
  try { await b.fs.addDoc(b.fs.collection(b.db, 'feedback'), { ...payload, createdAt: b.fs.serverTimestamp() }); return 'cloud'; } catch { return 'local'; }
}
let flushing = false;
/** Deliver any feedback queued while offline/unconfigured. Called on app
 * start and whenever the dialog opens, so nothing a user wrote is stranded. */
export async function flushFeedbackQueue(): Promise<void> {
  if (flushing || !FIREBASE_ENABLED) return;
  let queue: Record<string, unknown>[] = [];
  try { queue = JSON.parse(localStorage.getItem('pb.feedback.queue') ?? '[]') as Record<string, unknown>[]; } catch { return; }
  if (!queue.length) return;
  const b = await fs(); if (!b) return;
  flushing = true;
  try {
    for (const item of queue) {
      await b.fs.addDoc(b.fs.collection(b.db, 'feedback'), { rating: item.rating, text: item.text ?? '', uid: item.uid ?? null, path: item.path ?? '', clientAt: item.createdAt ?? null, createdAt: b.fs.serverTimestamp() });
    }
    localStorage.removeItem('pb.feedback.queue');
  } catch { /* keep the queue for the next visit */ } finally { flushing = false; }
}
export async function fetchSiteFestival(): Promise<string | null> {
  if (!FIREBASE_ENABLED) return null;
  const b = await fs(); if (!b) return null;
  try { const s = await b.fs.getDoc(b.fs.doc(b.db, 'siteSettings', 'theme')); return s.exists() ? str((s.data() ?? {}).festivalId) || null : null; } catch { return null; }
}
export async function setSiteFestival(festivalId: string): Promise<void> {
  const b = await fs(); if (!b) throw new Error('Cloud is not configured on this installation.');
  await b.fs.setDoc(b.fs.doc(b.db, 'siteSettings', 'theme'), { festivalId, updatedAt: b.fs.serverTimestamp() }, { merge: true });
}
export const SUPPORT_EMAIL = 'amaavrit@yahoo.com';
export const SUPPORT_URL = 'https://contact.aavrit.dedyn.io';
