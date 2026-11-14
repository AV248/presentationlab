# Environment variables

This deployment keeps the same nine Vercel variable names. Do not rename them,
add a replacement dashboard variable, or put server credentials in the browser.
`.env.example` contains placeholders; copy it to `.env` for local development.

## Visibility and timing

`VITE_` values are public and are included in the browser bundle by
`next.config.ts`. Changing one in Vercel requires a redeploy. The four names
without that prefix are server-only and are read by server code at runtime.
Exactly two of the nine are credentials that should be marked **Sensitive** in
Vercel: `CLERK_SECRET_KEY` and `TURSO_AUTH_TOKEN`.

## The five public variables

| Name | Use | If missing |
|---|---|---|
| `VITE_SITE_URL` | Canonical site origin, including `https://` and no trailing slash. The current production value is `https://presentationbuddy.aavrit.dedyn.io`. | Canonicals and share metadata use the configured/default origin; set this to the real production host. |
| `VITE_CLERK_PUBLISHABLE_KEY` | Clerk's browser-safe publishable key (`pk_live_…` in production). | Browser sign-in cannot start. |
| `VITE_SUPABASE_URL` | Supabase project URL for profiles, usernames and account data. | Profile- and account-backed operations are unavailable. |
| `VITE_SUPABASE_ANON_KEY` | Supabase's public anon/publishable key. RLS and the signed Clerk session govern access. | Same: Supabase-backed profile/account operations are unavailable. |
| `VITE_CONVEX_URL` | Optional Convex safety deployment URL. | No optional safety mirror; canonical Turso reads and writes are unaffected. |

The Supabase anon key is public by design. Never place a Supabase service-role
or secret key in a `VITE_` variable. `npm run audit:secrets` checks the client
bundle for server credentials.

## The four server-only variables

| Name | Vercel type | Use | If missing |
|---|---|---|---|
| `CLERK_SECRET_KEY` | **Sensitive** | Verifies Clerk sessions on server routes and supports server-side username operations. | Authenticated share/session verification cannot work. |
| `CLERK_AUTHORIZED_PARTIES` | Plain | Comma-separated allowed origins, without trailing slashes. Set the production origin, e.g. `https://presentationbuddy.aavrit.dedyn.io`. | Session verification lacks the expected origin restriction; set it for production. |
| `TURSO_DATABASE_URL` | Plain | URL for the authoritative presentation database (`libsql://…` in production). | Shared presentation reads and writes are unavailable. There is no Supabase content fallback. |
| `TURSO_AUTH_TOKEN` | **Sensitive** | Credential for the remote Turso database. A local `file:` database does not need it. | A remote Turso database cannot be reached. |

For a production site, configure both Turso values. The app can apply its
idempotent schema on an authenticated write; operators can also run
`npm run db:turso` from a trusted environment.

## Local-only migration credentials

The optional, reviewed legacy import is not part of ordinary publishing and
these credentials are **not** Vercel variables:

| Name | Use |
|---|---|
| `SUPABASE_URL` | Legacy Supabase source URL used by `npm run sync:turso`. |
| `SUPABASE_SERVICE_ROLE_KEY` | Local CLI-only key used to read legacy rows for the additive Turso import. Never expose it to client code or add it to Vercel. |

Preview an import without writing with `npm run sync:turso -- --check`. The
importer adds only missing rows and does not overwrite existing Turso rows.
Keep migration credentials in the local `.env` and revoke/rotate them when no
longer needed.

## Copy/paste template

Use actual values from the relevant provider dashboards; this block preserves
the existing names and current canonical site value.

```dotenv
# Public; bundled into browser code
VITE_SITE_URL=https://presentationbuddy.aavrit.dedyn.io
VITE_CLERK_PUBLISHABLE_KEY=pk_live_…
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=<anon-or-publishable-key>
VITE_CONVEX_URL=https://<deployment>.convex.cloud

# Server-only
CLERK_SECRET_KEY=sk_live_…
CLERK_AUTHORIZED_PARTIES=https://presentationbuddy.aavrit.dedyn.io
TURSO_DATABASE_URL=libsql://<database>.turso.io
TURSO_AUTH_TOKEN=<database-token>
```

Convex is optional. If enabled, deploy the safety functions and configure the
Clerk JWT template named `convex`; it is not a presence/activity service.

## Check a deployment

`GET /api/health` performs server-side checks for Clerk configuration,
Supabase profile reads, Turso reachability/schema, the optional Convex URL and
the canonical origin. It returns a `ready`, `degraded` or `broken` verdict with
variable names and actionable detail; it never returns secret values. `HEAD
/api/health` returns `503` only for a broken deployment, otherwise `200`, with
the verdict in `X-Health`.

The in-app Environment panel reports browser-visible variable presence. Its
server probe asks `/api/library` whether the authoritative Turso library is
available. Neither check proves an external service is configured for the
correct production account; confirm the deployed host and a real Share → public
read flow after configuration.

## Troubleshooting

| Symptom | Check |
|---|---|
| Sign-in will not start | Confirm `VITE_CLERK_PUBLISHABLE_KEY` belongs to the production Clerk instance and redeploy. |
| Share is refused or profile setup is missing | Confirm both Supabase public variables, the Clerk session, a profile row and a claimed username. |
| `/api/library` cannot serve shared work | Confirm `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`, then check that the additive Turso schema is applied. Do not configure a Supabase presentation fallback. |
| Canonical pages point to a preview or wrong host | Set `VITE_SITE_URL` to the production origin and redeploy. |
| Convex reports unavailable | Optional safety snapshots are not being written. Turso remains authoritative and the reader is unaffected. |
| Server reports Clerk token rejection | Check `CLERK_SECRET_KEY` and the exact production origin in `CLERK_AUTHORIZED_PARTIES`. |
