# How Presentation Buddy is put together

> **3.1:** the layer on top of all of this is the Next.js App Router — one `page.tsx` per
> route in `app/`, the screens in `src/screens/`, the endpoints in `app/api/*/route.ts`, and
> `src/lib/router.tsx` keeping the old `<Link to=…>` vocabulary working. The three databases
> below are exactly as described. See [NEXTJS.md](NEXTJS.md).

Three databases, one identity, one writer per fact.

This replaces the old `docs/FIRESTORE.md`. Everything it described — collections,
rules, the token exchange — is gone. What follows is what exists now, why each
piece exists, and the order to set it up in.

---

## 1. The shape of it

```
                       ┌──────────────────────────────────────────┐
   Clerk               │  identity, sessions, usernames, MFA      │
   (only identity)     └────────────────┬─────────────────────────┘
                                       │  session token
              ┌────────────────────────┼────────────────────────┐
              │                        │                        │
              ▼                        ▼                        ▼
   ┌────────────────────┐   ┌────────────────────┐   ┌────────────────────┐
   │  SUPABASE          │   │  TURSO             │   │  CONVEX            │
   │  Postgres          │   │  SQLite            │   │  reactive store    │
   │                    │   │                    │   │                    │
   │  THE TRUTH         │   │  THE READING ROOM  │   │  THE LIVE LAYER    │
   │                    │   │                    │   │                    │
   │  every durable     │◄──┤  a derived copy of │   │  who is here now,  │
   │  record: profiles, │   │  published work +  │   │  what just happened│
   │  handles, roles,   │   │  FTS5 search       │   │                    │
   │  speeches, ads,    │   │                    │   │  ephemeral by      │
   │  reactions, shares,│   │  rebuilt, never    │   │  design: losing it │
   │  posts, feedback,  │   │  written by hand   │   │  costs nothing     │
   │  settings          │   │                    │   │                    │
   └─────────┬──────────┘   └─────────┬──────────┘   └─────────┬──────────┘
             │                        │                        │
             │  PostgREST + RLS       │  GET /api/library      │  websockets
             │  (browser, direct)     │  (browser → server)    │  (browser, direct)
             ▼                        ▼                        ▼
        ┌────────────────────────────────────────────────────────────┐
        │  the app                                                   │
        └────────────────────────────────────────────────────────────┘
```

The rule that keeps this honest is one sentence: **one fact has exactly one
writer.** Postgres writes everything durable. Turso is rebuilt from Postgres and
never written by the app. Convex is never the authoritative copy of anything, so
it cannot disagree with either of them.

### Why three databases

Because they are three different problems, and one database doing all three
badly is how a site gets slow.

| | The problem it solves | Free tier |
| --- | --- | --- |
| **Supabase / Postgres** | Correctness. Foreign keys, unique indexes, row-level security, transactions. The one place a fact is allowed to be born. | 500 MB, pauses after ~7 days with no traffic — ping it weekly |
| **Turso / SQLite** | Read latency and search. Reading is free and it is most of the traffic, so it is served from a copy that sits near the reader, with FTS5 behind the search box. | 9 GB storage, 1 B rows read/month |
| **Convex** | Liveness. Presence ("3 people reading") and a live activity feed are the only things here; they are worth nothing tomorrow. | generous free tier; `npx convex deploy` |

### What lives where, exactly

| Collection (app name) | Table | Database | Who may write |
| --- | --- | --- | --- |
| `presentations` | `speeches` | Postgres | the author, and role-holders |
| `users` | `profiles` | Postgres | the person themselves, and the reaction function |
| `handles` | `handles` | Postgres | the person claiming it, once; role-holders |
| `admins` | `admins` | Postgres | role-holders |
| `adminPrivate` | `admin_private` | Postgres | the owner, only after the second lock |
| `servingads` | `ads` | Postgres | role-holders |
| `sponsors` | `sponsors` | Postgres | role-holders |
| `reactions` | `reactions` | Postgres | the person reacting |
| — | `shares` | Postgres | the person sharing |
| — | `speech_views` | Postgres | anyone (one row per open) |
| `bloggerblogs` | `posts` | Postgres | the author |
| `feedback` | `feedback` | Postgres | anyone, signed in or not |
| `siteSettings` | `site_settings` | Postgres | the owner |
| — | `library` | **Turso** | nothing — rebuilt by the sync |
| — | `presence`, `activity` | **Convex** | the session that is present |

