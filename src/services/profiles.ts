import { loadBackend, BACKEND_ENABLED } from './backend';
import { validateUsername } from '../lib/identity';
async function fs() { return loadBackend(); }
const str = (v: unknown, f = '') => typeof v === 'string' ? v : f;
export interface PublicProfile { username: string; uid: string; displayName: string; bio: string; location: string; website: string; signature: string; createdAt: string; photoURL: string }
/** Claim /username: the `handles` row is the uniqueness lock, and it is
 * create-only — the database has a real unique index on `handles.username`, so
 * two people racing for the same name cannot both win. `profiles` mirrors the
 * profile the public page and the leaderboard read. */
/** Does a handle exist? `unknown` when we simply cannot tell (denied read,
 * offline, database unconfigured) — never guess "free" in that case. */
export async function fetchHandleState(username: string): Promise<'held' | 'free' | 'unknown'> {
  if (!BACKEND_ENABLED) return 'unknown';
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
export async function autoClaimUsername(
  uid: string,
  raw: string,
  displayName?: string,
  email?: string,
): Promise<AutoClaimResult> {
  const v = validateUsername(raw);
  if (!v.ok) return { ok: false, username: v.username, reason: 'invalid' };
  if (!BACKEND_ENABLED) return { ok: false, username: v.username, reason: 'unavailable' };
  const b = await fs(); if (!b) return { ok: false, username: v.username, reason: 'unavailable' };
  const { fs: f, db } = b;
  try {
    // Already claimed on some device? Whatever is recorded wins.
    const own = await fetchOwnProfile(uid);
    if (own?.username) return { ok: true, username: own.username };

    const ref = f.doc(db, 'handles', v.username);
    const existing = await f.getDoc(ref);
    const held = existing.exists() ? (existing.data() ?? {}) : {};
    const holder = str(held.uid);
    const reservedForMe = held.reserved === true
      && (holder === uid
        || (!!email && str(held.reservedForEmail).toLowerCase() === email.toLowerCase()));
    if (holder && holder !== uid && !reservedForMe) {
      return { ok: false, username: v.username, reason: 'taken' };
    }

    // Three cases: a free name (create), a name the admin reserved for this
    // person (claim it), or a name already ours (nothing to write — creating
    // is refused because the document exists, updating would be a no-op).
    if (!existing.exists()) {
      await f.setDoc(ref, { uid, username: v.username, updatedAt: f.serverTimestamp() });
    } else if (reservedForMe && holder !== uid) {
      await f.setDoc(ref, {
        uid,
        username: v.username,
        reserved: false,
        reservedForEmail: '',
        updatedAt: f.serverTimestamp(),
      }, { merge: true });
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
  // The database enforces global uniqueness (handles.username is unique).
  if (!BACKEND_ENABLED) return v.username;
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
  if (!BACKEND_ENABLED) return null;
  const b = await fs(); if (!b) return null;
  const { fs: f, db } = b;
  try {
    const h = await f.getDoc(f.doc(db, 'handles', username));
    if (!h.exists()) return null;
    const uid = str((h.data() ?? {}).uid); if (!uid) return null;
    const u = await f.getDoc(f.doc(db, 'users', uid));
    const d = u.exists() ? u.data() ?? {} : {};
    return { username, uid, displayName: str(d.displayName, username), bio: str(d.bio), location: str(d.location), website: str(d.website), signature: str(d.signature), createdAt: str(d.createdAt), photoURL: str(d.photoURL) };
  } catch { return null; }
}
export async function fetchOwnProfile(uid: string): Promise<PublicProfile | null> {
  if (!BACKEND_ENABLED) return null;
  const b = await fs(); if (!b) return null;
  try {
    const u = await b.fs.getDoc(b.fs.doc(b.db, 'users', uid));
    if (!u.exists()) return null;
    const d = u.data() ?? {};
    if (!str(d.username)) return null;
    return { username: str(d.username), uid, displayName: str(d.displayName), bio: str(d.bio), location: str(d.location), website: str(d.website), signature: str(d.signature), createdAt: str(d.createdAt), photoURL: str(d.photoURL) };
  } catch { return null; }
}
/** Is this name reserved (and, if so, is it reserved for me)? */
export async function fetchReservation(
  username: string,
  me: { uid?: string; email?: string | null } = {},
): Promise<'free' | 'mine' | 'reserved' | 'taken' | 'unknown'> {
  if (!BACKEND_ENABLED) return 'unknown';
  const b = await fs(); if (!b) return 'unknown';
  try {
    const snap = await b.fs.getDoc(b.fs.doc(b.db, 'handles', username));
    if (!snap.exists()) return 'free';
    const data = snap.data() ?? {};
    const uid = str(data.uid);
    if (uid && uid === me.uid) return 'mine';
    if (data.reserved === true) {
      const email = str(data.reservedForEmail).toLowerCase();
      const mine = (!!me.uid && uid === me.uid) || (!!email && !!me.email && email === me.email.toLowerCase());
      return mine ? 'mine' : 'reserved';
    }
    return uid ? 'taken' : 'free';
  } catch { return 'unknown'; }
}

export async function isUsernameAvailable(raw: string, myUid?: string): Promise<boolean> {
  const v = validateUsername(raw); if (!v.ok) return false;
  if (!BACKEND_ENABLED) return true;
  const b = await fs(); if (!b) return true;
  try { const s = await b.fs.getDoc(b.fs.doc(b.db, 'handles', v.username)); return !s.exists() || str((s.data() ?? {}).uid) === myUid; } catch { return true; }
}
export async function submitFeedback(uid: string | null, rating: number, text: string): Promise<'cloud' | 'local'> {
  const payload = { rating, text, uid: uid ?? null, path: typeof location !== 'undefined' ? location.pathname : '', createdAt: new Date().toISOString() };
  try {
    const raw = localStorage.getItem('pb.feedback.queue'); const q = raw ? JSON.parse(raw) as unknown[] : []; q.push(payload); localStorage.setItem('pb.feedback.queue', JSON.stringify(q.slice(-50)));
  } catch { /* ignore */ }
  if (!BACKEND_ENABLED) return 'local';
  const b = await fs(); if (!b) return 'local';
  try { await b.fs.addDoc(b.fs.collection(b.db, 'feedback'), { ...payload, createdAt: b.fs.serverTimestamp() }); return 'cloud'; } catch { return 'local'; }
}
let flushing = false;
/** Deliver any feedback queued while offline/unconfigured. Called on app
 * start and whenever the dialog opens, so nothing a user wrote is stranded. */
export async function flushFeedbackQueue(): Promise<void> {
  if (flushing || !BACKEND_ENABLED) return;
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
/**
 * The owner's festival, as `site_settings.theme`.
 *
 * The row is `{ key: 'theme', value: { festivalId } }`. The value column is
 * JSON, so a settings bag can grow without a migration — but it does have to be
 * written *into* that column: a bare `festivalId` key would not match any
 * mapped field, and the engine drops what it cannot map rather than inventing
 * a column. That is the right call at runtime and a silent no-op here, which is
 * why this pairing is written out in full in one place.
 */
export async function fetchSiteFestival(): Promise<string | null> {
  if (!BACKEND_ENABLED) return null;
  const b = await fs(); if (!b) return null;
  try {
    const snap = await b.fs.getDoc(b.fs.doc(b.db, 'siteSettings', 'theme'));
    if (!snap.exists()) return null;
    const value = (snap.data() ?? {}).value;
    // Tolerates a row that stored the id directly, which an older build did.
    const id = typeof value === 'string' ? value : str((value as Record<string, unknown>)?.festivalId);
    return id || null;
  } catch { return null; }
}

export async function setSiteFestival(festivalId: string): Promise<void> {
  const b = await fs(); if (!b) throw new Error('Cloud is not configured on this installation.');
  await b.fs.setDoc(
    b.fs.doc(b.db, 'siteSettings', 'theme'),
    { value: { festivalId }, updatedAt: b.fs.serverTimestamp() },
    { merge: true },
  );
}
export const SUPPORT_EMAIL = 'amaavrit@yahoo.com';
export const SUPPORT_URL = 'https://contact.aavrit.dedyn.io';
