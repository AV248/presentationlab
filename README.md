# Presentation Buddy

**Read it. Write it. Say it out loud.**

Version 2.2 — a local-first workspace for people who have to stand up and speak, with real Firebase
Authentication (Google + Microsoft), real Firestore data, and a hand-set design that opens on warm
sand paper and terracotta ink.

---

## What it does

| Page | |
| --- | --- |
| **Library** | Latest / Most viewed shelves, full-text search, filters by type and source, seven sorts, 22 arrangements |
| **Reader** | Adjustable size, width and leading; focus mode; reading ruler; text-to-speech; keep-a-line; margin notes; export and print |
| **Studio** | Autosaving drafts, dictation, first-line prompts, live metrics and a coach that checks hook, evidence, landing, fillers, long sentences, echoes and readability |
| **Practice** | Teleprompter at your words-per-minute, "who is this for?", a breathing pacer, an over/under clock, and a letter to yourself afterwards |
| **Community** | Leaderboard of real accounts (+1 per like, −1 per three dislikes) and the open mic |
| **From the web** | Public-domain speeches fetched live from Wikisource, each with its licence and a link home |
| **Your desk** | Lines you kept, margin notes, letters, and the small firsts worth remembering |
| **Themes** | Five axes, 114 options, 6,090,656 combinations |
| **Control Room** | Content, data portability, cloud status, comfort settings, and the admin panel |
| **About** | The honest version of where everything comes from, plus the colophon |

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

Five independent axes, mixed by hand and applied as CSS custom properties:

| Axis | Options | House default |
| --- | --- | --- |
| Paper & Ink | 26 | **Sand & Terracotta** |
| Movement | 22 | Steady |
| Arrangement | 22 | Reading Room |
| Material | 22 | Paper |
| Typography | 22 | Newsreader |

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
npm run build     # type-check + production bundle in dist/
npm run preview   # serve the production bundle
npm run verify    # type-check + jsdom smoke test
```

The smoke test renders all 15 routes, applies all 22 layout modes, compiles all 6,090,656 theme
combinations, checks that every preset resolves, and fails on any React console error.

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
