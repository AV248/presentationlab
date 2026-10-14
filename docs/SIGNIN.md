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
| `501 clerk_not_configured` / `firebase_admin_not_configured` | Deployed but missing a server variable; the message names which one. |

To reproduce the site's own call from a terminal:

```bash
curl -s -X POST https://presentationbuddy.aavrit.dedyn.io/api/clerk-firebase-token \
  -H 'Content-Type: application/json' -d '{}'
```

`{"error":"missing_session_token"}` (401) is the healthy answer. The in-app
check — sign-in sheet → **Server-only variables → Check now**, or
**/admin → Setup & environment** — does exactly this and translates the result.

A `405` in response to the app's own POST is a different matter: something in
front of the function is turning the request into a GET (a redirect rule on
`/api/*`, or a proxy). The Claim page and the environment panel both say so,
because the exchange reports `method-rejected` rather than a generic error.

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

## Claiming a handle needs the same cloud session

`handles/{username}` is written under Firestore rules, so it needs the custom
token from `/api/clerk-firebase-token` — the same chain described above. When
that chain is broken the symptom is *"Missing or insufficient permissions"* on
the claim, not an obvious auth message. The Claim page now names the cause
(from the token exchange's own reason), offers to retry the connection, and
points at the environment check in the sign-in sheet.

## What the app does about these, in code

- `/sso-callback` is a real, prerendered page that finishes the handshake and
  explains provider refusals in words (`src/pages/SSOCallbackPage.tsx`).
- A marker is set on the way out to a provider; if the round trip returns
  empty, the sign-in sheet says so and names these four causes
  (`src/components/ClerkAuthButtons.tsx`).
- `signInFallbackRedirectUrl` / `signUpFallbackRedirectUrl` are pinned to `/`
  so a flow can never land on a stale or callback URL.
- The CSP allows Clerk's bootstrap and Microsoft's identity hosts.
