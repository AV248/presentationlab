# Presentation Buddy

**Read it. Write it. Say it out loud.**

Version 2.4 — a local-first workspace built on one idea: **qualities are not gifted, they are
built.** You climb by doing the reps, so the app is shaped around the rep — a fullscreen
**Rehearsal Room** where you actually speak out loud, a **Writing Desk** with a dictionary that
suggests stronger words as you type, a reader that quietly defines the words you do not know,
and **Fresh Arrivals** that pulls five new public-domain speeches from the open archives every
session, each credited to the archive it came from.

2.4 is also a de-clutter. The navigation is five rooms instead of eleven links, the phone
layout was rebuilt mobile-first, and the theme engine (13,709,280 combinations) moved out of
the way rather than away — it is still all there, just no longer the first thing you see.

---

---

## What it does

| Page | |
| --- | --- |
| **Library** | Latest / Most viewed shelves, full-text search, filters by type and source, seven sorts, 22 arrangements |
| **Reader** | Adjustable size, width and leading; focus mode; reading ruler; text-to-speech; keep-a-line; margin notes; export and print — plus the **word lens**: uncommon words carry a dotted underline, tap one and its meaning arrives beside it without leaving the sentence |
| **Rehearse** `/rehearse` | **The flagship.** A fullscreen stage: the page disappears, the chrome fades after 2.6s of stillness, and there is nothing left but your words scrolling at your words-per-minute. Set an intention, breathe with the ring, run it, then write yourself a letter about how it went |
| **Write** `/write` | Autosaving drafts, dictation, first-line prompts, live metrics, a structure coach, and the **word smith** — put your cursor in a word and it offers stronger, shorter or more precise alternatives, one click to swap |
| **Community** | Leaderboard of real accounts (+1 per like, −1 per three dislikes) and the open mic |
| **Arrivals** `/arrivals` | Five new speeches every session, drawn live from **Wikisource**, **Project Gutenberg** and **Wikiquote**, interleaved round-robin. Every card names its archive and licence; the page footer credits all three. Offline, it says so instead of failing |
| **Your desk** | Lines you kept, margin notes, letters, and the small firsts worth remembering |
| **Themes** | Five axes, 134 options, 13,709,280 combinations, 26 layout modes, 14 designer presets |
| **Control Room** | Content, data portability, cloud status, comfort settings, and the admin panel |
| **Topics — 14 guides** | Original, practical speaking guides (public speaking, wedding toasts, pitches, eulogies, difficult conversations…) each wired to the example speeches it coaches |
| **Admin** | A private, noindex `/admin` workspace for role-holders only: ad campaigns, people roles, content moderation, site stats |

Every speech and template has a **share link** (`/read/…`) that deep-links straight into it —
copy from the reader, the library cards or the rehearsal room.

### The dictionary

