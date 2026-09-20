import { useEffect } from 'react';

/**
 * Site-wide SEO constants and the hook every page uses to declare its own
 * title, description, canonical URL, social cards and structured data.
 *
 * The build pipeline prerenders every indexable route into a static HTML
 * file with these same values baked in; this hook keeps the tags truthful
 * as the visitor moves around the live app.
 */

export const SITE_NAME = 'Presentation Buddy';
export const SITE_URL = 'https://presentationbuddy.aavrit.dedyn.io';
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

function upsertMeta(selector: string, create: () => HTMLMetaElement): HTMLMetaElement {
  let node = document.head.querySelector<HTMLMetaElement>(selector);
  if (!node) {
    node = create();
    document.head.appendChild(node);
  }
  return node;
}

function setMetaProperty(property: string, content: string) {
  upsertMeta(`meta[property="${property}"]`, () => {
    const meta = document.createElement('meta');
    meta.setAttribute('property', property);
    return meta;
  }).setAttribute('content', content);
}

function setMetaName(name: string, content: string) {
  upsertMeta(`meta[name="${name}"]`, () => {
    const meta = document.createElement('meta');
    meta.setAttribute('name', name);
    return meta;
  }).setAttribute('content', content);
}

function setCanonical(href: string) {
  let link = document.head.querySelector<HTMLLinkElement>('link[rel="canonical"]');
  if (!link) {
    link = document.createElement('link');
    link.rel = 'canonical';
    document.head.appendChild(link);
  }
  link.href = href;
}

const JSONLD_ID = 'pb-jsonld';

function setJsonLd(blocks: Record<string, unknown>[]) {
  document.head.querySelectorAll(`script[data-${JSONLD_ID}]`).forEach((node) => node.remove());
  for (const block of blocks) {
    const script = document.createElement('script');
    script.type = 'application/ld+json';
    script.setAttribute(`data-${JSONLD_ID}`, 'true');
    script.textContent = JSON.stringify(block).replace(/</g, '\\u003c');
    document.head.appendChild(script);
  }
}

const DEFAULTS: Required<Omit<PageMetaOptions, 'jsonLd' | 'canonical'>> = {
  description: DEFAULT_DESCRIPTION,
  image: DEFAULT_OG_IMAGE,
  type: 'website',
  robots: 'index, follow, max-image-preview:large',
};

/**
 * Declares everything a search engine or a social crawler needs to know
 * about the page being viewed. Call once per page, near the top.
 */
export function usePageMeta(title: string, options: PageMetaOptions = {}) {
  const { description, canonical, image, type, robots, jsonLd } = options;
  const fullTitle = title.includes(SITE_NAME) ? title : `${title} · ${SITE_NAME}`;

  useEffect(() => {
    const url = canonical ?? absoluteUrl(window.location.pathname);
    document.title = fullTitle;
    setMetaName('description', description ?? DEFAULTS.description);
    setMetaName('robots', robots ?? DEFAULTS.robots);
    setCanonical(url);

    setMetaProperty('og:site_name', SITE_NAME);
    setMetaProperty('og:title', fullTitle);
    setMetaProperty('og:description', description ?? DEFAULTS.description);
    setMetaProperty('og:type', type ?? DEFAULTS.type);
    setMetaProperty('og:url', url);
    setMetaProperty('og:image', image ?? DEFAULTS.image);
    setMetaProperty('og:locale', 'en_US');

    setMetaName('twitter:card', 'summary_large_image');
    setMetaName('twitter:title', fullTitle);
    setMetaName('twitter:description', description ?? DEFAULTS.description);
    setMetaName('twitter:image', image ?? DEFAULTS.image);

    setJsonLd(jsonLd ?? []);

    return () => setJsonLd([]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fullTitle, description, canonical, image, type, robots]);
}
