/**
 * The bridge between the names Vercel already holds and the code that reads
 * them.
 *
 * ── Why this file is boring on purpose ──────────────────────────────────────
 * The project moved from Vite to Next.js in 3.0, and the environment variable
 * names did **not** change: `VITE_SUPABASE_URL` is still `VITE_SUPABASE_URL`.
 * Renaming them in production is a manual step that fails quietly — paste the
 * new name in the wrong place and the site deploys with no database at all.
 *
 * So `next.config.ts` reads the five public names once, at build time, and
 * inlines them under their own names. Everything below is then a literal
 * `process.env.VITE_…` — and a literal is what the inliner requires. A loop
 * over `process.env`, or a destructure of it, produces `undefined` in the
 * browser, exactly as it did under Vite.
 *
 * ── The rule that has not changed ───────────────────────────────────────────
 * Anything in here is public: it ends up in the JavaScript every visitor
 * downloads. These five are identifiers, not secrets. The Supabase anon key
 * unlocks nothing without a signed-in person, because the row policies in
 * `supabase/schema.sql` decide what that person may read or write. Anything
 * genuinely secret — the Clerk secret key, the Turso token — has no prefix,
 * lives only on the server, and is never imported into this module.
 */

export const env = {
  /**
   * Keep each public read as a literal member access. Next replaces these
   * expressions at build time; aliasing `process.env` first leaves an empty
   * object in browser bundles and makes valid Vercel values look missing.
   */
  VITE_SITE_URL: process.env.VITE_SITE_URL,
  VITE_CLERK_PUBLISHABLE_KEY: process.env.VITE_CLERK_PUBLISHABLE_KEY,
  VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL,
  VITE_SUPABASE_ANON_KEY: process.env.VITE_SUPABASE_ANON_KEY,
  VITE_CONVEX_URL: process.env.VITE_CONVEX_URL,

  /**
   * Vite's own two flags, kept because a lot of diagnostics are written
   * against them ("in development, say why"). `next dev` sets
   * NODE_ENV=development; `next build` sets production.
   */
  DEV: process.env.NODE_ENV !== 'production',
  PROD: process.env.NODE_ENV === 'production',
  /** The app is always served from the root of its own domain. */
  BASE_URL: '/',
} as const;

/** Convenience for the two or three places that want one literal value. */
export const siteUrl = (env.VITE_SITE_URL ?? '').trim().replace(/\/+$/, '');