Two faces of one service (`src/services/dictionary.ts`). Definitions come from
[dictionaryapi.dev](https://api.dictionaryapi.dev), alternatives from
[Datamuse](https://api.datamuse.com) — both keyless and CORS-open. Results are cached in
`localStorage` (`pb.dictionary.v1`, 400 entries) so the same word is never fetched twice, and a
bundled offline core answers common words with no network at all. Every lookup aborts after a
few seconds rather than hanging, so the feature degrades to silence instead of to a spinner.

### Devices

The stylesheet is mobile-first: the base rules *are* the phone, and each breakpoint adds
capability as the screen earns it — ≤380px small phones, ≤520px portrait phones, ≥560px
landscape and small tablets, ≥760px tablets (the tab bar goes away), ≥1100px laptops (the
sidebar becomes permanent), ≥1600px large displays. Touch pointers get 44px hit targets and no
hover effects; landscape phones get a shorter stage; installed PWAs get safe-area padding.

### Sponsored slots

Ads are noticeable but never interrupting: theme-native cards labelled *Sponsored*, capped at
one per scroll region, dismissible per session, loaded after the page settles, and rendered with
`rel="sponsored nofollow"`. Campaigns are documents in Firestore (`ads` collection:
`title`, `description`, `url`, optional `image`, `active`) edited from `/admin`. Offline or with
an empty collection, the slot quietly disappears and shows a small house card instead.

### SEO

`npm run build` now ends with a post-build pipeline in `scripts/`:

1. **Cards** — 32 unique 1200×630 Open Graph images (`dist/cards/*.png`) drawn from the house
   mark and palette via sharp, one each for home, the eight sections, the nine flagship reads
   and the fourteen topic hubs.
2. **Prerender** — every indexable route is rendered to real HTML with its own title,
   description, canonical, robots, Open Graph/Twitter tags and JSON-LD
   (`WebSite`/`Organization`/`Article`/`BreadcrumbList`), 57 pages total, plus a `noindex` 404.
3. **Sitemap** — `dist/sitemap.xml` with 56 URLs; `public/robots.txt` points at it.

Each page ships with the default theme's CSS variables already inline, so first paint is instant
and hydration is a no-op. Rankings still take time and backlinks — prerendering removes the
technical blocker, promotion is what actually climbs the results.

---

## Firebase setup (production)

The app runs completely without Firebase. To switch on the shared library and community:

1. **Create a Firebase project** and add a Web app.
2. **Enable Authentication → Sign-in methods → Google and Microsoft.** (For Microsoft, Azure AD
   needs no extra configuration for the default tenant; add your own tenant ID if you use one.)
3. **Create a Firestore database** (production mode is fine).
4. **Deploy the rules** in `firestore.rules`:
   ```bash
   npm i -g firebase-tools
   firebase login
   firebase init firestore      # choose your project
   firebase deploy --only firestore:rules
   ```
5. **Copy `.env.example` to `.env`** and fill in the web config values from Project settings.
   ```bash
   cp .env.example .env
   ```
   Firebase *web* config values identify the project in the browser and are public by design —
   access is governed entirely by the security rules, never by these keys.
6. **Claim owner access**: sign in inside the app, open **Control Room → Admin access**, and press
   *Make this account the owner*. This writes `admins/{uid} = { role: 'owner' }` once.
   It replaces the seeded e-mail/password list the first version shipped with — no password is
   ever stored in the database.

### Firestore collections

| Collection | Purpose |
| --- | --- |
| `presentations` | Published speeches: `Title`, `Content`, `Preview`, `Category`, `Occasion`, `Tags`, `Author`, `uid`, `Date`, `views`, `likes`, `dislikes`, `shares`, `ad` |
| `bloggerblogs` | Open-mic notes (the old creative-creator wall) |
| `bloggers` | One doc per contributor with real reaction counters and points |
| `reactions` | One doc per (person, speech): `kind` is `like` or `dislike` |
| `shares` | One doc per (person, speech) share |
| `users` | Profile mirror for every signed-in person |
| `admins/{uid}` | Role documents: `owner` or `admin` |
| `admin` | Legacy e-mail allow-list from v1 — read only, never written, no passwords |
| `sponsors` | Optional sponsor slots shown before sponsor-supported speeches |
| `ads` | Sponsored campaigns for the theme-native ad slots: `title`, `description`, `url`, optional `image`, `active`, `weight`. Written only from `/admin` by role-holders; read by everyone per the rules. |

Points follow the original rule and are computed from real counters:
`points = likesReceived − floor(dislikesReceived / 3)`.

---

## Honest data, always

- **No invented people.** Only signed-in accounts appear on the leaderboard. The starter library is
  attributed to Presentation Buddy, because that is who wrote it.
- **No invented numbers.** Views, likes, dislikes and shares come from Firestore counters that only
  move for real reads and real signed-in reactions. Where no counter exists, the UI shows nothing
  rather than a zero.
- **No fake freshness.** "Latest" is really newest-first, and work published by people always sits
  above the starter library and web arrivals.
- **Sponsor slot.** If a speech is flagged `ad`, a five-second slot runs first. With no sponsor
  documents it belongs to Presentation Buddy itself — never a made-up advertiser.

---

## Design

Five independent axes, mixed by hand and applied as CSS custom properties
(134 options, 13,709,280 combinations):

| Axis | Options | House default |
| --- | --- | --- |
| Paper & Ink | 30 | **Sand & Terracotta** |
| Movement | 26 | Steady |
| Arrangement | 26 | Reading Room |
| Material | 26 | Paper |
| Typography | 26 | Newsreader |

The mark is **Voices Rising** — a speech bubble whose tail grows into three rising voice bars
and a spark. It is drawn from the live theme's CSS variables, so it re-colours with every one of
the 30 colour worlds, and it is the single source for all app icons (`scripts/generate-icons.mjs`)
and social share cards.

The design language is print, not software: warm stock with a procedural paper grain, hairline
rules, small-caps metadata, a lozenge rule ornament, index-card cards, drop caps in editorial mode,
a slightly rotated stamp, Caveat handwriting for margin notes, and a colophon on the About page.
Materials change what the pages are physically made of — letterpress, newsprint, linen, cloth-bound,
chalk, carbon copy, risograph, blueprint, masking tape — not just their shadow.

Accessibility lives inside the theme system: **Still** freezes motion, **Black & Cream** and
**Signal** clear WCAG AA, and **Easy Read**, **Large Print** and **Single Line** change spacing,
weight and measure.

---

## Development

```bash
npm install
npm run dev       # http://localhost:5173
npm run build     # type-check + bundle + share cards + 57 prerendered pages + sitemap in dist/
npm run preview   # serve the production bundle
npm run verify    # type-check + jsdom smoke test
```

The smoke test renders all 17 routes, checks every theme axis has more than twenty unique options,
applies all 26 layout modes, compiles all 13,709,280 theme combinations, checks that every preset
resolves, confirms sponsored slots degrade gracefully offline, and fails on any React console
error. `npm run cards`, `npm run prerender` and `npm run sitemap` run each post-build stage
separately when iterating.

### Stack

React 19 · TypeScript (strict) · Vite 7 · Tailwind v4 bridged to runtime CSS variables · Zustand ·
lucide-react · Firebase 12 (lazy-loaded: auth and Firestore only download when someone signs in or
the library asks for cloud speeches) · PWA manifest + service worker.

---

## Devices

Bottom tab bar, 44 px touch targets and safe-area padding on phones; a swipe-in drawer on tablets;
native font stacks and a full shortcut set on macOS and Windows; scaling above 1800 px and a
stage-display type theme for big rooms. Reduced-motion and contrast settings, visible focus rings
and keyboard-only navigation throughout.

| Keys | |
| --- | --- |
| `⌘K` / `Ctrl+K` | Command palette |
| `/` | Search |
| `T` | Theme studio |
| `?` | Shortcuts |
| `Space` `↑` `↓` `R` `F` | Rehearsal controls |

---

## Privacy

Drafts, notes, bookmarks, reading positions and theme choices live in this browser. No analytics, no
advertising scripts, no cookie banner. Sign-in is handled by Google or Microsoft; we store only your
name, e-mail address and profile picture so your words can be attributed to you. Export or wipe
everything from the Control Room.
