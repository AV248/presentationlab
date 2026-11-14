# Sign-in and account troubleshooting

Clerk is the only authentication and session provider. A signed Clerk session
is used directly for Supabase account/profile access and is verified by server
routes before a presentation is shared. Turso stores published work; it does
not receive a browser-supplied identity as authority.

## Production setup

1. Use the production Clerk publishable key in `VITE_CLERK_PUBLISHABLE_KEY` and
   the matching server secret in `CLERK_SECRET_KEY`.
2. Add the production site to the Clerk instance's domains and enable the
   desired sign-in providers. Provider-specific configuration is in
   [MICROSOFT.md](MICROSOFT.md) and the provider dashboard.
3. Set `CLERK_AUTHORIZED_PARTIES` to the exact production origin, for example
   `https://presentationbuddy.aavrit.dedyn.io`.
4. Apply `supabase/schema.sql` and configure Clerk as Supabase's third-party
   auth provider. Supabase RLS uses the signed Clerk subject for account data.
5. Configure Turso for canonical published presentation reads and writes. It
   is not optional for the shared library, and there is no Supabase content
   fallback.

The existing environment-variable contract is listed in [ENV.md](ENV.md).

## If sign-in does not start or return to the app

- Confirm that the public key is a production `pk_live_…` key from the same
  Clerk instance whose domain and providers are configured.
- Confirm the current origin is allowed by Clerk and is included in
  `CLERK_AUTHORIZED_PARTIES`.
- Open browser developer tools and check for CSP or network errors involving
  Clerk's Frontend API/bootstrap hosts. The active CSP is configured in
  `next.config.ts`; do not add a conflicting second policy at the host.
- Check the Clerk Dashboard logs for provider callback failures. For OAuth
  setup, follow the provider's registered redirect URI and credentials.
- Try a normal browser window without an extension blocking Clerk or its
  cookies. Do not paste session tokens into support messages or logs.

The in-app sign-in sheet has a diagnostics panel. `/api/health` can also report
whether the server has the expected configuration and whether Supabase/Turso
answer their checks; it does not test an OAuth provider callback.

## Username claiming

`/claim` uses a server-side route to set a Clerk username once, then stores the
site handle/profile in Supabase. The endpoint verifies the caller's Clerk
session, ignores client-supplied user ids, and refuses to overwrite an existing
different username. See [USERNAMES.md](USERNAMES.md) for uniqueness and handle
rules.

`POST /api/clerk-set-username` has these useful responses:

| Status / code | Meaning |
|---|---|
| `400 username_required` or `username_invalid` | Request body is missing a valid username. |
| `401 missing_session_token` or `invalid_session_token` | A verified Clerk session is required. |
| `409 username_immutable` or `username_taken` | The account already has another username, or that name is held. |
| `501 clerk_not_configured` | `CLERK_SECRET_KEY` is absent. Add it as a server-only variable. |
| `501 clerk_sdk_unavailable` | The server could not load its Clerk SDK; inspect the deployment logs/build. |
| `502 clerk_unreachable` or `username_update_failed` | Clerk could not complete the operation; retry and check its logs. |
| `405 method_not_allowed` | This is an API endpoint; opening it in a browser sends GET. The app uses POST. |

The first site owner is bootstrapped once in the Supabase SQL editor with the
Clerk user id:

```sql
select public.bootstrap_owner('<clerk-user-id>', 'owner@example.com');
```

Use the configured owner email for the project. Later role changes belong in
the role-gated Admin workspace.

## Shared library errors are Turso errors

`GET /api/library` reads from Turso. A `503 library_unavailable` response means
the canonical library is not configured, its schema is missing, or Turso could
not be reached. It does not fall back to Postgres. Check the error detail,
`TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`, then apply the schema with
`npm run db:turso` from a trusted operator environment.

A successful login by itself does not prove publishing is ready. For an end-to-
end check, verify the profile/username, share a test presentation, then load its
public URL and confirm it comes from the Turso-backed reader.
