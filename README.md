# Presentation Buddy

> **3.1 (beta): Next.js App Router.** The same screens, the same three databases and the
> same environment variables — now on the framework, with every page that can be known at
> build time served as static HTML. What moved and what has to change in Vercel is in
> [docs/NEXTJS.md](docs/NEXTJS.md).

**Read it. Write it. Say it out loud.**

Feature history. 2.6.2 — pure-white falling-leaves entry animation; the festival theme is now exclusively the owner's, layered over — never replacing — the user's own theme from the 13,709,280-combination studio; shared/copied links are *only* `pb.devs.surf/<path>`, nothing else; `/username` profiles and `/username/content` render at their own addresses. (2.6 — animated “Rise” entry, `/username` handles with `pb.devs.surf` short links, step-by-step publishing with copyright protection & originality screening, 20 festival/occasion themes the owner sets, a central star-feedback dialog saved to the database, emotional share moments, centred rehearsal start, and separate phone/tablet/desktop optimisation. (2.5 — a local-first workspace built on one idea: **qualities are not gifted, they are
built.** You climb by doing the reps, so the app is shaped around the rep — a fullscreen
**Rehearsal Room** where you actually speak out loud, a **Writing Desk** with a dictionary that
suggests stronger words as you type, a reader that quietly defines the words you do not know,
and **Fresh Arrivals** that pulls five new public-domain speeches from the open archives every
session, each credited to the archive it came from.

2.4 is also a de-clutter. The navigation is five rooms instead of eleven links, the phone
layout was rebuilt mobile-first, and the theme engine (13,709,280 combinations) moved out of
the way rather than away — it is still all there, just no longer the first thing you see.

2.5 turns it into something you can put in front of real people. **Clerk** owns sign-in, and from
2.6.2 the data lives in **three databases with one job each**: Postgres (Supabase) holds every
durable record, Turso serves the reading room — a derived copy of published work with full-text
search — and Convex carries presence and live activity. One writer per fact, so they cannot
disagree. See **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**. Structured data was
widened — breadcrumbs on every page, `Article` on every speech, a `HowTo` on the rehearsal
room — so the site can appear as more than a line of text in search results.

> Sign-in trouble? **[docs/SIGNIN.md](docs/SIGNIN.md)** walks the four causes of
> "it redirects back and I am not signed in". Usernames — who owns them, why
> they cannot change — are in **[docs/USERNAMES.md](docs/USERNAMES.md)**.
>
> Deploying? **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)** has the three databases and
> the order to set them up; **[docs/ENV.md](docs/ENV.md)** is the complete variable list;
> **[docs/VERCEL.md](docs/VERCEL.md)** is the Vercel walkthrough.
> If you are on nginx or Caddy instead, see **[docs/DEPLOY.md](docs/DEPLOY.md)**.

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

### What's new in 2.6

| Ask | Shipped |
| --- | --- |
| Animated logo on entry | Empty screen → stairs draw up → dot blinks awake → wordmark. Once a session, skippable, reduced-motion safe (`Splash.tsx`) |
| Free to read, login to react/create, username to share | Reactions already gated by sign-in; publishing now requires a claimed unique `/username` (a real unique index on `handles.username`, `/claim` page with bio/location/website/signature) |
| Your path is yours | `/:username` is the person; `/:username/:slug` is only their content. Reserved words can never be claimed |
| Short links | Every share/copy uses `https://pb.devs.surf` + the exact same path; canonical SEO stays on the main domain. Attach `pb.devs.surf` in Vercel → Domains and 301 it to the canonical host (docs/VERCEL.md) |
| Feedback | Central dialog at a random moment (1.5–4 min in, ≤ once/fortnight, never mid-rehearsal): 5 stars, then words → the `feedback` table (queued locally offline) |
| Share moments | Emotional house cards (“Someone you know is quietly dreading a presentation…”) that share the short link — never popups, dismissible per session |
| Rehearsal | Teleprompter now starts with its first line at the middle of the screen; cue line sits at 50% |
| Copyright | Writers can block copy/download/print per speech; publishing screens content against the library (8-word shingle overlap) and pauses near-duplicates |
| Easy publishing | Wizard: Title → Preview → Tags → Credits → Content → Signature → Category. Only Title + Content mandatory |
| Support | amaavrit@yahoo.com + contact.aavrit.dedyn.io in About and the sidebar |
| Festival themes | 20 across Nepali/Hindu/Muslim/Christian/Buddhist/global & occasions (Dashain, Tihar/Diwali, Holi, Eid, Christmas…). Owner picks one in Admin → Site theme (`siteSettings/theme`); anyone may override on their device in Themes |
| Devices | Dedicated phone (≤759px), tablet (760–1099px) and desktop (≥1100px) optimisation passes on top of the existing breakpoints |

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
`rel="sponsored nofollow"`. Campaigns are rows in the `ads` table (
`title`, `description`, `url`, optional `image`, `active`) edited from `/admin`. Offline or with
an empty collection, the slot quietly disappears and shows a small house card instead.

### Production hardening

- **Security headers** (`public/_headers`, translated for nginx and Caddy in
  `docs/DEPLOY.md`): HSTS, `X-Frame-Options`, `X-Content-Type-Options`,
  a tight `Referrer-Policy`, a `Permissions-Policy` that switches off every
  API this app does not use, and a **Content Security Policy** with
  `script-src 'self'` — no inline scripts at all. The font loader uses
  `preload` + a plain stylesheet rather than the usual inline-`onload` trick
  precisely so that policy can hold.
- **Cache policy**: hashed `/assets/*` immutable for a year; HTML and `sw.js`
  always revalidated, so a deploy actually reaches people.
- **Postgres row policies** (`supabase/schema.sql`): default-deny, written in
  terms of the verified Clerk user id. Reading is open; writing is the author's
  own rows; the counters that must move on somebody else's row — likes and
  shares — move only through the database's own functions, inside a
  transaction. `npm run check:schema` fails the build if the app maps a field
  to a column that does not exist.
- **Service worker**: every fetch path resolves to a real `Response`, so a
  cache miss while offline degrades instead of throwing.

### SEO

`npm run build` now ends with a post-build pipeline in `scripts/`:

1. **Cards** — 32 unique 1200×630 Open Graph images (`dist/cards/*.png`) drawn from the house
   mark and palette via sharp, one each for home, the eight sections, the nine flagship reads
   and the fourteen topic hubs.
2. **Prerender** — every indexable route is rendered to real HTML with its own title,
   description, canonical, robots, Open Graph/Twitter tags and JSON-LD
   (`WebSite`/`Organization`/`Article`/`BreadcrumbList`), 57 pages total, plus a `noindex` 404.
3. **Sitemap** — `dist/sitemap.xml` with 56 URLs. Priority and change
   frequency are real signals rather than decoration: the rehearsal room sits
   at 0.95, arrivals is marked `daily` because it genuinely changes daily, and
   tool pages like settings sit at 0.3 so crawl budget goes to the library.
4. **robots.txt** — allows the assets crawlers need in order to render and
   judge a page, keeps filter permutations out of the index while explicitly
   allowing `?q=` (the target of the sitelinks search box), and welcomes the
   AI crawlers by name.

The home page also carries `WebSite`+`SearchAction` (the sitelinks search
box), `SoftwareApplication` with a real feature list, and a short `FAQPage`
answering the questions people actually type. `?q=` is wired to the library
search, so that markup describes something that genuinely works.

Each page ships with the default theme's CSS variables already inline, so first paint is instant
and hydration is a no-op. Rankings still take time and backlinks — prerendering removes the
technical blocker, promotion is what actually climbs the results.

---

## Database setup (production)

The app runs completely without any of this. With no variables set, the library
is local to the browser, sign-in is off, and every cloud feature degrades to a
quiet "not configured" — which is what makes these steps safe to take slowly.

Three databases, one job each. The full walkthrough, with every setting and
every step in order, is **[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)**:

1. **Supabase (the truth)** — create a project, paste `supabase/schema.sql` into
   the SQL editor, run it, and connect Clerk under *Authentication →
   Third-party auth*. Tables, indexes, policies and the counter functions all
   arrive together.
2. **Turso (the reading room)** — optional. `npm run db:turso`, then
   `npm run sync:turso`. Without it, reading is served from Postgres.
3. **Convex (the live layer)** — optional. `npx convex deploy`, add Clerk as a
   provider, create the JWT template named `convex`.
4. **Copy `.env.example` to `.env`** — nine variables, and
   **[docs/ENV.md](docs/ENV.md)** is the list in order.
   ```bash
   cp .env.example .env
   ```
5. **Claim owner access** — sign in once, then run this in Supabase →
   SQL Editor, with your own Clerk user id:
   ```sql
   select public.bootstrap_owner('<clerk-user-id>', 'amaavrit@yahoo.com');
   ```
   It grants the owner role once, and refuses if a role already exists. Every
   later role change happens in the site's own Admin workspace.
6. **Bring the old data across** (once) — `npm run migrate:firestore` plans,
   `npm run migrate:firestore -- --apply` writes. It reads Firestore and never
   deletes anything, so Firestore stays as the archive until you are satisfied.

### Where everything lives

| Collection (app name) | Table | Purpose |
| --- | --- | --- |
| `presentations` | `speeches` | Published speeches: `Title`, `Content`, `Preview`, `Category`, `Occasion`, `Tags`, `Author`, `uid`, `Date`, `views`, `likes`, `dislikes`, `shares`, `ad` |
| `bloggerblogs` | `posts` | Open-mic notes (the old creative-creator wall) |
| `users` | `profiles` | One row per person, carrying their own like/dislike score |
| `handles` | `handles` | The username lock — one row per claimed name, created never changed |
| `reactions` | `reactions` | One row per (person, speech): `kind` is `like` or `dislike` |
| — | `shares` | One row per (person, speech) share |
| `admins` | `admins` | Role rows: `owner` or `admin` |
| `adminPrivate` | `admin_private` | The second lock's secret, readable only by a role-holder |
| `siteSettings` | `site_settings` | One row per site-wide setting, including the owner's festival |
| `sponsors` | `sponsors` | Optional sponsor slots shown before sponsor-supported speeches |
| `servingads` | `ads` | Sponsored cards — see `docs/ADS.md` |
| `feedback` | `feedback` | The star-then-words dialog, saved as it arrives |
| — | `library` (**Turso**) | The reading room: published work + FTS5, rebuilt not written |
| — | `presence` / `activity` (**Convex**) | Who is here now, and what just happened |

The left column is what the app says; the right is what the database calls it.
`src/services/backend/supabase.ts` is the only file that knows both, and
`npm run check:schema` fails the build if a field is mapped to a column that
does not exist.

Points follow the original rule and are computed from real counters:
`points = likesReceived − floor(dislikesReceived / 3)`.

### One database, one schema file

Everything durable lives in the same Postgres database: profiles, handles,
roles, speeches, reactions, ads. There is no second project and no second rules
file to keep in sync — the policies live inside `supabase/schema.sql`, beside
the tables they guard, and applying that one file is the whole deploy.

Because `servingads` is world-readable and edited outside this codebase, every field is treated
as untrusted input. `src/services/ads.ts` parses `ImageURL` and `RedirectURL` and requires
`http(s)` before either reaches the DOM, so a document containing `RedirectURL: "javascript:…"`
is skipped rather than rendered. Ads are labelled *Sponsored* and carry
`rel="sponsored noopener noreferrer"`, which is what keeps paid links from touching your own
rankings.

### How sign-in reaches the data

Clerk signs the visitor in, and its session token is presented **directly** to
both databases that need one. Postgres trusts Clerk as a third-party auth
provider, so `auth.jwt() ->> 'sub'` is the Clerk user id and every policy is
written in terms of it. Convex trusts the same token through a JWT template
named `convex`. Turso never learns who is asking: it is a public reading room.

There is no token exchange, no custom token, and no credential that can mint one
— which removes a whole class of "it signed me in but the database disagrees"
failures, and the endpoint that used to broker it. If the connection is not up,
the app says so in words — `not-configured`, `no-session`, `unauthorized` or
`network` — and names what to do about each.

## Honest data, always

- **No invented people.** Only signed-in accounts appear on the leaderboard. The starter library is
  attributed to Presentation Buddy, because that is who wrote it.
- **No invented numbers.** Views, likes, dislikes and shares come from counters in Postgres that
  only move for real reads and real signed-in reactions, and the two that must be atomic are
  database functions rather than a sequence of writes. Where no counter exists, the UI shows
  nothing rather than a zero.
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
npm run dev          # http://localhost:3000
npm run build        # share cards + next build (66 routes, sitemap, robots)
npm start            # serve the production build
npm run verify       # everything that can be checked without a server
npm run verify:all   # verify + build + ask the running site what it answers
```

`npm run verify` is five checks, and each one exists because of a specific way this project was
broken by something that looked fine:

| command | what it answers |
| --- | --- |
| `npm run typecheck` | does the code compile, strictly |
| `npm run audit:secrets` | is any server-only key about to reach a browser bundle |
| `npm run check:schema` | is `supabase/schema.sql` complete — tables, RLS, policies, helpers |
| `npm run check:pg` | does that file *apply* as a pasted schema, and do its functions work |
| `npm run check:reading` | does the server reader answer correctly from Turso, from Postgres, from neither |
| `npm run check:library` | do the projection, FTS5 search and `/api/library` agree |

`npm run verify:all` adds `npm run check:routes`, which starts the built site the way the host does
and asks it the questions a reader, a crawler and a link checker would: 200s with the right titles,
real 404s, the old paths still redirecting, the endpoints' refusals, the security headers, and —
with a database behind it — that a writer's name and their work are in the HTML the server sends.

### Stack

React 19 · TypeScript (strict) · **Next.js 16 (App Router)** — server components for the pages
that must be readable without JavaScript, route handlers for the API · Tailwind v4 bridged to
runtime CSS variables · Zustand · lucide-react · Clerk (sign-in, JWT) · Supabase
(`@supabase/supabase-js`: the truth — Postgres, RLS, storage) · Turso (`@libsql/client`): the
reading room, a read-only projection with FTS5 search · Convex: the live layer · PWA manifest +
service worker.

The five `VITE_*` environment variables keep their names. `next.config.ts` inlines them at build
time so the browser code goes on reading exactly what it always read, and the deployment's
variable list never had to change.

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
