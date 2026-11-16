/**
 * The address of a piece of writing.
 *
 * A speech lives at `/<username>/<slug>`, or `/<username>/<folder>/<slug>`.
 * Exactly one folder level is allowed: `/user1/1/my-day` is valid,
 * `/user1/1/2/my-day` is not. The address belongs to the author — they may
 * change it — with one rule: it must not collide with another of *their* own
 * addresses at the same level.
 *
 * Kept in its own module so the writer's form, the router, the resolver and
 * the rules all speak the same language about what a valid address is.
 */

/** Words that would shadow a real page of the app. */
const RESERVED = new Set([
  'about', 'admin', 'api', 'arrivals', 'category', 'claim', 'community', 'control', 'dbms', 'desk',
  'download', 'feedback', 'policy', 'privacy', 'read', 'report', 'rehearse', 'settings',
  'sso-callback', 'tag', 'templates', 'terms', 'themes', 'topics', 'write',
]);

export interface SegmentResult {
  ok: boolean;
  /** The normalised value — what would actually be written. */
  value: string;
  error?: string;
}

/** Lower-case, digits and single hyphens; 1–60 characters. */
export function slugifySegment(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

/**
 * Validate one path segment. `what` only dresses the error message; the rule
 * is the same for a folder and for a speech's own name.
 */
export function validateSegment(input: string, what: 'link' | 'folder' = 'link'): SegmentResult {
  const value = slugifySegment(input);
  const label = what === 'folder' ? 'A folder' : 'A link';
  if (!value) return { ok: false, value, error: `${label} needs at least one letter or number.` };
  if (value.length > 60) return { ok: false, value, error: `${label} can be at most 60 characters.` };
  if (RESERVED.has(value)) return { ok: false, value, error: `"${value}" is a page of the site itself — pick another.` };
  return { ok: true, value };
}

/** The path a speech answers to: `/user/slug` or `/user/folder/slug`. */
export function workPath(username: string, slug: string, folder = ''): string {
  const clean = [username.trim().toLowerCase(), folder.trim(), slug.trim()].filter(Boolean).join('/');
  return `/${clean}`;
}

/** Canonical public address shared by cards, the profile index, and the sitemap. */
export function presentationPath(presentation: {
  id: string;
  username?: string;
  slug?: string;
  folder?: string;
}): string {
  const id = presentation.id.trim();
  const username = presentation.username?.trim().toLowerCase();
  if (username && id) return workPath(username, presentation.slug?.trim() || id, presentation.folder ?? '');
  return `/read/${encodeURIComponent(id)}`;
}

/** Same, as the short share link the site prints. */
export function workShortPath(username: string, slug: string, folder = ''): string {
  return workPath(username, slug, folder);
}

/** How many path segments a stored address has, ignoring the username. */
export function depthOf(folder: string): number {
  return folder ? 1 : 0;
}
