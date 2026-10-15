/**
 * Site-wide SEO constants: the origin, the name, the default description.
 *
 * This module is deliberately **not** a client module. It is read by the App
 * Router's server side — `app/layout.tsx` for the document's metadata,
 * `app/robots.ts` and `app/sitemap.ts` for the two generated files — and
 * importing a hook into that graph is an error, which is a good rule: a
 * constant that needs a browser is not a constant.
 *
 * The hook that pushes the same values into a live document is next door, in
 * `usePageMeta.ts`, for the screens that change the tags after a route has
 * already been served (one writer's handle page, a search result).
 */

export const SITE_NAME = 'Presentation Buddy';

/**
 * The canonical origin.
 *
 * Every canonical tag, sitemap URL, Open Graph URL and structured-data @id
 * derives from this, so it has to be the domain the site is actually served
 * from. Set VITE_SITE_URL in Vercel the moment you know the production
 * domain: if it still points somewhere else, search engines are told that
 * every page is a duplicate of a site you do not control.
 *
 * The fallback keeps local builds and the prerender scripts working without
 * any environment at all.
 */
const DEFAULT_SITE_URL = 'https://presentationbuddy.aavrit.dedyn.io';

function readSiteUrl(): string {
  // Read the property directly off `process.env` rather than caching
  // `process.env` in a variable first: Next.js replaces the literal member
  // expression at build time, and it can only match what it can see.
  const configured = process.env.VITE_SITE_URL?.trim();
  // Trailing slashes would produce "https://site.com//read/x".
  return (configured || DEFAULT_SITE_URL).replace(/\/+$/, '');
}

export const SITE_URL = readSiteUrl();
export const SITE_TAGLINE = 'Write, coach, rehearse and deliver talks that land';
export const DEFAULT_DESCRIPTION =
  'Presentation Buddy is a free, beautifully themeable workspace to write speeches, coach your structure, rehearse with a teleprompter and pacing timer, and read a curated library of real example speeches.';
export const DEFAULT_OG_IMAGE = `${SITE_URL}/cards/presentation-buddy.png`;

/** Turn an app path ("/read/five-minutes") into a canonical absolute URL. */
export function absoluteUrl(path: string): string {
  if (path.startsWith('http')) return path;
  const clean = path.startsWith('/') ? path : `/${path}`;
  return `${SITE_URL}${clean}`;
}

export interface PageMetaOptions {
  description?: string;
  /** Absolute or app-relative canonical. Defaults to the current path. */
  canonical?: string;
  /** Defaults to the site's share card. */
  image?: string;
  /** Defaults to "article" for speeches, "website" elsewhere. */
  type?: 'website' | 'article';
  /** e.g. "noindex, nofollow" for workspaces that must stay private. */
  robots?: string;
  /** One or more JSON-LD blocks. */
  jsonLd?: Record<string, unknown>[];
}
