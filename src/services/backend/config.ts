/**
 * Which backends this build can reach.
 *
 * The app is written against one seam — `loadBackend()` — and this file decides
 * which of the three databases are actually available in the running build. All
 * three are optional: with none of them configured the site is fully local, as
 * it has always been when the cloud is absent.
 *
 *   Supabase  the truth          (durable records, row-level security)
 *   Turso     the reading room   (published library + search, server-side only)
 *   Convex    the live layer     (presence, activity, ticking counters)
 *
 * The Supabase pair are `VITE_` variables because the browser talks to Postgres
 * directly under row-level security. The Turso token is **not** here — it lives
 * on the server, used by `/api/library`, so it never reaches a visitor.
 */

const env = (import.meta.env ?? {}) as ImportMetaEnv & Record<string, string | undefined>;

const clean = (value: string | undefined) => (value ?? '').trim();

export const SUPABASE_URL = clean(env.VITE_SUPABASE_URL);
export const SUPABASE_ANON_KEY = clean(env.VITE_SUPABASE_ANON_KEY);
export const CONVEX_URL = clean(env.VITE_CONVEX_URL);

/** Durable records are reachable. */
export const BACKEND_ENABLED = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);

/** The live layer is reachable (optional: nothing durable depends on it). */
export const LIVE_ENABLED = Boolean(CONVEX_URL);

/** The reading room is reachable — always true; /api/library says if it is up. */
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
    { name: 'Supabase', configured: BACKEND_ENABLED, job: 'the truth — profiles, handles, speeches, ads' },
    { name: 'Turso', configured: true, job: 'the reading room — published writing and search' },
    { name: 'Convex', configured: LIVE_ENABLED, job: 'the live layer — presence and activity' },
  ];
}

if (import.meta.env?.DEV && !BACKEND_ENABLED) {
  console.info(
    '[pb] No Supabase configuration — records stay on this device. ' +
      'Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY to use the shared library.',
  );
}
