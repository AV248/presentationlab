# Deploying Presentation Buddy on Vercel

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

Clerk signs people in. Firestore stores the data, but it cannot validate a
Clerk JWT by itself — so `api/clerk-firebase-token.ts` verifies the Clerk
session with your secret key and mints a Firebase custom token for the same
person. Firestore rules then match on `request.auth.uid`, which is the Clerk
user id. Ads come from a **second, separate** Firebase project that this app
can only read.

```
Browser                Vercel                        Google / Clerk
────────               ──────                        ──────────────
Clerk modal  ────────► Clerk (sign-in)
   │
   └─ session token ─► /api/clerk-firebase-token ──► Clerk: verify
                              │                      Firebase Admin: mint
                              └──── custom token ──► Firebase Auth
                                                          │
                                     request.auth.uid ───┘──► Firestore
```

---

## Environment variables

In Vercel: **Project → Settings → Environment Variables**. Set each for
Production, Preview and Development as appropriate.

### Client-safe — bundled into the browser

These are inlined into the JavaScript that ships to every visitor. Everything
here is genuinely public by design.

| Variable | Value | Notes |
| --- | --- | --- |
| `VITE_SITE_URL` | `https://your-domain.com` | **Set this first.** Canonicals, sitemap URLs, Open Graph URLs and structured data all derive from it. Leave it wrong and Google is told every page is a duplicate of a domain you do not control. No trailing slash. |
| `VITE_CLERK_PUBLISHABLE_KEY` | `pk_live_…` | Clerk Dashboard → API keys. |
| `VITE_FIREBASE_API_KEY` | `AIza…` | Data project (`reflectioncapturedthoughts`). |
| `VITE_FIREBASE_AUTH_DOMAIN` | `reflectioncapturedthoughts.firebaseapp.com` | |
| `VITE_FIREBASE_PROJECT_ID` | `reflectioncapturedthoughts` | |
| `VITE_FIREBASE_STORAGE_BUCKET` | `reflectioncapturedthoughts.firebasestorage.app` | |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | `331335730832` | |
| `VITE_FIREBASE_APP_ID` | `1:331335730832:web:731df65bd40f9646adfa15` | |
| `VITE_FIREBASE_MEASUREMENT_ID` | `G-7NXNZDNDRE` | |
| `VITE_ADS_FIREBASE_API_KEY` | `AIza…` | Ads project (`a-a-v-r-i-t`). |
| `VITE_ADS_FIREBASE_AUTH_DOMAIN` | `a-a-v-r-i-t.firebaseapp.com` | |
| `VITE_ADS_FIREBASE_PROJECT_ID` | `a-a-v-r-i-t` | |
| `VITE_ADS_FIREBASE_STORAGE_BUCKET` | `a-a-v-r-i-t.firebasestorage.app` | |
| `VITE_ADS_FIREBASE_MESSAGING_SENDER_ID` | `633500686388` | |
| `VITE_ADS_FIREBASE_APP_ID` | `1:633500686388:web:61424b21a66487ac1d9261` | |
| `VITE_ADS_FIREBASE_MEASUREMENT_ID` | `G-KW4GG09TBQ` | |

> **Firebase web config values are not secrets.** They identify the project in
> the browser; they cannot read data on their own. What actually protects your
> data is `firestore.rules`. This is why they are safe to publish and why
> putting them behind a "secret" mechanism would be theatre.

### Server-only — never prefix with `VITE_`

| Variable | Value | Notes |
| --- | --- | --- |
| `CLERK_SECRET_KEY` | `sk_live_…` | Verifies sessions before a Firebase token is minted. **Rotate the one you shared.** |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | the whole service-account JSON on one line | Data project only. Needed to mint custom tokens. |
| `CLERK_AUTHORIZED_PARTIES` | `https://presentationbuddy.aavrit.dedyn.io` | **Required** once the Clerk root domain is `aavrit.dedyn.io` — see step 5 below. Without it, a compromised subdomain on the shared root can replay a token here. |

**The rule:** Vite inlines every `VITE_`-prefixed variable into the browser
bundle. Adding that prefix to `CLERK_SECRET_KEY` would publish it to every
visitor who opens devtools.

You do not have to remember this. `npm run verify` runs
`scripts/check-secrets.mjs`, which fails the build if anything secret sits
under a `VITE_` prefix, or if `.env` is still tracked in git:

