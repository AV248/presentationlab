# "It redirects back and I am not signed in"

One symptom, four causes. Work down this list — each step takes under a
minute, and step 1 explains most reports.

## 0. The facts the site prints for you

Open the sign-in sheet → **"Trouble signing in? The facts"**. It shows:

| Line | Must read |
| --- | --- |
| Clerk instance | `production (pk_live_)` on a live site |
| Frontend API | the host Clerk serves this site from (e.g. `clerk.aavrit.dedyn.io`) |
| This origin | the address in the address bar |
| Clerk loaded / Session | `true` / `false` while signed out is expected |

If Frontend API ends in `.clerk.accounts.dev`, stop here: the build is on
**development keys** and every later step is wasted effort.

## 1. The build is stale, and its CSP blocks Clerk's bootstrap

The 2.6 CSP did not allow `https://cdn.protect.clerk.com`. Clerk loads a
bootstrap from there; when it is refused the client cannot establish or read
a session — sign-in completes at the provider and evaporates on the way home.

- Console shows: *Refused to load the script … cdn.protect.clerk.com*.
- Fix: deploy the current build (its CSP includes the host, in both
  `vercel.json` and `public/_headers`).

## 2. The site is using development keys (`pk_test_`)

Development instances keep sessions in third-party cookies and hand off
through a dev-browser token. Any browser that blocks third-party cookies —
Safari by default, Chrome in private mode, everything inside an in-app
browser — completes the sign-in and drops it. It also cannot use the
production application you configured providers in.

- Fix: Vercel → Environment Variables → `VITE_CLERK_PUBLISHABLE_KEY` =
  the **pk_live_** value from Clerk's **production** instance → redeploy.
- While there: `clerk.aavrit.dedyn.io` must be verified green under
  Clerk → Domains.

## 3. Clerk does not know this origin

A production instance only accepts sessions for origins it has been told
about.

- Clerk → **Domains** → add `https://presentationbuddy.aavrit.dedyn.io`
  (and `https://pb.devs.surf` if people sign in there). If the app is a
  subdomain of the root the Frontend API sits under, it belongs there as an
  additional/satellite domain — Clerk's **satellite domains** setting must be
  on for the session to be shared.
- Console shows an origin/CORS refusal from Clerk when this is wrong.

## 4. The browser or the network said no

Rule this out deliberately, because it looks identical to 2 and 3:

- Try a **normal** Chrome window (not private), third-party cookies allowed
  for `clerk.aavrit.dedyn.io`, or try Safari/Firefox for contrast.
- Never test inside an in-app browser (Instagram, WhatsApp, Gmail, Facebook).
- An ad blocker or corporate proxy that blocks `clerk.aavrit.dedyn.io` or
  `cdn.protect.clerk.com` produces the same empty round trip.

## Who may become the owner

Ownership is a row — `admins.uid` with `role = 'owner'` — and only an owner may
write one, which used to leave the first one impossible to create from inside
the app. With Postgres the dead end simply does not exist: the database can be
asked directly, once, by the person who owns it.

```sql
select public.bootstrap_owner('<clerk-user-id>', 'amaavrit@yahoo.com');
```

`bootstrap_owner()` grants the owner role **only if no role exists yet**, so it
cannot promote anybody on a site that already has an owner — a stranger who
found the function in the schema gets nothing. Every later role change happens
in the site's own Admin workspace, where the policies take over.

The Firestore version of this needed a founder clause in the rules, and that
clause was the fix for the "Missing or insufficient permissions" dead end. The
same dead end cannot occur here, because there is no rule to write: the first
role is created by the database owner, in the database, and by nobody else.

## Checking the API by hand

Both endpoints are APIs, not pages: they accept **POST** only. Open one in a
browser (a GET) and you get a deliberate, self-describing answer —

```json
{ "error": "method_not_allowed",
  "method": "GET",
  "message": "This endpoint only accepts POST. ..." }
```

— which is still useful news: it proves the function is deployed and running.
Three answers, three meanings:

| Answer | Means |
| --- | --- |
| `405 method_not_allowed` | The function is deployed. Only POST is accepted; end-user traffic does this correctly. |
| `401 missing_session_token` | Deployed **and configured** — everything is present, the request simply had no credentials. |
| `501 clerk_not_configured` | Deployed but `CLERK_SECRET_KEY` is absent; the message names it. |
| `501 clerk_sdk_unavailable` | The function is deployed and configured but **could not load its own SDK** — a packaging fault, not a missing variable. See "The literal-specifier rule" below. |

Those three answers are the whole vocabulary now. The token exchange had two
more — neither of which can happen, because there is no exchange: no
`firebase_admin_not_configured`, no "Firebase Auth refused the custom token",
no credential that could be for the wrong project. That is most of the point of
this switch.

The reading room answers a fourth way, and it is worth knowing because it looks
alarming and is not: `503 library_not_configured` means Turso has not been set
up, so reads are being served from Postgres — the same rows, one hop further
away. The environment panel labels it "not set up (harmless)" for exactly that
reason.

### The literal-specifier rule

