# Microsoft (Entra ID) sign-in

Presentation Buddy signs people in with **Clerk**, and Clerk talks to
Microsoft on our behalf. That means there is *one* Microsoft app
registration — "AAVRIT's Presentation Buddy", `42813fd8-36d6-4566-b3d2-9aa6083dda1b`
— and it belongs to Clerk, not to the website. The site never holds a
Microsoft client secret; Clerk does.

Read this alongside the manifest Entra shows you. The fields below are the
ones that matter, what they must be, and the two places they are edited:
**Clerk's dashboard** (the connection) and **Entra** (the app).

## The short version

| Field | Must be | Where it is edited |
| --- | --- | --- |
| Redirect URI (web) | `https://clerk.aavrit.dedyn.io/v1/oauth_callback` | Entra → Authentication |
| Supported account types | Work + personal, i.e. Clerk's Microsoft connection on tenant `common` | Clerk → SSO connections → Microsoft |
| Client secret | The one Clerk generated, renewed before 2028-10-13 | Entra → Certificates & secrets |
| API permission | `User.Read` (delegated) + admin consent | Entra → API permissions |
| Home page / branding | `https://presentationbuddy.aavrit.dedyn.io` | Entra → Branding |

Two things in the manifest as it arrived **are wrong**, and both are small:
the privacy and terms URLs are the wrong way round, and the lock
configuration stops the app being edited in the portal at all. Fix both
first — the second one blocks everything else.

## Fix 1 — unlock the app so it can be edited

`servicePrincipalLockConfiguration` is `isEnabled: true, allProperties: true`,
which greys out the properties in the portal. Clear it once with Graph
(Application Administrator, or Global Administrator):

```powershell
Connect-MgGraph -Scopes 'Application.ReadWrite.All'

$objectId = (Get-MgApplication -Filter "appId eq '42813fd8-36d6-4566-b3d2-9aa6083dda1b'").Id

Invoke-MgGraphRequest -Method PATCH `
  -Uri "https://graph.microsoft.com/v1.0/applications/$objectId" `
  -Body (@{ servicePrincipalLockConfiguration = @{ isEnabled = $false } } | ConvertTo-Json -Depth 5)
```

If that property is rejected on v1.0 (it is beta-adjacent), use
`https://graph.microsoft.com/beta/applications/$objectId`. In the portal the
same switch is on the app's **Properties** page. The lock was set by the
automation that created the app; nothing in Clerk depends on it.

## Fix 2 — the branding links are swapped

`privacyStatementUrl` points at the terms file and `termsOfServiceUrl` at the
privacy file. Microsoft shows both on the consent screen, so this is the one
place a visitor will notice:

```powershell
Invoke-MgGraphRequest -Method PATCH `
  -Uri "https://graph.microsoft.com/v1.0/applications/$objectId" `
  -Body (@{
    info = @{
      privacyStatementUrl = 'https://aavrit.dedyn.io/privacypolicy.pdf'
      termsOfServiceUrl  = 'https://aavrit.dedyn.io/terms+conditions.pdf'
      marketingUrl       = 'https://presentationbuddy.aavrit.dedyn.io'
      supportUrl         = 'mailto:amaavrit@yahoo.com'
    }
  } | ConvertTo-Json -Depth 5)
```

## Fix 3 — redirect URIs

The consent round trip ends at exactly one address, which is already
registered and correct for Clerk:

```
https://clerk.aavrit.dedyn.io/v1/oauth_callback
```

That is the only callback this app needs. There is no Firebase handler to add,
because there is no Firebase: Clerk is the only identity provider, and it is the
one holding the client id and secret.

```powershell
Invoke-MgGraphRequest -Method PATCH `
  -Uri "https://graph.microsoft.com/v1.0/applications/$objectId" `
  -Body (@{ web = @{ redirectUris = @(
    'https://clerk.aavrit.dedyn.io/v1/oauth_callback'
  ) } } | ConvertTo-Json -Depth 5)
```

If a Firebase handler is still listed, removing it is safe and tidy. The Clerk
callback must never be dropped — losing it breaks every Microsoft sign-in with
`redirect_uri_mismatch`.

## Fix 4 — permissions and consent

`User.Read` (delegated, id `e1fe6dd8-…`) is right: Clerk asks for `openid`,
`profile`, `email` and `offline_access` on top, which need no consent entry.
Two things to check:

1. **Grant admin consent** in **API permissions** so work/school tenants do
   not stop at "Need admin approval" (`AADSTS65001`).
2. **Enterprise applications → AAVRIT's Presentation Buddy → Properties →
   "Assignment required?" = No**, otherwise only assigned accounts may use it
   even though the sign-in itself is valid.

## Fix 5 — the Clerk side (this is the part people miss)

1. Clerk dashboard → **SSO connections → Microsoft → Use custom credentials**
   (or the shared one). Paste the **client ID** `42813fd8-…` and the client
   secret value.
2. **Tenant**: `common` — the app is `AzureADandPersonalMicrosoftAccount`, so
   `common` is the only tenant that accepts both work and personal accounts.
   A single-tenant connection fails personal accounts with `AADSTS50020`.
3. Keep the secret's expiry in view: **2028-10-13**. Calendar it; a dead
   secret is `invalid_client` at the provider, which looks like a random
   failure to visitors.
4. Ensure `https://presentationbuddy.aavrit.dedyn.io` (and your preview
   URL) are in Clerk's **Allowed origins**. Clerk's own domain,
   `clerk.aavrit.dedyn.io`, must have its CNAME live — the callback address
   above has to resolve.