The names on the left are what the app says; the names on the right are what the
database calls them. `src/services/backend/supabase.ts` is the only file that
knows both, and `npm run check:schema` fails the build if a field is mapped to a
column that does not exist. That check has already caught three.

### Identity, and why there is no bridge any more

Clerk is the only identity provider. There is no Firebase Auth, no custom token,
no exchange endpoint.

- **Postgres** trusts Clerk as a third-party auth provider, so
  `auth.jwt() ->> 'sub'` is the Clerk user id, and every policy in
  `supabase/schema.sql` is written in terms of it.
- **Convex** trusts the same token through a JWT template named `convex`.
- **Turso** never learns who is asking. It is a public reading room; the people
  who read it need no account, and the endpoint that serves it holds the only
  token.

What this removed: one serverless function, one credential that could mint
another credential, a whole class of "token exchange failed" bugs, and the
awkward state where you were signed in to one system but not the other.

### The two operations that are not a single row write

Reacting and sharing used to be client-side transactions. They are now database
functions, because that is where atomicity actually lives:

| Function | What it does, in one transaction |
| --- | --- |
| `react_to_speech(speech_id, kind)` | the reaction row, the speech's like/dislike counters, and the author's score — which is `likes − floor(dislikes / 3)` |
| `record_share(speech_id)` | one row per (person, speech), and the share counter only moves the first time |

Both are in `supabase/schema.sql`. Because every counter can be recomputed from
the rows, the numbers can always be rebuilt if they are ever doubted.

Views are a plain counter: one honest increment per open, through
`bump_counter()`.

---

## 2. Setting it up, in order

Five things, in this order. Each one is verifiable before you start the next.

### Step 1 — Supabase (the truth)

1. Create a project at supabase.com. Note the database password somewhere safe.
2. **SQL Editor → New query** → paste the whole of `supabase/schema.sql` → **Run**.
   It is idempotent: running it twice changes nothing.
3. **Project Settings → API keys** → copy the **Project URL** and the
   **anon/public** key. They become `VITE_SUPABASE_URL` and
   `VITE_SUPABASE_ANON_KEY`.
4. **Authentication → Third-party auth → Clerk** → add your Clerk instance's
   issuer. Without this step every write is refused, and the app says so in
   plain words rather than failing silently.
5. Sign in to the site once with Clerk (so a `profiles` row exists), then run
   this in the SQL editor with your own Clerk user id — found in the Clerk
   dashboard under Users:

   ```sql
   select public.bootstrap_owner('<clerk-user-id>', 'amaavrit@yahoo.com');
   ```

   That one call makes you the owner. It is the only way to get the first role,
   and it can be run exactly once per database — if a role already exists it
   refuses, which is the point.
6. **Supabase pauses a free project after about seven days with no traffic.** A
   weekly visit to the site is enough to keep it awake; the site's own reads
   count as traffic.

### Step 2 — Turso (the reading room)

Optional, and genuinely so: without it, reading falls back to Postgres. With it,
reading is faster and search works.

1. Create a database at turso.tech. Copy its `libsql://` URL and create a token.
   They become `TURSO_DATABASE_URL` and `TURSO_AUTH_TOKEN`.
2. Put both in `.env`, then apply the schema once:

   ```bash
   npm run db:turso
   ```

3. Fill it from Postgres, and check it:

   ```bash
   npm run sync:turso -- --check   # how many rows each side holds
   npm run sync:turso              # copy them across
   ```

   After this, ordinary publishing keeps it current on its own: the app calls
   `POST /api/sync-library` after a speech is written, edited or deleted.

### Step 3 — Convex (the live layer)

Optional as well; the site is quieter without it and loses nothing else.

1. `npx convex dev` once, to create the deployment and sign in.
2. `npx convex deploy` to push `convex/schema.ts` and `convex/activity.ts`.
3. In the Convex dashboard → **Settings → Authentication**, add Clerk as a
   provider, and in Clerk create a JWT template named exactly **`convex`**.
