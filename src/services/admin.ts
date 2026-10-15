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

async function fs() {
  const bundle = await loadBackend();
  if (!bundle) throw new Error('Cloud is not configured on this installation.');
  return bundle;
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
