# Ads on Presentation Buddy — the comfortable setup

Ads were designed to *sink into* the site rather than interrupt it:
theme-native cards, labelled **Sponsored**, max one per scroll region,
dismissible for the session, loaded only when the browser is idle, and
the slot reserves its space so the page never jumps. No popups, no
autoplay, no interstitials — ever. If the collection is unreachable or
empty, the slot quietly shows a small house card instead.

## One project, one collection

| | |
| --- | --- |
| **Firebase project** | The site's own project — `reflectioncapturedthoughts`. No second project, no extra environment variables. |
| **Collection** | `servingads` |
| **One document per ad** | Multiple ads = multiple documents; the site rotates them by `weight` |
| **Who can read** | Everyone — the ad slot is part of the public page |
| **Who can write** | Only a role-holder, per `firestore.rules`. In practice: **you, in the Firebase console**, which bypasses rules. The website itself has no write path to this collection |

Until 2.6.2 these documents lived in a separate project (`a-a-v-r-i-t`). The
isolation that mattered — the app cannot write ads — is now a single rule
instead of an entire second project:

```
match /servingads/{adId} {
  allow read: if true;                        // every visitor sees the ads
  allow write: if isAdmin();                  // never the web app
}
```

That rule ships with `firestore.rules`, so `firebase deploy --only
firestore:rules` is the only deploy involved.

## Document fields

Create a document in `servingads` (auto-ID is fine) with any of:

| Field | Type | Required | Notes |
| --- | --- | --- | --- |
| `Title` | string | ✅ | The headline. An ad without one is skipped. |
| `RedirectURL` | string | ✅ | Where a click goes. Must be `http(s)://…` (or a site path like `/rehearse`). `javascript:` and friends are rejected and the ad is skipped. |
| `DescriptionPreview` | string | – | One-line teaser shown on the card (falls back to the start of `Content`). |
| `Content` | string | – | Full body copy, used by the wider rail card. |
| `ImageURL` | string | – | Optional `https` image. Ads without images render as clean text cards — often the most comfortable kind. |
| `CTA` | string | – | Button words; defaults to “Learn more”. |
| `weight` | number | – | Rotation weight (default 1). Higher = shown more often. |
| `active` | boolean | – | Set `false` to pause an ad without deleting it. |

Lowercase spellings (`title`, `url`, `imageUrl`, …) are also accepted.

## Moving ads over, if any exist in the old project

1. Open the old project (`a-a-v-r-i-t`) → Firestore → `servingads`. For each
   document, copy its field values out (five per ad, usually).
2. In `reflectioncapturedthoughts` → Firestore → **Start collection** →
   collection id `servingads` → **Auto-ID** → paste the fields → Save.
3. Reload the site. If an ad does not appear, check that `Title` and
   `RedirectURL` are present and that the URL starts with `https://`.
4. Once the new collection is serving, delete the old project (or leave it
   dormant — nothing reads it any more).

To copy many documents at once, either use the console's import/export
(Google Cloud Storage) or run once, with the CLI:

```bash
# export from the old project
gcloud firestore export gs://<bucket>/ads-backup --project a-a-v-r-i-t \
  --collection-ids=servingads

# import into the data project
gcloud firestore import gs://<bucket>/ads-backup --project reflectioncapturedthoughts
```

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
