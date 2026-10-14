# Environment checklist — setting Presentation Buddy up from zero

Everything the deployment reads, in the order to add it. Delete nothing until
this list is complete: a half-configured environment is the one state that
*looks* broken in a dozen unrelated ways.

**Two rules**

1. **`VITE_` means public.** Vite inlines every `VITE_` variable into the
   JavaScript bundle at build time. Values under that prefix must be safe for
   any visitor to read. The three credentials at the bottom must never carry it
   (the repo's `npm run audit:secrets` fails the build if they do).
2. **Changing any `VITE_` variable requires a redeploy.** Vercel does not
   rebuild because a variable changed; the value is baked in when the bundle is
   built. Save → *Redeploy*.

You can verify the whole thing without leaving the site: open the sign-in sheet
(there is a **"Trouble signing in? The facts"** section) or, as an
administrator, **/admin → Setup & environment**. The panel shows every variable
as `set` / `missing` / `wrong`, names what breaks without it, and asks the API
for its own verdict on the server-only three.

---

## Quick reference — name, type, where the value comes from

**Type** is the Vercel setting: *Plain* = ordinary variable (these all end up in
the browser bundle, so hiding them only makes life harder); *Sensitive* = masked
and encrypted, for credentials. Everything starting `VITE_` is Plain by
definition — the value is inlined into the JavaScript every visitor downloads.

| # | Variable | Type | Value comes from |
| --- | --- | --- | --- |
| 1 | `VITE_CLERK_PUBLISHABLE_KEY` | Plain | Clerk → production instance → API keys → *Publishable key* (`pk_live_…`) |
| 2 | `VITE_SITE_URL` | Plain | `https://presentationbuddy.aavrit.dedyn.io` (literal, no trailing slash) |
| 3 | `VITE_FIREBASE_API_KEY` | Plain | Firebase console → data project → Project settings → Your apps → Web app → Config |
| 4 | `VITE_FIREBASE_AUTH_DOMAIN` | Plain | same Config box |
| 5 | `VITE_FIREBASE_PROJECT_ID` | Plain | same Config box |
| 6 | `VITE_FIREBASE_STORAGE_BUCKET` | Plain | same Config box |
| 7 | `VITE_FIREBASE_MESSAGING_SENDER_ID` | Plain | same Config box |
| 8 | `VITE_FIREBASE_APP_ID` | Plain | same Config box |
| 9 | `VITE_FIREBASE_MEASUREMENT_ID` | Plain | same Config box (optional) |
| 10 | `CLERK_SECRET_KEY` | **Sensitive** | Clerk → production instance → API keys → *Secret key* (`sk_live_…`) |
| 11 | `CLERK_AUTHORIZED_PARTIES` | Plain | `https://presentationbuddy.aavrit.dedyn.io,https://pb.devs.surf` |
| 12 | `FIREBASE_SERVICE_ACCOUNT_JSON` | **Sensitive** | Firebase console → **data** project → Project settings → Service accounts → *Generate new private key* (whole JSON, one line) |

Add them in the **Production** environment (tick **Preview** too if you want a
working sign-in on preview deployments). Then **redeploy** — `VITE_` values are
baked in at build time.

## Where each value comes from

### 1. Clerk (sign-in, sessions, usernames)

| Variable | Value | Where |
| --- | --- | --- |
| `VITE_CLERK_PUBLISHABLE_KEY` | `pk_live_…` | Clerk Dashboard → **production** instance → API keys → *Publishable key* |

Use the **production** instance (the one that owns `clerk.aavrit.dedyn.io`),
and its **live** key. A `pk_test_` key on a live domain is the most common cause
of "it redirects back and I am not signed in": development sessions live in
third-party cookies, which browsers block. The audit panel flags this
explicitly rather than letting you guess.

### 2. Firebase, the DATA project

Firebase console → **Project settings → Your apps → Web app → SDK setup and
configuration → Config**. Copy the seven values exactly.

| Variable | Example shape |
| --- | --- |
| `VITE_FIREBASE_API_KEY` | `AIza…` |
| `VITE_FIREBASE_AUTH_DOMAIN` | `<project>.firebaseapp.com` |
| `VITE_FIREBASE_PROJECT_ID` | `reflectioncapturedthoughts` |
| `VITE_FIREBASE_STORAGE_BUCKET` | `<project>.appspot.com` |
| `VITE_FIREBASE_MESSAGING_SENDER_ID` | digits |
| `VITE_FIREBASE_APP_ID` | `1:…:web:…` |
| `VITE_FIREBASE_MEASUREMENT_ID` | `G-…` (optional) |

These are **public by design** — they identify the project, they do not
authorise anything. Access control is `firestore.rules`, which is why deploying
those rules is not optional.

### 3. The site itself

| Variable | Value |
| --- | --- |
| `VITE_SITE_URL` | `https://presentationbuddy.aavrit.dedyn.io` — no trailing slash |

Canonical tags, sitemap URLs, Open Graph and structured data all derive from
this. Get it wrong and search engines see every page as a duplicate of a domain
you do not own. The audit panel compares it against the origin actually serving
the page.

### 4. Ads — no variables

Ad documents live in `servingads` **inside the data project**, so they arrive
with group 2. Create the collection in the Firebase console and add documents
to it; `docs/ADS.md` has the field shape. Without them the site shows house
ads and is completely healthy.

### 5. Server-only (no `VITE_` prefix)

Read by `api/clerk-firebase-token.ts` and nothing else. They never reach the
browser.

| Variable | Value | Where |
| --- | --- | --- |
| `CLERK_SECRET_KEY` | `sk_live_…` | Clerk → production instance → API keys → *Secret key* |
| `CLERK_AUTHORIZED_PARTIES` | `https://presentationbuddy.aavrit.dedyn.io` | your own knowledge — comma-separated origins allowed to trade a session for a Firebase token. Add `https://pb.devs.surf` too if people sign in there. |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | the whole service-account JSON on **one line** | Firebase console → Project settings → Service accounts → *Generate new private key* |

Notes:

- If your tooling mangles the newlines, base64-encode the file
  (`base64 -w0 service.json`) and prefix the value with `base64:`.
- If any of these three is ever pasted somewhere public, rotate it: Clerk →
  API keys → *Rotate*; Firebase → delete the service-account key and create a
  new one.

---

## The order to do it in

1. Add the Clerk pair (publishable in group 1, secret in group 5).
2. Add the seven data-project values (group 2).
3. Add `VITE_SITE_URL` (group 3).
4. Add the three server-only values (group 5).
5. Firebase console (data project): **Firestore Database → create** if it does
   not exist, and deploy the rules: `firebase deploy --only firestore:rules`.
6. Clerk dashboard: **Domains** shows the production domain verified; **SSO
   connections** has Google and Microsoft enabled *in the production instance*.
7. Redeploy. (Any `VITE_` change needs a fresh build.)
8. Verify: open the site → sign-in sheet → *Trouble signing in? The facts* →
   every group should read **complete**; then **/admin → Setup & environment**
   → **Check now** → *"Ready: the endpoint is deployed and both server
   variables are in place."*

## What breaks, specifically, without each group

| Missing | What you will see |
| --- | --- |
| Clerk key | Sign-in sheet says sign-in is not switched on; the app is fully local; reactions and publishing unavailable |
| `pk_test_` key on a live domain | Providers complete and land back signed out; configured provider credentials appear to be ignored |
| Data project | Library shows only local speeches; nothing publishes; no reactions, roles, leaderboard or feedback to Firestore |
| `VITE_SITE_URL` | Canonical/OG/sitemap URLs point at the wrong origin |
| `servingads` collection absent or empty | House ads only — no error, by design |
| `CLERK_SECRET_KEY` | Sign-in works (Clerk is client-side) but `request.auth.uid` never exists, so Firestore refuses all writes |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | Same as above, plus `/api/clerk-firebase-token` answers `501 firebase_admin_not_configured` |
| `CLERK_AUTHORIZED_PARTIES` | The token endpoint refuses the exchange for origins it was not told about (401) |

## Deleting secrets does not delete data

Environment variables are the site's *keys*, not its *contents*. Every speech,
profile, handle, reaction and piece of feedback lives in the Firestore data
project and is untouched by clearing Vercel. Re-adding the values restores
access to exactly the data that was there.
