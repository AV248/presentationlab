# 3.0 — the move to Next.js

Version 3.1 (beta) runs on the **Next.js App Router**. Everything that made the
site work — Clerk for identity, Postgres for the truth, Turso for the reading
room, Convex for the live layer — is unchanged, and so are the environment
variable names. This file records what moved, what did not, and what has to
change in Vercel.

---

## What did not change

| | |
| --- | --- |
| **Environment variables** | The same nine, under the same names. `next.config.ts` reads the five public ones at build time and inlines them under their `VITE_` names, so `process.env.VITE_SUPABASE_URL` is valid in browser code even though Next.js would normally only inline `NEXT_PUBLIC_*`. Renaming a production variable is a manual step that fails silently; it was not worth the risk. |
| **Identity** | Clerk, and only Clerk. The session token still goes straight to Postgres (third-party auth) and to Convex (the `convex` JWT template). No middleware, no second auth path. |
| **The three databases** | Supabase is the truth, Turso the reading room, Convex the live layer. One writer per entity. |
| **The screens** | All of them, unchanged: the same components, the same stylesheet, the same theme engine. |

## What moved

| 2.x | 3.1 |
| --- | --- |
| `index.html` | `app/layout.tsx` — the document, the metadata, the structured data |
| `src/App.tsx` + `AppRoutes.tsx` | `app/providers.tsx` + one `page.tsx` per route |
| `src/pages/*` | `src/screens/*` (Next.js reserves `pages/` for its own router) |
| `api/*.ts` (Node `req`/`res`) | `app/api/*/route.ts` (`Request` → `Response`) |
| `scripts/prerender` | `generateStaticParams` + `generateMetadata` |
| `scripts/sitemap`, `scripts/robots` | `app/sitemap.ts`, `app/robots.ts` |
| `scripts/smoke` (jsdom) | `next build` — it renders every route, and fails if one throws |
| `scripts/check-api-trace.mjs` | Retired: the Next.js compiler traces dependencies itself |
| `vercel.json` | `next.config.ts` (redirects, headers, the CSP) |
| `src/lib/seo.ts` (constants *and* a hook) | Split: `seo.ts` (server) and `usePageMeta.ts` (client) — a server component may not import a hook |

`src/lib/router.tsx` is the bridge that made the port a port rather than a
rewrite: 21 screens still say `<Link to=…>`, `useNavigate()`, `useParams()`.
That module is the only place that knows the framework's router exists.

## Why the router is not a second router

`src/lib/router.tsx` has no history stack and no context. Every function in it
is a translation into `next/link` and `next/navigation`; two routers in one app
is how a URL ends up disagreeing with the page on screen. One consequence
worth knowing: `useParams()` flattens a repeated segment to its first value,
which is what the old call sites want, and `useRouteParams()` leaves arrays
intact for the one catch-all route that needs them
(`/[username]/[[...rest]]` — the handle tree).

## What improved

- **Real server rendering.** Every page that can be known at build time is
  static HTML produced by the framework: 32 speeches, 14 guides, and every
  section page (66 routes in total). The 2.x pipeline rendered the app in jsdom
  *after* bundling, which meant the tags and the text could drift apart.
- **One source of truth for metadata.** `src/data/routes.ts` already held the
  title, description, share card and JSON-LD for every page — it now feeds the
  `<head>`, the sitemap and `generateStaticParams` as well.
- **The deploy is the test.** A page that throws during render fails the build.
- **Fewer build steps.** Four scripts (prerender, sitemap, robots, smoke) and
  one (cards) remain.

## What has not been done yet

- `POST /api/sync-library` exists and is tested, but **nothing in the app calls
  it**: publishing does not yet refresh the reading room. Until that is wired,
  new speeches appear in the fast copy only after `npm run sync:turso`.
- **The app does not create its Turso table.** `turso/schema.sql` is applied by
  `npm run db:turso`, or by the temporary Vercel build trick in `docs/DEPLOY.md`.
- **`src/index.html`-era service worker** is still the 2.x file in `public/`.
  It caches the shell; its cache names have not been revisited for the new
  asset paths (`/_next/static/...`).
- The screens are client components, which means they hydrate. Server
  components for the reading path (library, speech, guide) are the next step,
  and the metadata scaffolding is already in place for them.

---

## Deploying 3.1 to Vercel

1. **Framework preset.** Vercel detects Next.js from `package.json` on the next
   deploy. Nothing to set.
2. **Build command.** Back to `npm run build` (which now runs the share cards,
   then `next build`). If you had the temporary Turso or Convex command in
   **Settings → Build and Deployment → Build Command**, remove it unless you
   are still using the Turso bootstrap trick below.
3. **Environment variables.** Unchanged — the same nine. Nothing to rename and
   nothing to re-paste.
4. **Redeploy.** As always for a build-time change.

### Still running Turso without a terminal

The one-time trick from `docs/DEPLOY.md` still works, because the scripts are
still scripts:

```
npm run db:turso && npm run sync:turso && npm run build
```

Set `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN`, `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY` for that build, then remove the last two and reset
the build command to `npm run build`. Rotate the service key afterwards.
