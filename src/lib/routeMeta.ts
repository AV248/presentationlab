import type { Metadata } from 'next';
import { pageMetaFor } from '@/data/routes';

/**
 * Metadata for a static route, read from the route registry.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 * 2.x prerendered 57 pages with a jsdom pass, and each one carried its own
 * title, description, canonical, social image and structured data — which is
 * precisely what made every speech and every guide rank as its own page rather
 * than as a duplicate of the home page.
 *
 * 3.0 gets the same values from the same registry, without the second build
 * step: `/read/[id]` and `/topics/[slug]` declare them in `generateMetadata`,
 * and every static section page declares them here, in one line.
 *
 * The alternative — a client hook that rewrites the tags after the page has
 * loaded — is what a crawler *cannot* rely on, so it is only used for the
 * screens whose content depends on who is looking at them.
 */
export function routeMetadata(path: string): Metadata {
  const meta = pageMetaFor(path);
  if (!meta) return {};

  const card = meta.card ? `/cards/${meta.card}.png` : null;
  const title = meta.title;

  return {
    // `absolute`: registry titles already carry the site name.
    title: { absolute: title },
    description: meta.description,
    alternates: { canonical: path },
    openGraph: {
      type: meta.type === 'article' ? 'article' : 'website',
      title,
      description: meta.description,
      url: path,
      ...(card ? { images: [{ url: card, width: 1200, height: 630 }] } : {}),
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: meta.description,
      ...(card ? { images: [card] } : {}),
    },
    // The claim screen and the sign-in callback are registered with a null
    // priority precisely so nothing ever links to them as content.
    ...(meta.priority === 0 ? { robots: { index: false, follow: false } } : {}),
  };
}

/** The JSON-LD blocks the registry defines for one path, if any. */
export function routeJsonLd(path: string): Record<string, unknown>[] {
  return pageMetaFor(path)?.jsonLd ?? [];
}