## How the site drives it

`src/components/ClerkAuthButtons.tsx` names Google and Microsoft and starts a
**redirect** flow (`signIn.authenticateWithRedirect`). Clerk returns to
`/sso-callback`, which is a real, prerendered page
(`src/pages/SSOCallbackPage.tsx`) so no host can 404 the handshake; it finishes
the exchange, then returns the person to the page they left. Errors arrive as
URL parameters and are translated into sentences — including the provider
codes above — instead of a silent bounce.

Nothing about Microsoft is configured in this repository's env. There is no
`MICROSOFT_CLIENT_ID` or secret to add, ever: those live only in Clerk and
Entra. The only related change here is the Content Security Policy in
`next.config.ts`, which allows Microsoft's identity hosts (`*.msftauth.net`,
`*.msauth.net`, `login.microsoftonline.com`, `login.live.com`,
`aadcdn.msftauth.net`, `logincdn.msauth.net`) so the consent screen and its
assets are not blocked. Keep that as the active CSP source; do not add a
conflicting policy in a second host configuration.

## The one error almost everybody hits: `unauthorized_client … not enabled for consumers`

That message is rendered by **Microsoft's own sign-in page**. It arrives *before*
Clerk and before the website: the browser was sent to Microsoft, Microsoft
refused, and nothing came back. Our code and the CSP have no part in it.

It means one thing: **the app behind the client ID that was sent is not
enabled for personal (consumer) Microsoft accounts.** There are only two ways
to earn it:

| Cause | Check | Fix |
| --- | --- | --- |
| **The wrong identifier was pasted into Clerk.** The Entra Overview page shows two GUIDs — *Application (client) ID* and *Object ID* — and *Certificates & secrets* shows a third, the *Secret ID*. Only the **Application (client) ID** is the client ID. Pasting the Secret ID gives exactly "the client does not exist". | Compare the Client ID in Clerk's Microsoft connection with the app's *Application (client) ID* (`42813fd8-…`). | Re-paste the Application (client) ID; re-paste the secret **Value** (not the Secret ID). |
| **The app registration genuinely excludes personal accounts.** Some registrations (especially ones created by automation) end up organisational-only, and editing is blocked by a lock configuration. | Entra → Authentication → *Supported account types* = "Accounts in any organizational directory … **and personal Microsoft accounts**". | Set it (and unlock the app first if the option is greyed out — see "Fix 1"), or build a fresh registration as below. |

Two facts from Clerk's own documentation make the rest of the configuration
simple:

- Clerk uses the **`common`** authority only — which is precisely what an
  `AzureADandPersonalMicrosoftAccount` app needs. There is no tenant field to
  get wrong, and `organizations`/`consumers` are not supported.
- Production instances **must** use custom credentials; only **secret**-type
  credentials are supported (never certificates).

If the client ID and secret are right but the refusal persists, rebuild the
registration — five minutes, deterministic:

1. Sign in to **entra.microsoft.com** as an administrator of *your* tenant.
2. **App registrations → New registration**; name it `Presentation Buddy (Clerk)`.
3. Supported account types: **Accounts in any organizational directory
   (multitenant) and personal Microsoft accounts (e.g. Skype, Xbox)**.
4. Redirect URI → platform **Web** → paste the exact **Authorized Redirect
   URI** shown in Clerk's Microsoft connection panel
   (`https://clerk.aavrit.dedyn.io/v1/oauth_callback`).
5. **Register**, then copy the **Application (client) ID** from Overview.
6. **Certificates & secrets → New client secret**; copy the **Value** at once
   (it is shown once; the hint is its first three characters).
7. **API permissions → Microsoft Graph → Delegated → `User.Read` → Add**, then
   **Grant admin consent**.
8. **Enterprise applications → this app → Properties → "Assignment
   required?" = No.**
9. Paste the new client ID and secret into Clerk's Microsoft connection, Save.
10. Sign out of the site and of Microsoft, then retry in a private window.

Keep the old registration for a week, then delete it and its enterprise
application. The automated one also carries the swapped privacy/terms links
and the portal lock — nothing worth preserving.

## Troubleshooting, in the words you will actually see

| What you see | What it means | Fix |
| --- | --- | --- |
| `redirect_uri_mismatch` | The callback is not in the Entra list | Fix 3 |
| `AADSTS50020` | Personal account refused by a single-tenant connection | Clerk tenant → `common` |
| `AADSTS65001` / "Need admin approval" | Consent not granted | Fix 4.1 |
| `AADSTS700016` | App not found in that tenant (wrong tenant id in Clerk) | Clerk tenant → `common` |
| `invalid_client` | Secret expired/rotated and not re-pasted into Clerk | Clerk → SSO → Microsoft → re-paste secret |
| `access_denied` | Org policy, or the account lacks assignment | Fix 4.2 |
| `unauthorized_client` / "not enabled for consumers" | Wrong identifier in Clerk (Secret ID or Object ID instead of the Application (client) ID), or an app that excludes personal accounts | See the section above |
| "This account is not allowed" in Entra | `Assignment required?` is on | Fix 4.2 |
| Sign-in works, then the site still says signed out | The Clerk session cookie is missing or was set for a different Clerk instance | Check the cookie under `clerk.aavrit.dedyn.io`, and that `VITE_CLERK_PUBLISHABLE_KEY` belongs to the instance you configured |
| Username keeps being asked for | The username is set in Clerk but not claimed here | `/claim` opens pre-filled — confirm it once; usernames are permanent |
