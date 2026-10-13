/** Short share domain (2.6). Canonical stays on SITE_URL; every user-facing
 * share/copy link uses pb.devs.surf with the exact same path. The short
 * domain should 301 to the canonical host (docs/VERCEL.md). */
export const SHORT_URL = 'https://pb.devs.surf';
export function shortUrl(path = '/'): string {
  // Accepts a path OR a full canonical URL — either way the only thing a
  // user ever copies or shares is pb.devs.surf/<same path>.
  return `${SHORT_URL}${shortPath(path)}`;
}
export function shortPath(urlOrPath: string): string {
  try { const u = new URL(urlOrPath); return u.pathname + u.search; } catch { return urlOrPath.startsWith('/') ? urlOrPath : `/${urlOrPath}`; }
}
