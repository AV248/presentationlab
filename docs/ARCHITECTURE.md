# Architecture and data ownership

Last updated: 2026-10-13

Presentation Buddy has one owner per kind of data. A service may cache or
reference another service's data, but it does not become a second authority.

## The four stores

| Store | Canonical responsibility | Explicitly not responsible for |
|---|---|---|
| **Clerk** | Authentication, sessions and the stable user subject (`uid`) | Application profiles, usernames, social records, badge ownership, presentation content |
| **Supabase / Postgres** | Profiles, handles, social evidence, badge ownership and grant/revoke audit, admin roles, ads, posts, feedback and settings | Full presentation bodies, public presentation versions, drafts |
| **Turso / SQLite** | Published presentations, versions, moderation, source provenance, arrivals, read counts and FTS search | User identity, profile authority, badge ownership |
| **Convex (optional)** | A safety-only cohort, globally capped at `floor(published rows / 100)` personal presentations; each recovery slice is at most 1% of that body's UTF-8 bytes | Primary reads/writes, drafts, presence/activity, full-text copies, reader fallback |

Drafts remain private in this device's local storage until the writer chooses
**Share**. A missing database never authorizes copying data into another store.

## Request flows

### Sign in and profile

1. Clerk signs the person in and supplies the session token.
2. The server verifies the token and derives the owner id from its signed `sub`;
   client-supplied names or ids are not accepted as identity.
3. Supabase policies use the Clerk subject for profile, username, social, badge
   and admin operations. Public author corners read current profile data from
   Supabase, with only a display cache on a Turso presentation row as fallback.

### Write and read a presentation

1. Typing updates only the local draft. The writing page has a required title,
   optional category/preview/credits and the body; its three primary actions are
   **Share**, **Rehearse** and **Save**.
2. Share sends the work to `/api/presentations`. The server verifies Clerk,
   resolves the author's Supabase profile, then inserts the canonical row and
   version 1 together in Turso. An edit appends a version and updates the current
   row in the same Turso transaction. A no-op edit does not create a version.
3. `/api/library` and server-rendered presentation pages read published rows
   from Turso. Search uses Turso FTS5. Supabase is not a fallback for content.
4. Reader counts are deduplicated in Turso. Moderation state is applied to every
   public reader/search/list query.

## Badge contract

There are exactly three badges:

- **Quintal** — permanent after 100 presentations written and 100 presentations
  read or rehearsed.
- **Sole** — permanent for everyone who has ever held the top read/view count;
  the first award is not made until someone reaches 10,000.
- **Grey** — reserved for vetted official/source accounts. System-source accounts
  receive it by nature, not by pretending to be a Clerk user.

Supabase owns assignments and grant/revoke audit. Its schema restricts the
vocabulary and account types, and local schema tests exercise the admin-gated
write path. The admin badge desk, complete automatic eligibility rules and
public current-badge resolution are not yet fully integrated; the schema alone
is not evidence those product flows are deployed.

### Optional Convex safety mirror

The global cohort is marked in Turso by additive triggers. It contains no more
than `floor(published presentations / 100)` personal rows; the denominator
includes every published row. The triggers backfill legacy libraries
additively, fill eligible slots as the library grows, and rebalance when rows
are deleted or unpublished.

After a canonical share/edit, the browser asks Clerk for its optional Convex
JWT **in the background**; this never delays the Turso write. The public Convex
action accepts only a presentation id and a Clerk session. It fetches the
selected owner's bounded slice from the fixed canonical Presentation Buddy API,
which verifies the Clerk token, checks ownership, and rereads the selected
published row from Turso. The caller cannot provide content. Only an internal
Convex mutation writes the response; it independently checks the UTF-8 byte
limit and reconciles the stored ids against Turso's current cohort. The
presentation reader never queries Convex.

The fixed callback origin defaults to the current `VITE_SITE_URL` value,
`https://presentationbuddy.aavrit.dedyn.io`. It may be overridden by the same
existing `VITE_SITE_URL` setting in the Convex deployment; no new Vercel
variable is needed. If the canonical domain changes, update the fallback in
`convex/safety.ts`. Missing Convex, an absent Clerk template or a failed backup
never turns a successful Turso write into a failure.

## Schema and migration

- `supabase/schema.sql` is the account/social/admin schema, not the presentation
  body store. It includes active badge grants and the audit trail.
- `turso/schema.sql` defines the canonical published library, version history,
  arrivals/provenance, views and search index.
- `turso/safety-sampling.sql` is applied only after additive upgrades add the
  `safety_sampled` metadata column. Its version-2 trigger migration replaces
  older same-name cohort triggers and repairs membership transactionally,
  oldest-first by `published_at`, then `id`; it performs no destructive rebuild.
- `npm run db:turso` applies both Turso schema files and upgrades old tables in
  place. The authenticated write path can also ensure the schema.
- `npm run sync:turso` is a reviewed, additive import for legacy Supabase rows;
  it never overwrites an existing Turso row. It is not the ordinary publishing
  path. Its optional `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are local
  migration credentials only and are never client variables.
- Existing compatibility tables and legacy records are retained until an
  explicit, verified migration or cleanup is performed.

## Frozen deployment variables

The nine existing Vercel names are unchanged:

| Visibility | Variables |
|---|---|
| Public (`VITE_`) | `VITE_SITE_URL`, `VITE_CLERK_PUBLISHABLE_KEY`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_CONVEX_URL` |
| Server-only | `CLERK_SECRET_KEY`, `CLERK_AUTHORIZED_PARTIES`, `TURSO_DATABASE_URL`, `TURSO_AUTH_TOKEN` |

Never expose Clerk secret keys or Turso auth tokens through a `VITE_` variable.
The two local legacy-import credentials above are not required by Vercel.

## Verification

`npm run verify` runs the typecheck, secret audit, schema/policy checks, library
self-tests, read-path tests, and Convex safety checks. The local Turso tests cover
legacy upgrades, version snapshots, the global sample boundary and deletion
rebalancing without requiring a remote database. They do not prove that a live
Convex deployment or browser animation is configured; those remain separate
operational/browser checks.
