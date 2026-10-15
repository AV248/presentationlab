import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/seo';

/**
 * robots.txt, generated from the same origin the rest of the site uses.
 *
 * 2.x wrote this file with a build script (`scripts/robots/run.mjs`) after
 * `vite build`; the framework serves it as a route now, which means it exists
 * in `next dev` too and can never be stale with respect to `SITE_URL`.
 *
 * The policy, unchanged, and the reasons for it:
 *
 *   • Everything is public and meant to be indexed. The only closed door is
 *     the private admin workspace, which is *also* served with a noindex tag —
 *     belt and braces, because a robots.txt is a request, not an access rule.
 *   • Filtered views produce no unique content, so they are kept out to avoid
 *     diluting the library page. `?q=` is the deliberate exception: it is the
 *     target of the sitelinks search box declared in the home page's
 *     structured data, so it has to stay reachable.
 *   • Assets are allowed explicitly. Some crawlers skip CSS and JS by default,
 *     and a page rendered without its stylesheet looks broken to a quality
 *     classifier.
 *   • The AI crawlers are allowed on purpose: being quoted by an assistant is
 *     how a lot of people will find this site.
 *   • AhrefsBot and SemrushBot cost bandwidth and return nothing, so they are
 *     slowed rather than banned; MJ12bot is banned outright.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        // `/_next/static/` needs no rule of its own: it is covered by `Allow: /`.
      allow: ['/', '/?q=', '/icons/', '/cards/'],
        disallow: [
          '/admin',
          '/admin/',
          '/*?utm_',
          '/*&',
          '/*?sort=',
          '/*?kind=',
          '/*?source=',
          '/*?category=',
        ],
      },
      { userAgent: ['GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'PerplexityBot', 'ClaudeBot', 'Google-Extended'], allow: '/' },
      { userAgent: 'AhrefsBot', crawlDelay: 10 },
      { userAgent: 'SemrushBot', crawlDelay: 10 },
      { userAgent: 'MJ12bot', disallow: '/' },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL,
  };
}
