import { loadFirebase, FIREBASE_ENABLED } from './firebase';
import { validateUsername } from '../lib/identity';
async function fs() { return loadFirebase(); }
const str = (v: unknown, f = '') => typeof v === 'string' ? v : f;
export interface PublicProfile { username: string; uid: string; displayName: string; bio: string; location: string; website: string; signature: string; createdAt: string }
/** Claim /username: handles/{username} is the uniqueness lock (create-only
 * in firestore.rules); users/{uid} mirrors the profile for the leaderboard. */
export async function claimUsername(uid: string, raw: string, profile: Partial<PublicProfile>): Promise<string> {
  const v = validateUsername(raw); if (!v.ok) throw new Error(v.error);
  // Local-first: claiming works offline as a reservation on this device;
  // Firestore enforces global uniqueness when configured.
  if (!FIREBASE_ENABLED) return v.username;
  const b = await fs(); if (!b) return v.username;
  const { fs: f, db } = b;
  const ref = f.doc(db, 'handles', v.username);
  const existing = await f.getDoc(ref);
  if (existing.exists() && str((existing.data() ?? {}).uid) !== uid) throw new Error('That username is already taken. Try another.');
  await f.setDoc(ref, { uid, username: v.username, updatedAt: f.serverTimestamp() });
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
