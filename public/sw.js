/* Presentation Buddy — offline shell.
 *
 * Strategy:
 *   • navigation          → network first, fall back to the cached page,
 *                           then to the app shell
 *   • same-origin assets  → cache first, populate on miss
 *   • hashed build assets → cached forever (the filename changes instead)
 *
 * Everything is failure tolerant: a missing cache never breaks the app, and
 * a fetch handler never resolves to undefined (which would surface to the
 * page as a network error rather than as a graceful miss).
 */
const VERSION = 'pb-v4';
const SHELL = '/index.html';
const PRECACHE = [SHELL, '/manifest.webmanifest', '/favicon.svg'];

/* Never cache these: they must always reflect the server. */
const NEVER_CACHE = ['/sitemap.xml', '/robots.txt', '/sw.js'];

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

/* Let the page tell a waiting worker to take over immediately. */
self.addEventListener('message', (event) => {
  if (event.data === 'pb-skip-waiting') self.skipWaiting();
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
  if (url.origin !== self.location.origin) return;
  if (NEVER_CACHE.includes(url.pathname)) return;

  if (request.mode === 'navigate') {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(VERSION).then((cache) => cache.put(request, copy)).catch(() => undefined);
          }
          return response;
        })
        .catch(() =>
          caches
            .match(request)
            .then((cached) => cached || caches.match(SHELL))
            .then(
              (cached) =>
                cached ||
                new Response('<h1>Offline</h1><p>Presentation Buddy is not cached yet.</p>', {
                  status: 503,
                  headers: { 'Content-Type': 'text/html; charset=utf-8' },
                }),
            ),
        ),
    );
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      if (cached) return cached;
      return fetch(request)
        .then((response) => {
          if (response.ok && response.type === 'basic') {
            const copy = response.clone();
            caches.open(VERSION).then((cache) => cache.put(request, copy)).catch(() => undefined);
          }
          return response;
        })
        .catch(
          () =>
            // A miss with no network. Resolve with a real Response so the
            // page sees a clean failure instead of an undefined handler.
            new Response('', { status: 504, statusText: 'Offline' }),
        );
    }),
  );
});
