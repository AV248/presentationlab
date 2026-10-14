# How data is organised in Firestore (2.6.2)

One project — `reflectioncapturedthoughts` — holds everything: people,
their work, and the ads. Deploy `firestore.rules` to it and you are done.

(Until 2.6.2 there was a second project for `servingads`. The separation it
provided is now enforced by the rule on that collection instead: public read,
role-holder write, and the web app holds no write path at all.)

## Collections

| Collection / doc | Holds | Written by |
| --- | --- | --- |
| `presentations/{id}` | Published speeches: `Title`, `Content`, `Preview`, `Category`, `Occasion`, `Tags`, `Author`, `uid`, `username`, `slug`, `Credits`, `Signature`, `allowCopy`, counters `views/likes/dislikes/shares`, `Date`, timestamps | The author (signed in); counters by any signed-in reader, ±1 only |
| `handles/{username}` | **The username lock**: `{ uid, username, updatedAt }`. Doc id *is* the username (lowercase), so uniqueness is structural. Create-only for its claimer; never re-pointable | `/claim`, once per user, forever |
| `users/{uid}` | Public profile mirror: `uid`, `email`, `displayName`, `photoURL`, `providerId`, `username`, `bio`, `location`, `website`, `signature`, `lastSeen`, `createdAt` | The user themselves |
| `bloggers/{uid}` | Leaderboard tallies: `name`, `likesReceived`, `dislikesReceived`, `points` (+1 per like, −1 per 3 dislikes) | Reaction transactions |
| `reactions/{uid}_{speechId}` | One like/dislike per person per speech: `{ uid, speechId, kind }` | Signed-in readers |
| `shares/{id}` | One record per share: `{ uid, speechId }` | Signed-in sharers |
| `bloggerblogs/{id}` | Open-mic notes | Signed-in posters |
| `feedback/{id}` | **Central feedback**: `{ rating (1–5 int), text, uid|null, path, createdAt }`. Anyone may create; only admins may read | The feedback dialog (queued locally first, flushed when the cloud is reachable) |
| `siteSettings/theme` | `{ festivalId, updatedAt }` — the owner-only festival layer | Owner, from Admin → Site theme |
| `servingads/{id}` | Ad documents: `Title`, `Content`, `ImageURL`, `DescriptionPreview`, `RedirectURL`, `CTA`, `weight`, `active`. Read by everyone; written only by role-holders (in practice: the Firebase console) | Owner/admin |
| `admins/{uid}` | Roles: `{ role: 'owner' | 'admin' }` | Owner only |
| `sponsors/{id}` | Optional sponsor slots | Admins |
| `admin/{id}` | Legacy v1 e-mail allow-list, read-only | Nobody (kept for compatibility) |

The username itself **lives in Clerk**; `handles` + `users.username` are
its Firestore reflection so `/username` and `/username/content` resolve.
One user ↔ one username, and it cannot be changed (enforced in the
client, the Clerk bridge, and `claimUsername`).

## Invariants the rules enforce

- Default-deny: anything not listed above cannot be read or written.
- Counters move by at most ±1 per write and never below zero.
- A speech's body/ownership can only change for its author (or an admin);
  everyone else may touch counters only (`diff().affectedKeys()`).
- Feedback is write-only for the public: stars land safely even signed
  out, and only role-holders can ever read them back.