```
✗ VITE_CLERK_SECRET_KEY is a Clerk secret key but starts with VITE_,
  so it would be bundled into the browser JavaScript.
```

Add `npm run verify` as a CI check so this never reaches production.

### Getting the service account

Firebase console → **Project settings → Service accounts → Generate new
private key**. That downloads JSON containing real newlines inside the
private key, which does not paste cleanly into a single-line field. Pick one:

```bash
# Option A — flatten the newlines (they are already escaped as \n in the file)
node -e "console.log(JSON.stringify(require('./serviceAccount.json')))"

# Option B — base64, which the app accepts with a prefix
base64 -w0 serviceAccount.json      # paste as: base64:eyJ0eXBlIjoi...
```

Until this is set, visitors can still sign in and browse the library — the
token endpoint returns `501` and cloud writes are simply unavailable.

---

## Firestore rules

Two projects, two rule files. Deploying to the wrong one is the single most
likely mistake here.

### Data project — `reflectioncapturedthoughts`

File: `firestore.rules`

```bash
firebase use reflectioncapturedthoughts
firebase deploy --only firestore:rules
```

| Collection | Read | Write |
| --- | --- | --- |
| `presentations` | everyone | author, or admin. Anyone signed in may nudge `views` / `likes` / `dislikes` / `shares` by **1** — see below |
| `reactions` | signed in | only your own; the id must be `<your uid>_<speech id>` |
| `shares` | signed in | only your own |
| `bloggerblogs` | everyone | author, or admin |
| `bloggers` | everyone | yourself, or admin. Others may only move `likesReceived` / `dislikesReceived` (+1) and `points` (+100) |
| `users` | signed in | only your own, and only the seven listed fields |
| `admins` | signed in | **site owner only** — nobody can grant themselves a role |
| `sponsors` | everyone | admin |
| `ads` | admin | **denied** — ads moved to the other project |
| `admin` | signed in | denied |
| anything else | **denied** | **denied** |

Three details worth understanding:

**The counter exception.** A like has to move a number on a document you do
not own. So a signed-in person may change the four public counters — and
`diff().affectedKeys().hasOnly([...])` means that the instant a write touches
the title, body or author, it stops qualifying and the owner check applies
instead. Each counter is also capped at `previous + 1`, so nobody writes
`likes = 10000000`.

**`isSignedIn()` names its providers.** It accepts only tokens minted from a
verified Clerk session, or the legacy Google/Microsoft Firebase providers. If
someone later enables anonymous or email/password auth in the Firebase
console — for testing, or by accident — it grants nothing here. Anonymous
sign-in is a very common way to accidentally give the internet write access.

**The catch-all at the bottom denies everything unnamed**, which is what makes
a typo in a collection name fail closed rather than open.

### Ads project — `a-a-v-r-i-t`

File: `firestore.ads.rules`

```bash
firebase use a-a-v-r-i-t
firebase deploy --only firestore:rules
```

```
match /servingads/{adId} {
  allow read: if true;                        // every visitor sees the ads
  allow create, update, delete: if false;     // no writes from the web, ever
}
match /{document=**} {
  allow read, write: if false;                // default closed
}
```

That is the whole file. This app holds **no write credential** for this
project, so a bug or a compromised key in the main app cannot alter ad
content, and an ad operator's mistake cannot reach presentations or profiles.

### The `servingads` document shape

| Field | Type | Used for |
| --- | --- | --- |
| `Title` | string | headline |
| `Content` | string | full copy |
| `ImageURL` | string (https) | image on the card |
| `DescriptionPreview` | string | one-line teaser |
| `RedirectURL` | string (https) | click destination |

Because this collection is world-readable and edited outside the codebase,
every field is treated as untrusted input. `src/services/ads.ts` parses both
URL fields and requires `http:`/`https:` before either reaches the DOM — so a
document containing `RedirectURL: "javascript:…"` is skipped rather than
rendered. Titles and copy go through React as text, never as HTML.

Ads are labelled "Sponsored" and carry `rel="sponsored noopener noreferrer"`,
which is what keeps paid links from affecting your own rankings.

---

## Clerk setup

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
   at `api/clerk-firebase-token.ts`.
6. **Session token lifetime** — the default is fine. The app re-exchanges
   lazily and caches per user id, so a short lifetime does not cause a storm
   of token mints.

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
- [ ] Sign in end to end, then like something. If the like fails, the service
      account is missing or the rules were not deployed.
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
