/**
 * Runs the smoke entry inside jsdom.
 *
 *   npm run smoke
 *
 * Exits non-zero if React logged an error or a route rendered empty.
 */
import { JSDOM } from 'jsdom';
import { build } from 'esbuild';
import { rm, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');

const dom = new JSDOM('<!doctype html><html><head></head><body><div id="root"></div></body></html>', {
  url: 'http://localhost:5173/',
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
globalThis.MutationObserver = window.MutationObserver;
globalThis.DocumentFragment = window.DocumentFragment;

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
      PROD: false,
      DEV: true,
      BASE_URL: '/',
      VITE_FIREBASE_API_KEY: '',
      VITE_FIREBASE_PROJECT_ID: '',
    }),
  },
  logLevel: 'error',
});

await import(outfile);

await new Promise((resolve) => {
  const check = () => {
    if (globalThis.__SMOKE_ERRORS__ !== undefined) resolve();
    else setTimeout(check, 100);
  };
  check();
});

const errors = globalThis.__SMOKE_ERRORS__ ?? [];
const failures = globalThis.__SMOKE_FAILURES__ ?? 0;
await rm(outdir, { recursive: true, force: true });

if (failures > 0) {
  console.error(`\n${failures} check(s) failed.`);
  process.exit(1);
}
if (errors.length) {
  console.error('\nConsole errors:');
  errors.slice(0, 5).forEach((error) => console.error(`  ${error}`));
  process.exit(1);
}
console.log('\nSmoke test passed.');
