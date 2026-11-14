# Deploying Presentation Buddy

Presentation Buddy 3.1 is a **Next.js server application**, not a static site.
Vercel is the documented managed host; see [VERCEL.md](VERCEL.md). This guide
covers a Node.js host or reverse-proxy deployment. Do not upload `dist/`,
rewrite every route to a static `index.html`, or run a Vite export: API routes,
Clerk verification and canonical Turso reads/writes need the Next.js runtime.

## Requirements

- Node.js 22 (the `package.json` engine constraint)
- HTTPS on the public site
- Network access from the Node server to Clerk, Supabase, Turso and, if enabled,
  Convex and the source endpoints
- The nine existing Vercel environment-variable names from [ENV.md](ENV.md);
  no replacement names or new dashboard settings are required

## Prepare the data services

1. Create/configure Clerk and use its production publishable and secret keys.
   Set `CLERK_AUTHORIZED_PARTIES` to the exact public origin.
2. Apply `supabase/schema.sql` in the Supabase SQL editor and configure Clerk as
   its third-party auth provider. Supabase owns account/profile data, not
   canonical presentation bodies.
3. Configure the remote Turso URL and token. Apply the schema from a trusted
   operator environment:

   ```bash
   npm run db:turso
   ```

   Turso is required for public shared presentations and publishing. The app
   does not fall back to Supabase content if Turso is unavailable.
4. Optionally deploy Convex and configure its Clerk JWT provider/template as
   documented in [ARCHITECTURE.md](ARCHITECTURE.md). Convex is a safety-only
   mirror; deployment does not enable presence or activity features.
5. If old Supabase speech rows need to be imported, inspect them first with
   `npm run sync:turso -- --check`. The reviewed importer only adds missing rows;
   its `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are local/operator-only
   credentials and must never be placed in client code or Vercel.

## Build and run

Configure the existing variables before building. Public `VITE_` values are
inlined at build time, so redeploy after changing one. Server-only credentials
must remain unprefixed and server-side.

```bash
npm ci
npm run verify
npm run build
npm run start -- --hostname 0.0.0.0 --port 3000
```

The app listens on port 3000 by default. Keep the Node process supervised by
your host's process manager, and put a TLS-terminating reverse proxy in front
of it. Forward the original host and protocol correctly; configure the
production origin in both `VITE_SITE_URL` and `CLERK_AUTHORIZED_PARTIES`.

Do not copy only `.next/server/app` or individual HTML files. Keep the complete
Next.js build output and run it with the same source revision and environment
used for the build. Static files, route handlers and server-rendered pages are
all part of the deploy.

## Routing, headers, SEO and PWA

`next.config.ts` owns the legacy route redirects, CSP/security headers and
cache headers. Keep it as the single header/redirect source; duplicating policy
at the reverse proxy can produce conflicting CSPs. The configuration includes
HSTS, CSP, frame/content-type protections, referrer and permissions policies,
asset caching and service-worker revalidation.

The App Router also serves the metadata, `robots.txt` and sitemap endpoints.
The web app manifest and service worker remain in `public/`. After a domain or
host change, verify canonical URLs, sitemap host, redirects and browser
installation/offline behavior rather than assuming a successful build proves
them.

## Verify after deployment

1. Open `GET /api/health`. It reports the service checks and verdict in JSON;
   the GET itself responds with HTTP 200 even when the verdict is `broken`.
   `HEAD /api/health` returns 503 only for a broken verdict.
2. Check the library and a known public presentation, including a direct
   `/read/<id>` load.
3. In a test account, sign in, confirm the Supabase profile/username, Share a
   short work, then open its public Turso-backed URL. Verify an edit creates a
   version and a no-op does not.
4. If Convex is enabled, validate the deployed Clerk issuer and the safety
   action separately. Local static checks do not prove a remote Convex trust
   boundary.
5. Review keyboard/reduced-motion behavior and route transitions in a real
   browser. Automated verification does not replace the requested motion review.

Run `npm run verify:all` locally to execute type/schema/library checks, build the
production app and exercise served routes. This does not contact or certify
your production providers, the scheduled arrivals pipeline, or browser motion.

## Vercel

Vercel should auto-detect Next.js. Use `npm run build` and the framework-managed
output; don't override it with a static Vite command. Follow
[VERCEL.md](VERCEL.md) and preserve the exact variables in [ENV.md](ENV.md).
