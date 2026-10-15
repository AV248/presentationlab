/* Presentation Buddy — offline shell.
 *
 * ── What changed in 3.1 ─────────────────────────────────────────────────────
 * The asset paths did. 2.x served hashed files from `/assets/…`; the framework
 * serves them from `/_next/static/…`, and it serves HTML from the server rather
 * than from prerendered files on disk. A worker that keeps looking for the old
 * shape is worse than no worker: it answers with the cached page it has and the
 * site looks like it never updated.
 *
 * So the strategies are the same and the paths are the real ones:
 *
 *   • navigation          → network first, fall back to the cached page,
 *                           then to the offline notice
 *   • /_next/static/…     → cache first, forever (the filename is the version)
 *   • other assets        → cache first, populated on miss
 *   • /api/…              → never touched, never cached
 *
 * Everything is failure tolerant: a missing cache never breaks the app, and a
 * fetch handler never resolves to undefined — which reaches the page as a
 * network error rather than as a graceful miss.
 */
const VERSION = 'pb-v5';
const PRECACHE = ['/', '/offline.html', '/manifest.webmanifest', '/favicon.svg'];

/* Never cached: these must always reflect the server. */
const NEVER_CACHE = ['/sitemap.xml', '/robots.txt', '/sw.js', '/manifest.webmanifest'];

/**
 * Should the worker keep out of this request altogether?
 *
 * `/api/*` is deliberately here. Caching an API answer would be wrong, and
 * *intercepting* one is subtler: when the network request failed, an earlier
 * version of this worker synthesised a bodyless `504 (Offline)`, which reads as
 * a server fault and sent an afternoon down the wrong path. Letting API calls
 * go straight to the network gives them the browser's real error instead.
 */
function isUncacheable(url) {
  return (
    url.pathname.startsWith('/api/') ||
    NEVER_CACHE.includes(url.pathname) ||
    url.origin !== self.location.origin
  );
}

/** Build assets are content-addressed: the name changes when the bytes do. */
function isImmutable(url) {
  return url.pathname.startsWith('/_next/static/') || url.pathname.startsWith('/cards/');
}

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(VERSION)
      .then((cache) => cache.addAll(PRECACHE))
      .catch(() => undefined)
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== VERSION).map((key) => caches.delete(key))))
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  let url;
  try {
    url = new URL(request.url);
  } catch {
    return;
  }
  if (isUncacheable(url)) return;

  /* ── a page ─────────────────────────────────────────────────────────────
   * Network first, on purpose. This is a site people publish to; showing a
   * visitor yesterday's copy of their own page because the worker preferred
   * the cache is the failure mode that matters here.
   */
  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response && response.ok) {
            const copy = response.clone();
            caches.open(VERSION).then((cache) => cache.put(request, copy)).catch(() => undefined);
          }
          return response;
        })
        .catch(async () => {
          const cached = await caches.match(request, { ignoreSearch: true });
          if (cached) return cached;
          const offline = await caches.match('/offline.html');
          if (offline) return offline;
          return new Response(
            '<!doctype html><meta charset="utf-8"><title>Offline</title><p style="font:1rem Georgia,serif;padding:40px">Presentation Buddy needs a connection to open this page. Your own drafts are saved on this device and are still here.</p>',
            { status: 200, headers: { 'Content-Type': 'text/html; charset=utf-8' } },
          );
        }),
    );
    return;
  }

  /* ── an asset ───────────────────────────────────────────────────────────
   * Cache first: for a hashed filename that is always correct, and it is what
   * makes a second visit instant.
   */
  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (
            response &&
            response.ok &&
            (response.type === 'basic' || response.type === 'default') &&
            (isImmutable(url) || url.pathname.startsWith('/icons/') || url.pathname.startsWith('/assets/'))
          ) {
            const copy = response.clone();
            caches.open(VERSION).then((cache) => cache.put(request, copy)).catch(() => undefined);
          }
          return response;
        })
        .catch(async () => {
          const cached2 = await caches.match(request, { ignoreSearch: true });
          if (cached2) return cached2;
          // A stylesheet or an image that cannot be fetched is a cosmetic
          // loss; answering with the real network error would be a console
          // full of noise for something already handled by the layout.
          return new Response('', { status: 504, statusText: 'Offline' });
        });
    }),
  );
});
