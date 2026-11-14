# Deploying Presentation Buddy on Vercel

Presentation Buddy 3.1 is a Next.js App Router application. Vercel should detect
Next.js; use the repository's `npm run build` command and the framework-managed
output directory. Security headers, CSP, caching and redirects are in
`next.config.ts`. Do not configure it as a Vite static build.

## Data flow

- Clerk owns identity and issues the session.
- Supabase owns profiles, usernames, social/badge records and admin flags.
- `/api/presentations` verifies Clerk and writes published work and versions to
  Turso. `/api/library` and server-rendered readers read from Turso only.
- Convex is optional. It stores only a globally sampled safety slice. The
  public Convex action fetches selected content from the canonical app/Turso
  endpoint; no browser-submitted body is trusted or mirrored.
- Drafts remain local until Share.

For schema ownership and recovery guarantees, see
[ARCHITECTURE.md](ARCHITECTURE.md).

## Environment variables

In Vercel, open **Project → Settings → Environment Variables**. Preserve these
existing names and values; no new Vercel variable is required by the rebuild.
The authoritative list and exact notes are in [ENV.md](ENV.md).

### Public — `VITE_` values are bundled into the browser

| Name | Use |
|---|---|
| `VITE_SITE_URL` | Canonical origin for the deployed site, including `https://` and no trailing slash |
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk's public publishable key (`pk_live_…` in production) |
| `VITE_SUPABASE_URL` | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Supabase public anon key; row-level security is the protection |
| `VITE_CONVEX_URL` | Optional Convex safety deployment URL |

### Server-only — never prefix these with `VITE_`

| Name | Use |
|---|---|
| `CLERK_SECRET_KEY` | Server-side Clerk verification and username operations |
| `CLERK_AUTHORIZED_PARTIES` | Comma-separated allowed site origins; production should name the canonical origin |
| `TURSO_DATABASE_URL` | Canonical presentation database URL |
| `TURSO_AUTH_TOKEN` | Server-only Turso credential |

Never put a Clerk secret, Turso token, Supabase service-role key or any other
credential in a `VITE_` variable. `npm run audit:secrets` checks the client
bundle. Supabase service-role credentials are for local reviewed migration only
and must not be added to Vercel.

`VITE_` values are inlined at build time, so redeploy after changing one.
Server-only values are read by server routes at runtime. Do not rename the
frozen variables or replace them with new dashboard settings.

## Clerk and Supabase

1. Add the production domain in Clerk and use live keys for real users.
2. Configure Clerk's production Frontend API domain and the sign-in providers.
3. Apply `supabase/schema.sql`; configure Clerk as Supabase's third-party auth
   provider so Postgres policies receive Clerk's signed subject.
4. Set `CLERK_AUTHORIZED_PARTIES` to the exact production origin, for example
   `https://presentationbuddy.aavrit.dedyn.io`. Do not use a wildcard when the
   app needs only one origin.
5. Configure OAuth provider credentials in Clerk. Provider-specific setup is in
   the linked `docs/` guides.

The Supabase schema includes its own RLS and role checks. It does not store
canonical presentation bodies; the legacy `speeches` table is retained only for
compatibility and reviewed imports.

## Turso and Convex

Apply Turso schema locally or from a trusted operator environment:

```bash
npm run db:turso
```

The migration is additive. Legacy content can be imported with `npm run
sync:turso` after setting local `SUPABASE_URL` and
`SUPABASE_SERVICE_ROLE_KEY`; those credentials are not client or Vercel values.
Normal publishing is Turso-native and never runs the importer.

Convex is optional. If enabled, deploy `convex/`, configure its Clerk JWT
provider/template named `convex`, and set the existing `VITE_CONVEX_URL` in
Vercel. The Convex auth configuration needs its issuer domain in the Convex
deployment. The safety callback defaults to the current `VITE_SITE_URL`; if the
canonical origin changes, update the fallback in `convex/safety.ts`. The mirror
never blocks a share and never supplies reader content.

The scheduled/admin-controlled arrivals pipeline is still a product gap. Do not
claim scheduled ingestion is running simply because a Vercel deployment exists.

## Deploy and verify

1. Import the repository into Vercel and leave the framework preset as Next.js.
2. Add the nine frozen environment variables with the proper Production,
   Preview and Development scopes.
3. Apply the Supabase and Turso schemas; deploy Convex only if the optional
   safety mirror is desired.
4. Deploy, then check the canonical domain, `/api/health`, the library, sign-in,
   and an explicit Share → public read flow.
5. Run `npm run verify` for local checks. `npm run verify:all` also builds and
   checks served routes. Neither verifies a remote Convex deployment or a real
   browser's motion behavior; those need separate checks.

The app retains the repository's CSP/security headers, SEO routes, PWA manifest
and service worker. If a deployment changes domains or framework settings,
recheck `next.config.ts` rather than adding a second header/redirect source.
