/**
 * Clerk is the identity provider, here as everywhere else.
 *
 * A JWT template named `convex` in the Clerk dashboard (Dashboard → JWT
 * Templates → New → name it "convex") makes Clerk mint tokens this deployment
 * trusts, so `ctx.auth.getUserIdentity()` returns the same `subject` (Clerk
 * user id) that the Postgres row policies compare against. One identity, three
 * databases, no bridging.
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