A serverless host does not upload `node_modules`; it **traces** the function,
choosing what to ship from the literal string passed to `import()` / `require()`.
Load a package through a computed specifier and it is invisible to that trace:

```js
loadModule<ClerkModule>('@clerk/backend')          // ✗ invisible to the tracer
  → new Function('specifier', 'return import(specifier)')

await import('@clerk/backend')                     // ✓ traced, shipped
```

The endpoint answered `501 clerk_sdk_unavailable` on every request for exactly
this reason, while every local test passed — locally the package is present, so
nothing looks wrong. Measured with the same tracer the host uses:

| How it is loaded | Files pulled into the function |
| --- | --- |
| `require('@clerk/backend')` literal | 30 |
| `import('@clerk/backend')` literal | 63 |
| computed specifier | **1** — i.e. nothing |

`npm run check:api` (`scripts/check-api-trace.mjs`) now fails the build if any
package an endpoint names would not be shipped, so this cannot recur silently.
It is part of `npm run verify`.

## Applying the schema

There is no rules file to deploy and no Firebase CLI to install. The tables,
indexes, policies and counter functions are one file:

```
Supabase → SQL Editor → paste supabase/schema.sql → Run
```

It is idempotent, so re-pasting after a pull that adds a column is the correct
thing to do. To reproduce an endpoint's own answer from a terminal:

```bash
curl -s -o /dev/null -w '%{http_code}\n' -X POST \
  https://presentationbuddy.aavrit.dedyn.io/api/clerk-set-username
```

`401` is the healthy answer — deployed, configured, and correctly refusing a
request with no session. The in-app check (sign-in sheet → **Server-only
variables → Check now**, or **/admin → Setup & environment**) does the same
thing and translates the result.

A `405` in response to the app's own POST is a different matter: something in
front of the function is turning the request into a GET (a redirect rule on
`/api/*`, or a proxy). The Claim page and the environment panel both say so,
because the connection reports `method-rejected` rather than a generic error.

## 5. Proof, whichever way it went

After an attempt, open DevTools → **Application → Cookies →
`https://clerk.aavrit.dedyn.io`**:

- **No `__client` / `__session` cookie** → the session never reached this
  browser: cause 2 or 3.
- **Cookie present, app still says signed out** → the page is talking to a
  different Clerk instance than the one that set it: cause 2.

Clerk → **Logs** is the server side of the same story:

- `session.created` present → Clerk did its job; the browser lost it (2, 3, 4).
- `oauth_callback.failed` → the provider refused; the reason is in the event.
- nothing at all → the frontend never reached Clerk (1, 4).

## Claiming a handle needs the same session

A `handles` row is written under Postgres policies, so it needs the Clerk
session token — the same session the whole app uses, with nothing minted in
between. When that connection is not up, the symptom used to be *"Missing or
insufficient permissions"* on the claim. It is now a sentence: the Claim page
names the cause in the app's own words (the database's message, and the reason
the connection reported), offers to try again, and points at the environment
check in the sign-in sheet.

The four reasons it can give, and what each one means:

| Reason | What is actually wrong |
| --- | --- |
| `not-configured` | No `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` in this build |
| `no-session` | Clerk had not finished signing in when the claim was attempted — try again |
| `unauthorized` | Postgres does not yet trust Clerk as a third-party issuer (Supabase → Authentication → Third-party auth → Clerk) |
| `network` | The request never completed — offline, or something blocked it |

## What the app does about these, in code

- `/sso-callback` is a real, prerendered page that finishes the handshake and
  explains provider refusals in words (`src/pages/SSOCallbackPage.tsx`).
- A marker is set on the way out to a provider; if the round trip returns
  empty, the sign-in sheet says so and names these four causes
  (`src/components/ClerkAuthButtons.tsx`).
- `signInFallbackRedirectUrl` / `signUpFallbackRedirectUrl` are pinned to `/`
  so a flow can never land on a stale or callback URL.
- The CSP allows Clerk's bootstrap and Microsoft's identity hosts.

## The sign-in sheet shows Clerk's own form (2.7)

Clicking *Sign in* renders Clerk's `<SignIn />` component directly
(`routing="hash"`, so it never navigates away from the page). Whatever the Clerk
dashboard enables is exactly what people see; nothing of ours stands in front of
it. The diagnostics panel below it is unchanged.

## Stopping people from *linking* Google or Microsoft (2.7)

Turning a provider off in **Social connections** stops it being offered at
sign-in. It can still appear as a *connected account* inside the profile, because
"can sign in with" and "can link" are separate switches in Clerk:

1. Clerk Dashboard → **User & authentication** → **Social connections**: leave
   Google and Microsoft off for sign-up/sign-in.
2. Clerk Dashboard → **User & authentication** → **User model** →
   **User permissions** → turn **Restrict changes** ON. Restricted users may
   still *view* their identifiers but cannot add, remove or modify them — which
   is what stops a new Google/Microsoft account being attached.
3. The app also hides the *Connected accounts* section in the profile menu
   (`src/components/AuthProvider.tsx`), so the option is not put in front of
   anyone even if a dashboard toggle is missed.

An account that is already linked can be removed in the Clerk dashboard
(Users → the person → Connected accounts).
