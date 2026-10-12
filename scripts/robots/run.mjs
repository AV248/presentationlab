/**
 * robots.txt — generated from the configured canonical origin.
 *
 * A hand-written robots.txt with a hardcoded Sitemap: line is a quiet SEO
 * bug: move the site to a new domain, update every canonical tag, and the
 * crawler is still being pointed at the old one. Since VITE_SITE_URL is
 * already the single source of truth for canonicals and structured data, this
 * generates the file from it.
 *
 *   node scripts/robots/run.mjs    (after `vite build`)
 */
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadSiteMeta } from '../lib/load-pages.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');

const { SITE_URL } = await loadSiteMeta(root);

if (!SITE_URL) {
  console.error('Could not resolve SITE_URL from src/lib/seo.ts.');
  process.exit(1);
}

const body = `# Presentation Buddy — ${SITE_URL}
#
# Everything here is public and meant to be indexed. The only closed door is
# the private admin workspace, which is also served with a noindex tag.

User-agent: *
Allow: /
Disallow: /admin
Disallow: /admin/

# Filtered views produce no unique content — they only re-sort a list that is
# already fully crawlable — so they are kept out to avoid diluting the library
# page. ?q= is the exception: it is the target of the sitelinks search box
# declared in the home page's structured data, so it must stay reachable.
Allow: /?q=
Disallow: /*?utm_
Disallow: /*&
Disallow: /*?sort=
Disallow: /*?kind=
Disallow: /*?source=
Disallow: /*?category=

# Assets crawlers need in order to render and judge the page. Some bots
# default to skipping these, and a page that renders without its CSS looks
# broken to a quality classifier.
Allow: /assets/
Allow: /icons/
Allow: /cards/
Allow: /*.css$
Allow: /*.js$
Allow: /*.svg$
Allow: /*.png$
Allow: /*.webmanifest$

# The AI crawlers are allowed deliberately: being quoted by an assistant is
# how a lot of people will find this site.
User-agent: GPTBot
Allow: /

User-agent: OAI-SearchBot
Allow: /

User-agent: ChatGPT-User
Allow: /

User-agent: PerplexityBot
Allow: /

User-agent: ClaudeBot
Allow: /

User-agent: Google-Extended
Allow: /

# Aggressive SEO scrapers that cost bandwidth and return nothing.
User-agent: AhrefsBot
Crawl-delay: 10

User-agent: SemrushBot
Crawl-delay: 10

User-agent: MJ12bot
Disallow: /

Sitemap: ${SITE_URL}/sitemap.xml
`;

await writeFile(resolve(root, 'dist', 'robots.txt'), body);
// Also land it in public/: the file is then committed to git (the site is
// sometimes updated by uploading files through the GitHub web UI) and is
// automatically included by every fresh `vite build`.
await writeFile(resolve(root, 'public', 'robots.txt'), body);

console.log(`robots.txt written for ${SITE_URL}`);