4. Copy the deployment URL into `VITE_CONVEX_URL`.

### Step 4 — Vercel

The full list, in the order to paste it, is in [ENV.md](ENV.md). In short:
five `VITE_` variables (one optional) and four server-only ones. Then redeploy —
`VITE_` values are baked in at build time, so saving them without a redeploy
changes nothing.

### Step 5 — Moving the data (once)

Firestore is still holding everything. Move it:

```bash
npm run migrate:firestore                    # plan only: read Firestore, write nothing
npm run migrate:firestore -- --apply         # do it
npm run sync:turso                           # fill the reading room from the new rows
```

The importer is read-only towards Firestore and never deletes anything, so
Firestore stays as your archive until you are satisfied. It needs the service
account JSON and the Supabase service key, both **local only** — see the bottom
of `.env.example`. Once the site is verified:

1. revoke the Firebase service account key in the Firebase console,
2. retire the Firebase project,
3. remove `firebase-admin` from `devDependencies` (it is used by nothing else).

Two things the importer does deliberately, which are worth knowing before you
run it:

- **`bloggers` is not carried across as a table.** It held one thing — a
  person's like/dislike score — and that now lives on their `profiles` row. One
  fact, one row.
- **Rows whose parent is missing are skipped and named.** A reaction whose
  speech was never migrated, a speech whose author has no profile: each is
  listed in the report, and stays in Firestore untouched. Nothing is guessed.

---

## 3. Where the code lives

| Path | What it is |
| --- | --- |
| `src/services/backend/config.ts` | which databases this build has, from the environment |
| `src/services/backend/supabase.ts` | the engine: collection → table, field → column, queries, counters, RPCs |
| `src/services/backend/library.ts` | the reading room, with a transparent Postgres fallback |
| `src/services/backend/live.ts` | presence and activity; entirely inert without `VITE_CONVEX_URL` |
| `src/services/backend/index.ts` | `loadBackend()` — the one seam the app imports |
| `api/library.ts` | `GET /api/library` — public reads from Turso. Holds the only Turso read token |
| `api/sync-library.ts` | `POST /api/sync-library` — rebuild the reading room |
| `api/_project.ts` | the projection itself, shared by the endpoint and the CLI |
| `api/clerk-set-username.ts` | writes a username into Clerk, once, with the secret key |
| `supabase/schema.sql` | tables, policies, functions. The truth |
| `turso/schema.sql` | the projection table, its indexes, and the FTS5 triggers |
| `convex/` | schema, presence, activity, auth config |
| `scripts/migrate/` | the Firestore importer, and its mapping table |
| `scripts/turso/` | `apply.mjs` (schema), `sync.mjs` (fill) |
| `scripts/check-schema.mjs` | the field map and the migration vs the schema — a build failure, not a warning |

Nothing else in the app knows which database anything is in. Every page imports
`loadBackend()`, which returns either the whole bundle or `null`, and asks it for
`{ db, fs, rpc }`.

---

## 4. Things that are true on purpose

- **The app works without any of this.** No variables at all means the library
  is local to the browser, sign-in is off, and the site still runs. That
  fallback is not a leftover; it is what makes the setup steps safe to take
  slowly.
- **Counters are never invented.** They move by real increments, tied to a
  signed-in person, and the two that must be atomic are database functions.
- **Nothing durable is written to Turso or Convex.** Both can be deleted and
  rebuilt: Turso from Postgres in one command, Convex from nothing at all.
- **The reading room is public by construction.** It holds published work only.
  The endpoint requires no session, because reading requires no account.
- **A missing Turso or Convex is reported as what it is** — a setup step not
  taken yet — never as a broken site. This is the lesson the old 501 saga taught,
  and `src/services/envCheck.ts` is where it is enforced.
- **Testing the projection without an account.** Everything here can be run
  against local files:

  ```bash
  TURSO_DATABASE_URL=file:./.tmp/library.db npm run db:turso
  TURSO_DATABASE_URL=file:./.tmp/library.db npm run sync:turso -- --check
  ```
