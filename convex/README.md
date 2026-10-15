# Convex — the live layer

Deploy with `npx convex deploy` (or `npx convex dev` while working). Two things
must exist before it is reachable from the site:

1. **A JWT template in Clerk** — Dashboard → JWT Templates → New → **convex**.
   No custom claims are needed: the default `sub` is the uid every other
   database uses.
2. **`CLERK_JWT_ISSUER_DOMAIN`** in the Convex dashboard → Settings →
   Environment Variables, set to your Clerk Frontend API URL
   (e.g. `https://clerk.aavrit.dedyn.io`).

Then `VITE_CONVEX_URL` (Vercel, type **Plain**) points the browser at it.
If that variable is absent the site simply has no live layer — presence and the
activity feed disappear, nothing breaks, because nothing durable lives here.
