import { slugify } from './text';
export const RESERVED_HANDLES = new Set(['read','rehearse','write','arrivals','community','desk','control','themes','about','admin','topics','practice','studio','web','index.html','claim','support','feedback','api','login','signup','404','sitemap.xml','robots.txt']);
export function normalizeUsername(raw: string): string { return raw.trim().toLowerCase().replace(/^@/, ''); }
export function validateUsername(raw: string): { ok: boolean; username: string; error?: string } {
  const username = normalizeUsername(raw);
  if (username.length < 3) return { ok: false, username, error: 'At least 3 characters.' };
  if (username.length > 24) return { ok: false, username, error: 'At most 24 characters.' };
  if (!/^[a-z0-9_]+$/.test(username)) return { ok: false, username, error: 'Letters, numbers and underscores only.' };
  if (/^_|_$/.test(username) || username.includes('__')) return { ok: false, username, error: 'Underscores cannot lead, trail or double up.' };
  if (RESERVED_HANDLES.has(username)) return { ok: false, username, error: 'That handle is reserved for a page of the site.' };
  return { ok: true, username };
}
export function contentSlug(title: string): string { return slugify(title).slice(0, 80) || 'untitled'; }
/** Originality check (2.6): 8-word shingle overlap + longest shared run.
 * Client-side screen against library/cloud/local texts; server rules remain
 * the authority. Returns worst match so a writer can rewrite, not a verdict. */
export interface SimilarityHit { id: string; title: string; score: number; sharedPhrase: string }
function normalize(text: string): string[] { return text.toLowerCase().replace(/[#>*`_[\]()]/g, ' ').replace(/[^a-z0-9\s']/g, ' ').split(/\s+/).filter(Boolean); }
export function similarity(a: string, b: string): { score: number; sharedPhrase: string } {
  const wa = normalize(a), wb = normalize(b);
  if (wa.length < 8 || wb.length < 1) return { score: 0, sharedPhrase: '' };
  const shingles = new Map<string, number>();
  for (let i = 0; i + 8 <= wb.length; i++) shingles.set(wb.slice(i, i + 8).join(' '), i);
  let hits = 0, total = Math.max(1, wa.length - 7), best = '', bestLen = 0;
  for (let i = 0; i + 8 <= wa.length; i++) {
    const s = wa.slice(i, i + 8).join(' ');
    if (shingles.has(s)) { hits++; let len = 8; while (wa[i+len] && wa[i+len] === wb[(shingles.get(s) ?? 0)+len]) len++; if (len > bestLen) { bestLen = len; best = wa.slice(i, i + Math.min(len, 14)).join(' '); } }
  }
  return { score: hits / total, sharedPhrase: best };
}
export function checkOriginality(content: string, corpus: { id: string; title: string; content: string }[]): SimilarityHit | null {
  let worst: SimilarityHit | null = null;
  for (const item of corpus) { const r = similarity(content, item.content); if (r.score > 0 && (!worst || r.score > worst.score)) worst = { id: item.id, title: item.title, score: r.score, sharedPhrase: r.sharedPhrase }; }
  return worst && (worst.score >= 0.02 || worst.sharedPhrase.split(' ').length >= 10) ? worst : null;
}
export const COPYRIGHT_THRESHOLD = 0.18;
