'use client';

/**
 * The live half of the SEO pair.
 *
 * `src/lib/seo.ts` holds the constants and is read on the server; this file
 * holds the hook that writes tags into the document as a visitor moves around
 * the app. They are separate because the server side may not import a hook —
 * and because the *pages that can be known at build time* no longer need this
 * at all: `/read/[id]` and `/topics/[slug]` now declare their title,
 * description, canonical and structured data in `generateMetadata`, which is
 * better in every way that matters to a crawler.
 *
 * What still uses it: the screens whose content depends on who is looking
 * (a handle page, the admin workspace, the reader's own library) and the
 * workspace screens that are simply not in the route registry.
 */

import { useEffect } from 'react';
import {
  DEFAULT_DESCRIPTION,
  DEFAULT_OG_IMAGE,
  SITE_NAME,
  absoluteUrl,
  type PageMetaOptions,
} from './seo';

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
