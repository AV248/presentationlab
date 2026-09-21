/**
 * Sitemap — writes dist/sitemap.xml from the prerendered route registry.
 * The 404 page is the only prerendered route that is excluded (56 URLs).
 *
 *   node scripts/sitemap/run.mjs    (after `vite build`)
 */
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadPageRegistry } from '../lib/load-pages.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');

const { buildSitemapUrls } = await loadPageRegistry(root);
const urls = buildSitemapUrls();

if (urls.length !== 56) {
  console.error(`Expected a 56-URL sitemap, registry returned ${urls.length}.`);
  process.exit(1);
}

const lastmod = new Date().toISOString().slice(0, 10);
const body = urls
  .map(
    ({ loc, priority, changefreq }) => `  <url>
    <loc>${loc}</loc>
    <lastmod>${lastmod}</lastmod>
    <changefreq>${changefreq}</changefreq>
    <priority>${priority.toFixed(2).replace(/0$/, '')}</priority>
  </url>`,
  )
  .join('\n');

const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${body}
</urlset>
`;

await writeFile(resolve(root, 'dist', 'sitemap.xml'), xml);
// Also land it in public/: the file is then committed to git (the site is
// sometimes updated by uploading files through the GitHub web UI) and is
// automatically included by every fresh `vite build`.
await writeFile(resolve(root, 'public', 'sitemap.xml'), xml);
console.log(`${urls.length} sitemap URLs written to dist/sitemap.xml`);
