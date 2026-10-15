import type { MetadataRoute } from 'next';
import { buildSitemapUrls } from '@/data/routes';

/**
 * sitemap.xml, from the route registry.
 *
 * 2.x generated this with `scripts/sitemap/run.mjs` after the bundle was
 * built, then committed a copy into `public/`. It is a route now: the same
 * registry, read at build time, served by the framework — so the sitemap
 * cannot be one deploy behind the site, which is exactly what a committed
 * copy eventually becomes.
 *
 * 56 URLs: every speech, every guide and every section page. The registry
 * itself decides, and it is the same list `generateStaticParams` uses to
 * decide which pages exist — one source of truth for "what is on this site",
 * now used by the router as well as by crawlers.
 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return buildSitemapUrls().map(({ loc, priority, changefreq }) => ({
    url: loc,
    lastModified,
    changeFrequency: changefreq as 'daily' | 'weekly' | 'monthly',
    priority,
  }));
}
