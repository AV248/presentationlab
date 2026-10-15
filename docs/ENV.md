# Environment variables

The complete list. Nine variables, in the order to paste them, and nothing else
is read by anything in this repository. `.env.example` is the same list with the
commentary; this file says where each value comes from and what breaks without
it.

`.env.example` → copy to `.env` for local development. Vercel → **Project →
Settings → Environment Variables** for production.

---

## The rule

Vite inlines **every** variable beginning with `VITE_` into the JavaScript
bundle that ships to the browser. So:

| Prefix | Visibility | Vercel type |
| --- | --- | --- |
| `VITE_` | in the browser bundle — public by design | **Plain** |
| no prefix | read only by functions in `api/` | Plain, except where marked **Sensitive** |

Exactly two names on this list are secrets, and they are the only two that need
masking. `npm run audit:secrets` fails the build if a secret ends up in a
`VITE_` variable.

---

## Step 1 — the five public variables

Vercel type **Plain** for all five. Paste them in this order.

| # | Name | Where the value comes from | Without it |
| --- | --- | --- | --- |
| 1 | `VITE_SITE_URL` | `https://presentationbuddy.aavrit.dedyn.io` — your own canonical origin | Canonical tags, the sitemap and Open Graph point somewhere unintended, so search engines may index every page as a duplicate |
| 2 | `VITE_CLERK_PUBLISHABLE_KEY` | Clerk Dashboard → **API keys** → *Publishable key* (`pk_live_…` in production) | No sign-in at all. Reading still works |
| 3 | `VITE_SUPABASE_URL` | Supabase → **Project Settings → Data API** → *Project URL* | Nothing can be published, reacted to or saved. Reading falls back to local-only |
| 4 | `VITE_SUPABASE_ANON_KEY` | Supabase → **Project Settings → API keys** → *anon / public* | Same as above: the request is refused before a policy is even consulted |
| 5 | `VITE_CONVEX_URL` | `npx convex deploy` prints it (Dashboard → Settings → URL) | Presence and the live activity ticker go quiet. **Optional** — everything else is unaffected |

> **`VITE_SUPABASE_ANON_KEY` is not a secret.** It unlocks nothing on its own:
> every request is checked against the policies in `supabase/schema.sql`, which
> ask Postgres *who is asking* using the Clerk session token. A `service_role`
> or `sb_secret_` key here would be a real mistake, because that one bypasses
> every policy — and the app's own environment check turns red and says so.

Two other things belong to this step, and neither is an environment variable:

- **Clerk domains.** Dashboard → **Configure → Domains** → add
  `presentationbuddy.aavrit.dedyn.io`. Without it, live keys are refused on your
  own domain.
- **Canonical share host.** `VITE_SITE_URL` is the canonical origin; shared links
  are always `https://pb.devs.surf/<path>`, which is built into the app.

---

## Step 2 — the four server-only variables

No `VITE_` prefix. Read by the functions in `api/` at run time, so a change
takes effect on the next request — no redeploy needed.

| # | Name | Vercel type | Where the value comes from | Without it |
| --- | --- | --- | --- | --- |
| 6 | `CLERK_SECRET_KEY` | **Sensitive** | Clerk Dashboard → **API keys** → *Secret key* (`sk_live_…`) | `/api/clerk-set-username` cannot write a username into Clerk, so `/claim` stops working while "Restrict changes" is on. Everything else is unaffected |
| 7 | `CLERK_AUTHORIZED_PARTIES` | Plain | `https://presentationbuddy.aavrit.dedyn.io` — comma-separated, no trailing slashes | The username endpoint refuses sessions from your own origin. Not optional: Clerk accepts cross-origin requests from **any** subdomain of a configured root domain by default |
| 8 | `TURSO_DATABASE_URL` | Plain | turso.tech → your database → the `libsql://` URL | Reading is served from Postgres — the same rows, one hop further away. **Optional**: the site is complete without it, just not the fast one |
| 9 | `TURSO_AUTH_TOKEN` | **Sensitive** | turso.tech → your database → *Create token* | Same as above. A real credential: it reads the reading room, and the sync writes it |

The two Turso names are read at request time, not baked in, so they can be added
later without touching the build. Variables 1–5 are **baked in at build time** —
saving one in Vercel changes nothing until you redeploy. That single difference
explains most of the "I set it and it did nothing" reports.

---

## Step 3 — local only, never in Vercel

The one-time Firestore import needs three things, and the running site needs
none of them. Keep them in `.env`; do not add them to Vercel.

| Name | Use |
| --- | --- |
| `GOOGLE_APPLICATION_CREDENTIALS` | path to the Firebase service account JSON |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | the same JSON inline, on one line (either one, not both) |
| `SUPABASE_SERVICE_ROLE_KEY` | lets the importer write other people's rows — it bypasses the row policies on purpose |

```bash
npm run migrate:firestore              # plan only
npm run migrate:firestore -- --apply
```

Then revoke the Firebase service account and retire the project. Full order:
[ARCHITECTURE.md § Setting it up](ARCHITECTURE.md#2-setting-it-up-in-order).

---

## The whole list, in one block

```bash
# ── Public (VITE_) — Vercel: Plain ───────────────────────────────────────────
VITE_SITE_URL=https://presentationbuddy.aavrit.dedyn.io
VITE_CLERK_PUBLISHABLE_KEY=pk_live_…
VITE_SUPABASE_URL=https://<project>.supabase.co
VITE_SUPABASE_ANON_KEY=…
VITE_CONVEX_URL=https://<deployment>.convex.cloud        # optional

# ── Server only — Vercel: Sensitive for the two marked ✓ ─────────────────────
CLERK_SECRET_KEY=sk_live_…                                ✓ Sensitive
CLERK_AUTHORIZED_PARTIES=https://presentationbuddy.aavrit.dedyn.io
TURSO_DATABASE_URL=libsql://<database>.turso.io
TURSO_AUTH_TOKEN=…                                        ✓ Sensitive
```

---

## Checking it from inside the app

You do not have to guess. The app audits itself:

- **Sign-in sheet → Environment** — every variable above, marked `set`,
  `missing` or `placeholder`, with a short fingerprint (never a value). It also
  asks the server for its own verdict, which is the only way to see the
  server-only variables from a browser.
- **Admin → Setup** — the same panel, plus the server-only half.
- **Control Room → Cloud** — the database it is actually talking to, and whether
  the connection is up.

`src/services/envCheck.ts` is the list those panels are built from, and it is
the same list as this file. If they ever disagree, the code is right.

---

## Troubleshooting

| Symptom | What it is |
| --- | --- |
| Nothing publishes; the library shows only local work | Variables 3–4 are missing or wrong, **or** the build predates them. `VITE_` values are inlined at build time: redeploy |
| Sign-in returns to the site and nothing happens | `pk_test_` keys in production, or the domain is not added under Clerk → Configure → Domains |
| Everything works, no presence | Variable 5 is unset, or the Clerk JWT template is not named exactly `convex` |
| "That name is already taken" for a name nobody holds | A previous claim left a `handles` row. Admin → Handles releases it |
| Publishing works, but the person who just published sees a stale library | The reading room is a copy. It refreshes on publish through `POST /api/sync-library`; `npm run sync:turso` forces it |
| Reads work immediately after a deploy, then break a week later | The Supabase free project paused after no traffic. Open the dashboard once; a weekly visit keeps it awake |
| `/api/library` answers `503 library_not_configured` | Deliberate, and harmless: Turso is optional and reads fall back to Postgres. The site's environment check labels it "not set up (harmless)" for that reason |
