# Ads on Presentation Buddy — the comfortable setup

Ads were designed to *sink into* the site rather than interrupt it:
theme-native cards, labelled **Sponsored**, max one per scroll region,
dismissible for the session, loaded only when the browser is idle, and
the slot reserves its space so the page never jumps. No popups, no
autoplay, no interstitials — ever. If the ads project is unreachable or
empty, the slot quietly shows a small house card instead.

## Which account, which project

| | |
| --- | --- |
| **Firebase project** | The **ads project** — `a-a-v-r-i-t` (deliberately *separate* from the data project `reflectioncapturedthoughts`) |
| **Collection** | `servingads` |
| **One document per ad** | Multiple ads = multiple documents; the site rotates them by `weight` |
| **Who can write** | Only you, in the Firebase console (or your ads tooling). The website holds **no write credential** for this project — it is read-only from the browser |

Set the project's web config in Vercel/your `.env` as the `VITE_ADS_FIREBASE_*`
variables (see `.env.example`). Without them, ads simply stay off.

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

## Rules for the ads project (`firestore.ads.rules`)

Public read of `servingads`, everything else denied — four lines. Deploy
that file to the **ads** project only:

```bash
firebase deploy --only firestore:rules --project a-a-v-r-i-t
```

## Comfort checklist (please keep it this way)

- Keep copy honest and human; the card wears the site's own typography.
- One idea per ad, images optional and lightweight (the slot reserves its
  box, but a 3 MB hero still costs your readers' data).
- Pause with `active: false` instead of deleting — your history is useful.
- Never put anything sensitive in a document: the collection is world-readable.
