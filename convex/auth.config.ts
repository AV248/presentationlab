/**
 * Clerk is the identity provider, here as everywhere else.
 *
 * A JWT template named `convex` in the Clerk dashboard (Dashboard → JWT
 * Templates → New → name it "convex") makes Clerk mint tokens this deployment
 * trusts. The only Convex mutation is an owner-scoped, bounded backup of a
 * small Turso sample; public actions fetch canonical slices server-side, and
 * only internal mutations can write them. No live read/write or presence
 * feature depends on Convex.
 *
 * `CLERK_JWT_ISSUER_DOMAIN` is set in the Convex dashboard
 * (Settings → Environment Variables), e.g. https://clerk.aavrit.dedyn.io
 */
export default {
  providers: [
    {
      domain: process.env.CLERK_JWT_ISSUER_DOMAIN,
      applicationID: 'convex',
    },
  ],
};
