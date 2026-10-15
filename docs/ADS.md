# Ads on Presentation Buddy — the comfortable setup

Ads were designed to *sink into* the site rather than interrupt it:
theme-native cards, labelled **Sponsored**, max one per scroll region,
dismissible for the session, loaded only when the browser is idle, and
the slot reserves its space so the page never jumps. No popups, no
autoplay, no interstitials — ever. If the collection is unreachable or
empty, the slot quietly shows a small house card instead.

## One database, one table

| | |
| --- | --- |
| **Database** | The site's own Postgres — the same one as everything else. No second project, no extra environment variables. |
| **Table** | `ads` (the app still calls the collection `servingads`, from v1) |
| **One row per ad** | Several ads = several rows; the site rotates them by `weight` |
| **Who can read** | Everyone — the ad slot is part of the public page |
| **Who can write** | Only a role-holder, per the `ads` policies in `supabase/schema.sql` |

Until 2.6.2 these documents lived in a second Firebase project (`a-a-v-r-i-t`),
and the isolation that mattered — *the site cannot let a stranger write an ad* —
turned out to be one policy rather than an entire project:

```sql
-- every visitor sees the ads; only a role-holder may change one
create policy ads_read  on public.ads for select using (true);
create policy ads_write on public.ads for all    using (public.is_admin());
```

Two places can now edit an ad, and both are deliberate:

1. **The site itself** — `/admin` → *Ads*. Create, edit, delete: title, teaser,
   body, image, destination, weight. Title and content are the whole requirement;
   the image and the link are optional, and may be left empty.
2. **Supabase → Table editor** — for a bulk change or a repair. This bypasses
   the policies, exactly as the Firebase console did.

## Row fields

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `Title` | string | ✅ | The headline. An ad without one is skipped. |
| `Content` | string | ✅ | The body copy. |
| `RedirectURL` | string | – | Where a click goes. Must be `http(s)://…` (or a site path like `/rehearse`). `javascript:` and friends are rejected and the ad is skipped. Leave it empty for an ad that only says something. |
| `DescriptionPreview` | string | – | One-line teaser shown on the card (falls back to the start of `Content`). |
| `ImageURL` | string | – | Optional `https` image. Ads without images render as clean text cards — often the most comfortable kind. |
| `CTA` | string | – | Button words; defaults to “Learn more”. |
| `weight` | number | – | Rotation weight (default 1). Higher = shown more often. |
| `active` | boolean | – | Set `false` to pause an ad without deleting it. |

Lowercase spellings (`title`, `url`, `imageUrl`, …) are also accepted — the
column mapping is in one file, and it accepts both.

In SQL, a row looks like this:

```sql
insert into public.ads (title, preview, body, redirect_url, weight, active)
values ('Sunrise Yoga — first class free',
        'Six mornings that will change your posture.',
        '…', 'https://example.com/yoga', 2, true);
```

### Bringing the old ads across

`npm run migrate:firestore` carries `servingads` over with everything else — the
field names above are already the ones it looks for, so there is nothing to do
by hand. If there are no ads, it writes none and says so.

## Example (no image)

```
Title:              Sunrise Yoga — first class free
DescriptionPreview: Six mornings that will change your posture.
Content:            …
RedirectURL:        https://example.com/yoga
CTA:                Book a mat
weight:             2
active:             true
```

## Comfort checklist (please keep it this way)

- Keep copy honest and human; the card wears the site's own typography.
- One idea per ad, images optional and lightweight (the slot reserves its
  box, but a 3 MB hero still costs your readers' data).
- Pause with `active: false` instead of deleting — your history is useful.
- Never put anything sensitive in a document: the collection is world-readable.
- Changes take up to **ten minutes** to appear for a returning visitor — the
  browser caches the list, and that cache is what keeps ads from costing
  every page load. The admin **Ad desk** shows whatever the browser has.

## Why a change appears within a minute

The browser caches the ad list, which is what keeps ads from costing a request
on every page load. Two things once made an edit look like it never saved:

- the cache lived for **ten minutes** (now one minute, and saving clears it
  outright), and
- the read could be served from a local cache (now it always asks the database).

Both are fixed. If an ad still does not appear, the environment panel and the
**Ads** tab will tell you whether the row is `active`, whether this browser is
seeing the cached list, and whether the database is configured at all.
