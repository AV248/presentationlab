/**
 * Which backends this build can reach.
 *
 * The app is written against one seam — `loadBackend()` — and this file decides
 * which of the browser-facing services are configured. Supabase owns profiles,
 * usernames and account relationships; the public presentation library is
 * authoritative in Turso; Convex is live-only and optional.
 *
 * The Supabase pair are `VITE_` variables because the browser uses the public
 * anon key under row-level security. The Turso token is **not** here — it lives
 * on the server, used by `/api/library` and `/api/presentations`, so it never
 * reaches a visitor.
 */

import { env } from '../../lib/env';

const clean = (value: string | undefined) => (value ?? '').trim();

export const SUPABASE_URL = clean(env.VITE_SUPABASE_URL);
export const SUPABASE_ANON_KEY = clean(env.VITE_SUPABASE_ANON_KEY);
export const CONVEX_URL = clean(env.VITE_CONVEX_URL);

/** Supabase account/profile services are reachable. The library is checked via /api/library. */
export const BACKEND_ENABLED = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/** The live layer is reachable (optional: nothing durable depends on it). */
export const LIVE_ENABLED = Boolean(CONVEX_URL);

/** The same-origin API for Turso-backed presentation reads. */
export const LIBRARY_ENDPOINT = '/api/library';

/**
 * Which Supabase project this build talks to, as a readable identifier.
 * `https://abcdefgh.supabase.co` → `abcdefgh`. Public by nature (the browser
 * already holds the URL), useful in the diagnostics panel.
 */
export const BACKEND_PROJECT = (() => {
  if (!SUPABASE_URL) return null;
  try {
    return new URL(SUPABASE_URL).host.split('.')[0] || null;
  } catch {
    return null;
  }
})();

/** Which databases this build is actually using, for the diagnostics panel. */
export function backendSummary(): { name: string; configured: boolean; job: string }[] {
  return [
    { name: 'Supabase', configured: BACKEND_ENABLED, job: 'profiles, usernames and account-backed data' },
    { name: 'Turso', configured: true, job: 'authoritative published presentations, reads and search' },
    { name: 'Convex', configured: LIVE_ENABLED, job: 'the live layer — presence and activity' },
  ];
}

if (env.DEV && !BACKEND_ENABLED) {
  console.info(
    '[pb] No Supabase configuration — profiles and account-backed features are unavailable. ' +
      'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to enable them.'
  );
}
