# SEO launch playbook — presentationbuddy.aavrit.dedyn.io

Everything the site needs technically is already built into version 2.4.
This file is the short, ordered list of what **you** need to do outside the code.

---

## 0. Understand why indexing "completed" but nothing shows

The version that is live today is the old client-rendered app: one page, one title,
one description, and content that only exists after JavaScript runs. Google indexed that
one thin page and found nothing to rank.
**Version 2.4 fixes this on the code side: 57 real HTML pages, each with its own title,
description, canonical URL, social cards and structured data.** Ranking will follow the
deploy, not precede it.

## 1. Deploy the new build (the single most important step)

From the repo:

```bash
npm install
npm run build        # bundle + 32 share cards + 57 prerendered pages + sitemap
```

Upload **the contents of `dist/`** to the site root of
`https://presentationbuddy.aavrit.dedyn.io` (replace the old files).
If you add files through the GitHub web UI instead, they are also committed in the
repository: `public/sitemap.xml`, `public/robots.txt`, the icons and the manifest —
plus everything else under `dist/` after a build.

Spot-check after deploy — open these five URLs in a browser and view-source;
each must show its own `<title>` and real text, not an empty app shell:

- `/`  · `/read/five-minutes`  · `/topics/public-speaking`
- `/topics/wedding-speeches`  · `/sitemap.xml`

## 2. Google Search Console (do this on launch day)

1. **Verify the property** (once, if not done): GSC → Settings → Ownership verification.
   The easiest method is the *HTML tag*: copy the
   `<meta name="google-site-verification" content="…">` tag into the `<head>` of
   `index.html`, or drop the *HTML file* they offer into `public/` so it deploys with
   the build. DNS verification on the domain works too.
2. **Submit the sitemap**: GSC → Sitemaps → *Add a new sitemap* →
   `https://presentationbuddy.aavrit.dedyn.io/sitemap.xml` (56 URLs).
3. **Request indexing for the pages that matter most** (URL Inspection →
   *Request Indexing*), in this order: `/`, `/topics`, all 14 topic hubs
   (`/topics/public-speaking`, `/topics/wedding-speeches`, …), the flagship reads
   (`/read/five-minutes`, `/read/toast-i-practised`, `/read/remembering-amma`, …),
   `/write`, `/rehearse`, `/arrivals`. The full ranked list is in `dist/sitemap.xml`.
4. Watch **Pages → Why pages aren't indexed over the next 2–6 weeks.** Expect
   "Crawled – currently not indexed" for a while on a new site; that's normal, not an error.

## 3. Win some keywords, not all keywords

No site can rank for "every single search" — Google ranks pages, not websites, and each
page needs to be the best answer for a specific query. The 2.4 build is deliberately
aimed at queries you can realistically win first:

| Hub | Target queries |
| --- | --- |
| `/topics/wedding-speeches` | wedding speech examples, wedding toast examples |
| `/topics/graduation-speeches` | graduation speech examples, farewell speech |
| `/topics/public-speaking` | public speaking tips, public speaking guide |
| `/topics/speech-templates` | speech template, speech outline |
| `/topics/speaking-confidence` | overcome fear of public speaking, speech anxiety |
| `/topics/presentation-skills` | presentation skills, how to start a presentation |
| `/rehearse` | teleprompter online free, practice speech online, fullscreen speech practice |
| `/write` | free speech writer, write a speech online, speech word alternatives |
| `/arrivals` | famous speeches public domain, historic speech texts |
| reads like `/read/toast-i-practised`, `/read/remembering-amma`, `/read/saying-goodbye-well` | specific example-speech searches (toast, eulogy, farewell) |

**Weeks 1–4:** expect impressions for the example speeches and brand name.
**Months 2–3:** hubs start climbing for their phrases, if earning a few links (below).

## 4. The work only you can do

- **Content cadence:** publish one new speech or guide a week (`/write` → publish).
  Fresh original pages are the only compounding ranking asset.
- **Backlinks:** share the guides where speakers look — r/publicspeaking, wedding and
  forum communities, your university/club pages, a blog post a month answering one
  question (e.g. "best man speech outline") that links to its hub.
- **Social previews:** the 32 generated cards in `dist/cards/` make every shared link
  look designed — use the share buttons, they deep-link to the exact speech now.
- **Don't block the crawlers** making it busy: keep `robots.txt` as-is
  (it only disallows `/admin`), and don't add a meta-keywords tag — Google ignores it.

## 5. What is already done for you in the code (nothing left to add)

- 57 prerendered pages with unique metadata + canonical URLs — no duplicate-content penalty
- JSON-LD: `WebSite`, `Organization`, `Article` per speech/guide, `BreadcrumbList`
- Open Graph + Twitter cards with a unique 1200×630 image per key page
- `sitemap.xml` (56 URLs, lastmod, priorities), `robots.txt` pointing at it
- Real HTML headings and internal links between hubs ↔ speeches (crawlable without JS)
- Inline default theme CSS vars → fast first paint (a ranking input via Core Web Vitals)
- 404 page returns `noindex` so dead links don't pollute the index

## 6. Measure honestly

GSC → Performance: track *impressions* first, clicks second, position last.
A brand-new domain typically needs 8–12 weeks before rankings stabilise. The honest
goal for the first 90 days: top-10 for your example-speech long-tails and brand name;
top-50 for the hub phrases. Rankings come from the content and links in section 4 —
the code has already removed every technical obstacle.
