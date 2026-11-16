import { loadBackend, BACKEND_ENABLED } from './backend';

export interface PublicSiteNotice {
  active: boolean;
  message: string;
  tone: 'info' | 'warning';
  updatedAt?: string;
}

const NOTICE_KEY = 'public_notice';

function normalize(value: unknown): PublicSiteNotice | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const message = typeof row.message === 'string' ? row.message.trim().slice(0, 280) : '';
  if (!message) return null;
  return {
    active: row.active === true,
    message,
    tone: row.tone === 'warning' ? 'warning' : 'info',
    ...(typeof row.updatedAt === 'string' ? { updatedAt: row.updatedAt } : {}),
  };
}

export async function fetchSiteNotice(): Promise<PublicSiteNotice | null> {
  if (!BACKEND_ENABLED) return null;
  const backend = await loadBackend();
  if (!backend) return null;
  try {
    const snap = await backend.fs.getDoc(backend.fs.doc(backend.db, 'siteSettings', NOTICE_KEY));
    return snap.exists() ? normalize(snap.data()?.value) : null;
  } catch {
    return null;
  }
}

export async function saveSiteNotice(input: PublicSiteNotice): Promise<PublicSiteNotice> {
  const message = input.message.trim().slice(0, 280);
  if (input.active && !message) throw new Error('Write the notice before turning it on.');
  const clean: PublicSiteNotice = {
    active: input.active,
    message,
    tone: input.tone === 'warning' ? 'warning' : 'info',
  };
  const backend = await loadBackend();
  if (!backend) throw new Error('Site settings are not configured.');
  await backend.fs.setDoc(backend.fs.doc(backend.db, 'siteSettings', NOTICE_KEY), {
    key: NOTICE_KEY,
    value: clean,
    updatedAt: backend.fs.serverTimestamp(),
  }, { merge: true });
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('pb:site-notice-updated', { detail: clean }));
  return clean;
}
