# Next.js runtime (3.1)

Presentation Buddy 3.1 runs on the **Next.js App Router**. The application is a
Node.js server, not a Vite static export. Vercel should detect Next.js from
`package.json`; for another host, build with `npm run build` and run
`npm run start` on Node 26.13.1 (the exact version pinned by `.nvmrc` and `package.json`).

## Framework ownership

- `app/` contains App Router pages, metadata, sitemap/robots handlers and API
  route handlers.
- `src/screens/` holds the product screens. The existing route bridge in
  `src/lib/router.tsx` translates their navigation into Next.js navigation.
- `next.config.ts` owns redirects, CSP/security headers, cache headers and the
  public environment-variable allowlist.
- `public/` contains static assets, the PWA manifest and service worker.
- `npm run build` generates share cards, then runs `next build`. Use the
  framework-managed `.next/` output; do not upload a `dist/` directory or
  configure a static-export host.

The public variables keep their established `VITE_` names. `next.config.ts`
passes only the five public identifiers/URLs through at build time. Never add a
secret to that allowlist. Server code reads the same `VITE_` names through
`src/server/env.ts` bracket access so the build-time substitution cannot pin a
server process to a different database than its runtime environment.

## Data and request ownership

| Concern | Owner |
|---|---|
| Sign-in, session and identity subject | Clerk |
| Profiles, usernames, account/social/badge/admin records | Supabase / Postgres |
| Published presentation bodies, version history, moderation, provenance, views and FTS | Turso |
| Optional bounded safety snapshots | Convex |
| Drafts before Share | This device |

Publishing is Turso-native: Clerk verifies the session, Supabase resolves the
author profile, and the Turso transaction records the canonical presentation
and its first version. Changed edits append a version with the current-row
update. Supabase is not a full-text or presentation-body fallback. Drafts stay
local until Share.

Convex is optional and safety-only. Turso marks a global cohort capped at
`floor(published presentations / 100)` personal works; each stored body slice
is capped at 1% of that source body's UTF-8 bytes. The public Convex action
accepts an id and Clerk session, fetches a bounded owner-checked slice from the
canonical app endpoint, and writes only through an internal mutation. Static
checks and local tests cover the intended boundary; no deployed Convex/direct-
caller test has verified the production trust boundary. The reader never
queries Convex.

Current live source search is distinct from the requested scheduled,
admin-triggered and curator-reviewed arrivals pipeline. That prepared ingestion
workflow remains a tracked gap; deploying this Next.js app does not make a
scheduler or review queue exist.

## Environment variables

The nine Vercel variable names are frozen. See [ENV.md](ENV.md) for the complete
list and correct visibility. `VITE_CONVEX_URL` is optional; it is not a live
presence or activity feature. The two optional local import values
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` must not be added to Vercel.

## Build, run and verify

```bash
npm ci
npm run typecheck
npm run verify
npm run build
npm run start
```

`npm run verify:all` runs the local verification suite, production build and
served-route checks. It does not configure or validate remote provider
accounts, a production Convex deployment, scheduled arrivals, or browser motion.

The build output includes Next.js route metadata and runtime chunks. Serve it
through `next start` or a compatible Next.js host; do not copy only static HTML
and expect API routes, Turso writes or Clerk verification to work.

## Migration history

The move from the earlier Vite application retained the existing public
variable names, product routes and account links. Current data ownership is
specified in [ARCHITECTURE.md](ARCHITECTURE.md), and the remaining product gaps
are tracked in [CANONICAL-REBUILD-GAP-ANALYSIS.md](CANONICAL-REBUILD-GAP-ANALYSIS.md).
