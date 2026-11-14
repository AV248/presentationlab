# Presentation Buddy

> **3.1 · Next.js App Router.** Clerk handles identity, Supabase owns account
> records, Turso is the canonical presentation library, and Convex is an optional,
> tightly capped safety mirror. Existing deployment variable names are preserved.

**Read it. Write it. Say it out loud.**

Presentation Buddy is built around a small loop: read, write in private, then
rehearse aloud. Drafts stay on this device until the author deliberately shares.
Rehearsal is the skill-building action, not an afterthought.

## The writing loop

- **Write** — a required title, the presentation body, and optional category,
  preview and credits. Drafts autosave locally. There are exactly three primary
  actions: **Share**, **Rehearse** and **Save**. No author, occasion, level or
  audience form is required.
- **Share** — publishes to Turso after Clerk identity and the Supabase author
  profile are checked. A new work and version 1 are saved in one transaction;
  changed edits append a version in the same transaction as the current work.
  A no-op edit adds no version.
- **Rehearse** — take the words to the stage and practise saying them. The app
  keeps rehearsal private and local unless the writer chooses otherwise.
- **Read** — published works and search results come from the Turso library.
  Supabase is not a presentation-content fallback.

## Current product areas

| Area | Current scope |
|---|---|
| Library and reader | Public presentations, search and reading tools backed by Turso |
| Write and rehearse | Local-first drafts, explicit Share, and the rehearsal room |
| Author identity | Clerk identity with current profile data from Supabase |
| Arrivals | Existing live source discovery includes Wikisource, Project Gutenberg and Wikiquote. This is not the planned scheduled/admin-triggered, quality-reviewed ingestion workflow; no five-arrival guarantee is claimed. |
| Admin | The existing role-gated workspace is being extended toward the product-native Admin Suite described in the gap analysis. |

The rebuild gap analysis is the status source for work that is implemented,
partial, or not yet verified: [docs/CANONICAL-REBUILD-GAP-ANALYSIS.md](docs/CANONICAL-REBUILD-GAP-ANALYSIS.md).

## Data ownership

| Store | Owns | Does not own |
|---|---|---|
| **Clerk** | Authentication, sessions and the stable user subject | Profiles, badges, presentation content |
| **Supabase / Postgres** | Profiles, usernames, social/account data, badge grants and audit, admin roles and settings | Canonical presentation bodies or versions |
| **Turso / SQLite** | Published presentations, versions, moderation/provenance, source-arrival records, read counts and FTS search | User identity, profile authority or badge ownership |
| **Convex (optional)** | Safety snapshots only: no more than `floor(published presentations / 100)` personal works, each body slice no more than 1% of that body's UTF-8 bytes | Primary reads/writes, drafts, full content, activity or presence |
| **This device** | Private drafts and rehearsal notes until the author shares | Public/shared content or another person's writing |

Convex safety snapshots use an authenticated fetch-through path: the caller
provides an id and Clerk session, while the canonical server checks ownership
and reads the selected slice from Turso. Local tests and static boundary checks
cover the limit and write path; a live Convex deployment/direct-caller test has
not verified the production trust boundary. Convex is never a reader fallback.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for request flows and migration
ownership. Supabase's legacy `speeches` records are retained for compatibility
and reviewed additive imports; ordinary publishing writes presentation bodies
to Turso only.

## Setup and verification

Use Node 22 (the version pinned in `package.json`). Copy `.env.example` to
`.env`, keep real credentials there, then:

```bash
npm ci
npm run dev
```

The nine existing Vercel variables are listed in [docs/ENV.md](docs/ENV.md).
Turso is required for the shared presentation library. Convex is optional; its
absence does not block canonical reads or writes. Local legacy imports may use
`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; those are not Vercel variables
and must never be exposed to browser code.

Useful checks:

```bash
npm run typecheck
npm run check:library
npm run check:convex
npm run verify       # typecheck + secrets + schema/PG + read/library + Convex checks
npm run verify:all   # verify + production build + served-route checks
```

The Turso self-test uses local SQLite databases and covers additive legacy
upgrades, FTS, sample admission/rebalancing, version creation, no-op edits,
legacy baselines, deletion and public reads. These tests do not establish the
state of remote services or replace a browser motion review.

## Deployment and product references

- [Vercel deployment](docs/VERCEL.md)
- [Node/Next.js runtime and migration notes](docs/NEXTJS.md)
- [Self-hosting](docs/DEPLOY.md)
- [Frozen environment variables](docs/ENV.md)
- [Canonical architecture](docs/ARCHITECTURE.md)
- [Sign-in](docs/SIGNIN.md) · [Usernames](docs/USERNAMES.md)
