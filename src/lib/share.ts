/** Short share domain (2.6). Canonical stays on SITE_URL; every user-facing
 * share/copy link uses pb.devs.surf with the exact same path. The short
 * domain should 301 to the canonical host (docs/VERCEL.md). */
export const SHORT_URL = 'https://pb.devs.surf';
export function shortUrl(path = '/'): string {
  const clean = path.startsWith('/') ? path : `/${path}`;
  return `${SHORT_URL}${clean}`;
}
export function shortPath(urlOrPath: string): string {
  try { const u = new URL(urlOrPath); return u.pathname + u.search; } catch { return urlOrPath.startsWith('/') ? urlOrPath : `/${urlOrPath}`; }
}
