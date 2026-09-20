/**
 * Prerender — turns the built SPA into a set of fully-rendered static HTML
 * files, one per indexable route, each with its own title, description,
 * canonical, social tags and JSON-LD baked in. This is what lets every
 * speech, guide and section rank as its own page.
 *
 *   node scripts/prerender/run.mjs
 *
 * Expects dist/ to exist (run after `vite build`).
 */
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { loadPageRegistry } from '../lib/load-pages.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');
const dist = resolve(root, 'dist');

/* ---------------- jsdom environment (same shims as the smoke test) -------- */

const dom = new JSDOM('<!doctype html><html lang="en"><head></head><body><div id="root"></div></body></html>', {
  url: 'https://presentationbuddy.aavrit.dedyn.io/',
  pretendToBeVisual: true,
});

const { window } = dom;
window.matchMedia = (query) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener() {},
  removeListener() {},
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent: () => false,
});
window.scrollTo = () => {};
window.requestIdleCallback = (cb) => setTimeout(cb, 0);
window.cancelIdleCallback = (id) => clearTimeout(id);
window.speechSynthesis = { cancel() {}, speak() {} };
window.fetch = () => Promise.reject(new Error('offline during prerender'));

globalThis.window = window;
globalThis.document = window.document;
Object.defineProperty(globalThis, 'navigator', { value: window.navigator, configurable: true });
globalThis.HTMLElement = window.HTMLElement;
globalThis.Element = window.Element;
globalThis.Node = window.Node;
globalThis.Blob = window.Blob;
globalThis.CSS = window.CSS;
globalThis.getComputedStyle = window.getComputedStyle;
globalThis.requestAnimationFrame = window.requestAnimationFrame.bind(window);
globalThis.cancelAnimationFrame = window.cancelAnimationFrame.bind(window);
globalThis.localStorage = window.localStorage;
globalThis.sessionStorage = window.sessionStorage;
globalThis.MutationObserver = window.MutationObserver;
globalThis.DocumentFragment = window.DocumentFragment;
globalThis.IntersectionObserver = class {
  observe() {}
  unobserve() {}
  disconnect() {}
};

/* ---------------- bundle the eager entry ---------------------------------- */

const outdir = resolve(here, '.out');
await mkdir(outdir, { recursive: true });
const outfile = resolve(outdir, 'entry.mjs');

await build({
  entryPoints: [resolve(here, 'entry.tsx')],
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  jsx: 'automatic',
  outfile,
  loader: { '.css': 'empty' },
  define: {
    'import.meta.env': JSON.stringify({
      PROD: true,
      DEV: false,
      BASE_URL: '/',
      VITE_FIREBASE_API_KEY: '',
      VITE_FIREBASE_PROJECT_ID: '',
    }),
  },
  logLevel: 'error',
});

const { renderRoute } = await import(outfile);
const { buildPrerenderRoutes } = await loadPageRegistry(root);
const pages = buildPrerenderRoutes();

/* ---------------- html template surgery ----------------------------------- */

const template = await readFile(resolve(dist, 'index.html'), 'utf8');

const esc = (value) =>
  String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

function setMetaContent(html, attr, key, content) {
  const re = new RegExp(`(<meta\\s+${attr}="${key}"\\s+content=")[^"]*("\\s*/?>)`);
  return re.test(html) ? html.replace(re, `$1${esc(content)}$2`) : html;
}

function buildHead(page) {
  const url = `https://presentationbuddy.aavrit.dedyn.io${page.path === '/404' ? '/404' : page.path}`;
  const card = page.card
    ? `https://presentationbuddy.aavrit.dedyn.io/cards/${page.card}.png`
    : 'https://presentationbuddy.aavrit.dedyn.io/cards/presentation-buddy.png';
  const robots =
    page.group === '404' ? 'noindex, follow' : 'index, follow, max-image-preview:large';

  let html = template;
  html = html.replace(/<title>[^<]*<\/title>/, `<title>${esc(page.title)}</title>`);
  html = setMetaContent(html, 'name', 'description', page.description);
  html = setMetaContent(html, 'name', 'robots', robots);
  html = setMetaContent(html, 'property', 'og:title', page.title);
  html = setMetaContent(html, 'property', 'og:description', page.description);
  html = setMetaContent(html, 'property', 'og:type', page.type);
  html = setMetaContent(html, 'property', 'og:url', url);
  html = setMetaContent(html, 'property', 'og:image', card);
  html = setMetaContent(html, 'name', 'twitter:title', page.title);
  html = setMetaContent(html, 'name', 'twitter:description', page.description);
  html = setMetaContent(html, 'name', 'twitter:image', card);
  html = html.replace(
    /<link rel="canonical" href="[^"]*" \/>/,
    `<link rel="canonical" href="${esc(url)}" />`,
  );

  if (page.jsonLd?.length) {
    const blocks = page.jsonLd
      .map(
        (block) =>
          `<script type="application/ld+json">${JSON.stringify(block).replace(/</g, '\\u003c')}</script>`,
      )
      .join('\n    ');
    html = html.replace('</head>', `    ${blocks}\n  </head>`);
  }
  return html;
}

function applyHtmlAttrs(html, attrs) {
  const extra = Object.entries(attrs)
    .map(([name, value]) => `${name}="${esc(value)}"`)
    .join(' ');
  // Rebuild the <html> tag wholesale: the template tag already carries a boot
  // style attribute, and appending a second style= produces invalid HTML.
  return html.replace(/<html\s+[^>]*>/, `<html lang="en"${extra ? ` ${extra}` : ''}>`);
}

/* ---------------- render + write ------------------------------------------ */

const failures = [];
let written = 0;

for (const page of pages) {
  try {
    const routePath = page.path === '/404' ? '/does-not-exist' : page.path;
    const { html, htmlAttrs } = await renderRoute(routePath);
    if (html.length < 300) throw new Error(`capture too small (${html.length} bytes)`);

    let doc = buildHead(page);
    doc = applyHtmlAttrs(doc, htmlAttrs);
    doc = doc.replace('<div id="root"></div>', `<div id="root">${html}</div>`);

    const target =
      page.path === '/' ? resolve(dist, 'index.html')
      : page.path === '/404' ? resolve(dist, '404.html')
      : resolve(dist, `.${page.path}/index.html`);
    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, doc);
    written += 1;
    process.stdout.write(`  prerendered ${page.path === '/404' ? '/404 (404.html)' : page.path}\n`);
  } catch (error) {
    failures.push(`${page.path}: ${(error?.message ?? error).slice?.(0, 200) ?? error}`);
  }
}

await rm(outdir, { recursive: true, force: true });

if (failures.length) {
  console.error(`\n${failures.length} page(s) failed to prerender:`);
  failures.slice(0, 8).forEach((failure) => console.error(`  ${failure}`));
  process.exit(1);
}
console.log(`${written} prerendered pages.`);
