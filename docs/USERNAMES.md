# Usernames: one per person, unchangeable, set in Clerk

A username is the person's address on the site — `pb.devs.surf/<username>` —
and the space their work lives in beneath it. It is a claim for life, so the
app is built to make changing it impossible rather than merely discouraged.

## Who owns what

| | |
| --- | --- |
| **Clerk** | Owns the username. It appears in Manage Account, it is what `/claim` pre-fills, and it is what the app writes when a name is claimed. |
| **Firestore `handles/{username}`** | The uniqueness lock for the *site*. The document id **is** the username, so two people cannot hold the same address — the second write fails by construction. Create-only. |
| **Firestore `users/{uid}.username`** | The mirror the site reads to show `@name` in the sidebar, and to resolve `/username` without a lookup by email. |

## Three layers of immutability

1. **Clerk's own setting.** Clerk Dashboard → **User & authentication** →
   User model → User permissions → turn **off** *"Allow users to change their
   username"*. End users then cannot add, modify or remove it from any
   front-end surface — Clerk refuses with
   `immutable_attribute_modification_not_allowed`:
   *"Your username is immutable and cannot be modified or removed."*
   That message is the guarantee working, not a bug.
2. **This app's server.** `/api/clerk-set-username` (secret key backed) reads
   the current username first and refuses to overwrite it, refuses to remove
   it (an empty value is a `400`), and validates the shape before writing.
   Only the first, null → value write ever succeeds.
3. **Firestore.** `handles/{username}` cannot change ownership (rules compare
   the stored `uid`), and `claimUsername()` refuses a second, different
   username for the same account.

## How claiming works

1. Someone signs in. If Clerk already holds a username (set in Manage Account,
   or by an administrator), `/claim` opens with the field **pre-filled**; the
   person confirms and adds the details they want to share.
2. If Clerk holds nothing, the field is theirs to choose. On confirm the app:
   - asks `/api/clerk-set-username` to write it in Clerk. **This works even
     with layer 1 switched on**, because the write is performed with the
     secret key — Clerk documents that administrators retain full control of
     identifiers through the Backend API. The front-end path (`user.update`)
     is kept only as a fallback for local development or a host without the
     function, and *that* is the path Clerk refuses when changes are
     restricted.
   - then creates `handles/{username}` and mirrors the profile into
     `users/{uid}`.
3. From then on the sidebar shows **@username** instead of "Claim your
   username", on every device: the app restores the claimed handle from
   Firestore on each sign-in.

## If a username genuinely must change

It is deliberately awkward, and it takes an owner:

1. Clerk Dashboard → **Users** → the person → change the username.
2. Firestore → delete `handles/{old-username}` and clear (or correct)
   `users/{uid}.username`.
3. The person signs in again and claims the new name — the old one becomes
   available to nobody until it is claimed again, so do step 3 promptly if you
   want to keep it out of circulation.

Never do this to recycle a name as a marketing move: links, shares and
canonical URLs already point at the old address.

## Troubleshooting

| What you see | What it means | What to do |
| --- | --- | --- |
| *"Your username is immutable and cannot be modified or removed."* | Clerk's Restrict-changes layer doing its job — the **front-end** write was refused | Nothing, if it came from the Manage Account UI. If it came from claiming, the server path is not deployed or `CLERK_SECRET_KEY` is missing, so the app fell back to the browser SDK |
| `username_taken` | Clerk already has that username on another account | Choose another — the site checks Firestore first, so this is usually a stale race |
| `username_invalid` | Shape rejected (3–30 characters; lowercase letters, digits, `-`, `_`; must start and end with a letter or digit) | Fix the name in the form |
| `501 clerk_not_configured` | `CLERK_SECRET_KEY` is not set in Vercel (or it carries a `VITE_` prefix, which would be a leak) | Add it without the prefix, then redeploy |
| `401 missing_session_token` / `invalid_session_token` | No session, or `CLERK_AUTHORIZED_PARTIES` does not include the origin you are on | Check the origin in that variable, and sign in again |
| `clerk_unreachable` / `502 username_update_failed` | Clerk was not reachable, or refused for a reason only the logs show | Retry; the server logs the Clerk error code |

## What is deliberately *not* here

- **No username in the local profile alone.** A name that exists only in the
  browser cannot be a site-wide address, so the local store mirrors the claim
  rather than owning it.
- **No rename UI.** There is no screen anywhere in the product that offers to
  change a username, because there is no supported way to do it.
- **No admin "release" button.** Changing a handle means touching Clerk and
  two Firestore documents in the right order — a job for the console, not for
  a button that could be pressed by accident.
