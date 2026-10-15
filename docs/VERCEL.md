# Deploying Presentation Buddy on Vercel

> **3.1:** Vercel now detects Next.js. The build command is `npm run build`, the output
> directory is whatever the framework says, and the redirects, headers and CSP that used to
> live in `vercel.json` live in `next.config.ts`. The environment variables are unchanged.

Everything you need to put this site live, and everything you must set for it
to be safe once it is.

Read the two warnings in [Before anything else](#before-anything-else) first —
one of them is about a credential that has already been exposed.

---

## Before anything else

### 1. Rotate your Clerk secret key

You pasted `sk_test_…` into a chat message to get here. Treat that key as
public: anything written in a conversation should be assumed readable by more
people than you intend.

1. Clerk Dashboard → **API keys** → rotate the secret key.
2. Put the new value straight into Vercel. Never paste it into a chat, a
   ticket, or a screenshot again.

The publishable key (`pk_test_…`) is fine — it is designed to sit in the
browser.

### 2. Switch to live keys before real users arrive

`pk_test_` / `sk_test_` are development keys. Clerk rate-limits them and
actively blocks them in production once you pass a handful of users. For
launch you need `pk_live_` / `sk_live_`, and your production domain added
under **Configure → Domains**.

---

## Architecture in one paragraph

Clerk signs people in, and its session token is presented **directly** to the
two databases that need one: Postgres (Supabase) trusts Clerk as a third-party
issuer, and Convex trusts the same token through a JWT template named `convex`.
There is no token exchange, no Firebase, and no second identity. Ads are rows in
the same Postgres database as everything else. Turso serves reading.

```
Browser                    Vercel                  Databases
────────                   ──────                  ─────────
Clerk modal ─────────────► Clerk (sign-in)
   │
   ├─ session token ─────────────────────────────►  Supabase: Postgres + RLS
   │                                                  ↳ the truth
   │
   ├─ session token ─────────────────────────────►  Convex: presence, activity
   │                                                  ↳ ephemeral
   │
   └─ GET /api/library ────► /api/library ───────►  Turso: published copy + FTS5
                              (holds the token)       ↳ derived
```

The full picture, the three schemas and the order to set them up:
[ARCHITECTURE.md](ARCHITECTURE.md).

---




In Vercel: **Project → Settings → Environment Variables**. Set each for
Production, Preview and Development as appropriate. The complete list, with
where each value comes from, is in [ENV.md](ENV.md) — this is the same list.

### Public — bundled into the browser. Vercel type: Plain

| Variable | Value | Notes |
| --- | --- | --- |
| `VITE_SITE_URL` | `https://presentationbuddy.aavrit.dedyn.io` | **Set this first.** Canonicals, sitemap URLs, Open Graph URLs and structured data all derive from it. No trailing slash. |
| `VITE_CLERK_PUBLISHABLE_KEY` | `pk_live_…` | Clerk Dashboard → API keys. |
| `VITE_SUPABASE_URL` | `https://<project>.supabase.co` | Supabase → Project Settings → Data API. |
| `VITE_SUPABASE_ANON_KEY` | the anon/public key | Supabase → Project Settings → API keys. Public by design: the row policies are what protect the data, and every request is checked against them. |
| `VITE_CONVEX_URL` | `https://<deployment>.convex.cloud` | Optional. Without it, presence and the activity ticker are simply absent. |

> **None of these is a secret.** They identify infrastructure in the browser.
> What actually protects the data is `supabase/schema.sql`, which asks Postgres
> who is asking. Putting the anon key behind a "secret" mechanism would be
> theatre — and putting a *service_role* key under `VITE_` would be a genuine
> incident, which is why `npm run audit:secrets` fails the build over it.

### Server-only — never prefix with `VITE_`

| Variable | Vercel type | Value | Notes |
| --- | --- | --- | --- |
| `CLERK_SECRET_KEY` | **Sensitive** | `sk_live_…` | Used by `/api/clerk-set-username` to write a claimed username into Clerk. That is what keeps claiming working while "Restrict changes" is on. |
| `CLERK_AUTHORIZED_PARTIES` | Plain | `https://presentationbuddy.aavrit.dedyn.io` | **Required** once the Clerk root domain is `aavrit.dedyn.io`: Clerk accepts cross-origin requests from any subdomain of a configured root domain by default, so without this a compromised subdomain on the shared root could replay a token. |
| `TURSO_DATABASE_URL` | Plain | `libsql://…` | Optional. Reads fall back to Postgres without it. |
| `TURSO_AUTH_TOKEN` | **Sensitive** | the database token | Optional, and a real credential: the functions read the reading room with it, and the sync writes it. |

Those four are read at **run time**, so changing one takes effect on the next
request. The five above are inlined at **build time** — saving a new value does
nothing until you redeploy. That single difference explains most of the "I set
it and nothing changed" reports.

**The rule:** Vite inlines every `VITE_`-prefixed variable into the browser
bundle. Adding that prefix to `CLERK_SECRET_KEY` would publish it to every
visitor who opens devtools.

You do not have to remember this. `npm run verify` runs
`scripts/check-secrets.mjs`, which fails the build if anything secret sits under
a `VITE_` prefix, or if `.env` is still tracked in git:

```
✗ VITE_CLERK_SECRET_KEY is a Clerk secret key but starts with VITE_,
  so it would be bundled into the browser JavaScript.
```

Add `npm run verify` as a CI check so this never reaches production.

### Making the reading room fast (optional, five minutes)

Turso is what makes reads cheap and search real. Skipping it costs nothing but
speed — reading is served from Postgres, the same rows, one hop further away.

```bash
# once, with TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in .env
npm run db:turso        # apply turso/schema.sql
npm run sync:turso      # fill it from Postgres
```

---




One database, one schema file, and no way to deploy it to the wrong project.

**File: `supabase/schema.sql`.** Apply it in Supabase → **SQL Editor** →
paste the whole file → **Run**. It is idempotent: running it twice changes
nothing, and it is safe to re-paste after this repository adds a column.

There is no CLI deploy step and no rules file to keep in sync, because the
policies live *inside* the schema, next to the tables they guard. That is the
whole reason Postgres replaced Firestore here: a rule that references a column
that does not exist is a broken rule you find out about at 2am, and a foreign
key is one you find out about in the editor.

What it enforces, in short:

| Table | Who may read | Who may write |
| --- | --- | --- |
| `profiles` | everyone | the person themselves |
| `handles` | everyone | the person claiming it, **once** — and role-holders |
| `admins` | everyone (a role is not a secret) | role-holders |
| `admin_private` | the role-holder who owns it | the same |
| `speeches` | everyone | the author, and role-holders |
| `reactions` / `shares` | the person, and role-holders | the person, through the database function |
| `ads` / `sponsors` | everyone | role-holders |
| `posts` | everyone | the author, and role-holders |
| `feedback` | role-holders | anyone |
| `site_settings` | everyone | the owner |

### Reacting and sharing are functions, not scripts

`react_to_speech()` and `record_share()` do their work in a single transaction
inside Postgres: the reaction row, the speech's counters, and the author's
score all move together, or none of them do. Doing this in a browser tab — as
the old Firestore version had to — means two people reacting at the same instant
can lose a count. It also means the numbers can always be recomputed from the
underlying rows, which is the property that makes them trustworthy.

### The first owner, once

There is no console to add yourself to. After applying the schema, run this in
the SQL editor with your own Clerk user id (Clerk Dashboard → Users):

```sql
select public.bootstrap_owner('<clerk-user-id>', 'amaavrit@yahoo.com');
```

It grants the `owner` role exactly once: if a role already exists, it refuses.
Every later role change happens in the site's own Admin workspace.

---



1. **Domains** — Configure → Domains. Add **`aavrit.dedyn.io`** (the root, not
   the subdomain). Because `dedyn.io` is a public suffix, `aavrit.dedyn.io` is
   the registrable domain and `presentationbuddy.aavrit.dedyn.io` is a true
   subdomain of it, so Clerk shares sessions across subdomains for free —
   no satellite domains, no paid add-on. Add `*.vercel.app` for previews.
2. **DNS** — Clerk needs exactly one new record: a CNAME at
   `clerk.aavrit.dedyn.io` pointing at the target the Domains page shows you.
   Nothing is required at the apex (`@`), and existing subdomain records are
   untouched. Check that no CAA record blocks Let's Encrypt or Google Trust
   Services, and do not proxy this host through Cloudflare — Clerk's DNS check
   fails behind a proxy. Propagation can take up to 48h.
3. **Providers** — Configure → SSO connections. Enable whichever you want
   (Google, Microsoft, email). The sign-in sheet renders whatever is enabled
   here; no code change needed to add one.
4. **Allowed Subdomains** — enable it and allowlist only
   `presentationbuddy.aavrit.dedyn.io`. Do this. By default the Frontend API
   accepts cross-origin requests from *every* subdomain of your root domain,
   which matters here because `aavrit.dedyn.io` carries other subdomains.
5. **Authorized parties** — set `CLERK_AUTHORIZED_PARTIES` to
   `https://presentationbuddy.aavrit.dedyn.io`. The second half of the same
   lock: a compromised subdomain on the shared root then cannot replay a token
   at the API. This is also the value the Clerk dashboard checks when a session
   is presented from another origin.
6. **Session token lifetime** — a short lifetime is fine. `connectSession()`
   proves the session once per user id per tab and the token getters hand the
   clients a fresh token whenever they ask, so nothing mints tokens in a loop.
7. **JWT template for Convex** — Dashboard → **JWT Templates** → new template
   named exactly `convex` (or copy Convex's own template from its dashboard
   setup page). Without it, presence and the activity ticker stay empty; with a
   differently-named template they do too, which is the one silent failure worth
   knowing about here.

> **The CSP must name the production Frontend API.** Development serves Clerk
> from `suitable-bison-4886.clerk.accounts.dev`; with a production instance and
> a root domain it becomes `clerk.aavrit.dedyn.io`. Both are now allowed in
> `public/_headers` and `vercel.json`, in `script-src`, `connect-src` and
> `frame-src`. If Clerk's script is blocked the app does **not** error visibly
> — the 10-second load timeout falls back to signed-out. So if sign-in silently
> does nothing in production, check the console for a CSP violation first.

---

## Deploy

1. Push to GitHub, then **Import Project** in Vercel.
2. Framework preset: **Vite**. Build: `npm run build`. Output: `dist`.
   (`vercel.json` already declares this.)
3. Add every environment variable above.
4. Deploy.

`vercel.json` also sets the security headers — HSTS, CSP, `X-Frame-Options`,
`Referrer-Policy`, `Permissions-Policy` — and the caching rules: hashed
assets immutable for a year, HTML and the service worker always revalidated
so a deploy actually reaches people.

### One deliberate weakness in the CSP

`script-src` includes `'unsafe-inline'`, because Clerk injects a small
bootstrap script. It is the only real gap in the policy. If you want to close
it, the route is a nonce-based CSP generated in Vercel Edge Middleware — which
means moving the headers out of `vercel.json` and into middleware, so it is
left as a follow-up rather than done badly here.

The CSP also has to name your Clerk frontend host
(`suitable-bison-4886.clerk.accounts.dev`). It appears in both `vercel.json`
and `public/_headers`; if you ever move Clerk instances, change it in both.

---

## After deploying

- [ ] `https://your-domain.com/robots.txt` — check the `Sitemap:` line names your domain
- [ ] `https://your-domain.com/sitemap.xml` — 56 URLs, all on your domain
- [ ] Sign in end to end, then like something. If the like fails, either
      Supabase does not yet trust Clerk as a third-party issuer (Dashboard →
      Authentication → Third-party auth → Clerk), or the schema was not applied.
      The app says which, in words — that is what the environment panel is for.
- [ ] Search Console → add property → submit the sitemap
- [ ] Confirm `curl -I https://your-domain.com` shows the security headers

### On ranking

No deploy can promise the top position. Indexing takes weeks, and ranking
depends on backlinks and competition — things no build step controls. What
this setup removes is every *technical* reason a page would be skipped or
ranked down: real prerendered HTML per route, valid structured data
(breadcrumbs on all 56 pages, `Article` on each speech, `FAQPage` and
`HowTo` on the pages that can earn rich results), honest priority signals, and
301s from the old route names so existing rankings carry over.

The rest is content and promotion.


## Short domain — pb.devs.surf (2.6)

Share links are printed as `https://pb.devs.surf/<same path>`. To make them
resolve: add `pb.devs.surf` under Vercel → Project → Settings → Domains,
point its DNS at Vercel as instructed there, and add a domain-level redirect
to `https://presentationbuddy.aavrit.dedyn.io` (301, preserve path). No code
change is needed — the app already generates short links everywhere a link
is shared or copied.
