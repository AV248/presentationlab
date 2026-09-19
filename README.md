# Presentation Buddy

**Write it. Coach it. Rehearse it. Deliver it.**

Presentation Buddy is a local-first workspace for people who have to stand up and speak: a library
of original speeches, a writing studio that reads your draft back to you, and a rehearsal room with
a teleprompter and an honest pacing timer — wrapped in the most themeable interface you have ever
used.

No account. No tracking. No upload. It works on a plane.

---

## What's inside

| Page | What it does |
| --- | --- |
| **Library** | 32 original speeches and fill-in structures, full-text search, category/type/source filters, seven sort orders, and 22 different ways to lay the collection out. |
| **Reader** | Distraction-free reading with adjustable size, measure and leading, focus mode, reading ruler, progress tracking, text-to-speech, copy, Markdown export and print/PDF. |
| **Studio** | Write with live word/sentence/pacing metrics and a coach that watches your hook, evidence, landing, filler words, long sentences, echoes and readability. Autosaves as you type, with dictation and Markdown-lite formatting. |
| **Practice** | Teleprompter with words-per-minute scrolling, countdown, mirror mode, cue line, fullscreen, wake lock and an over/under pacing clock. |
| **Community** | Author leaderboard, podium, and the most-loved speeches. |
| **Control Room** | Manage content, hide or restore library items, import/export JSON, optional cloud sync, accessibility settings and a local data reset. |
| **Themes** | The full theme studio, plus what the app does differently on each class of device. |
| **About** | Purpose, keyboard shortcuts, privacy and install instructions. |

Plus a **command palette** (⌘K / Ctrl+K) that searches speeches, pages and actions, and a
**theme slide-over** available from anywhere with the `T` key.

---

## The theme engine

Five independent axes, all mixable, all applied instantly as CSS custom properties:

| Axis | Options | Controls |
| --- | --- | --- |
| **Colour** | 26 | Palette, surfaces, ink hierarchy, accent triad, semantic colours, gradients, glow |
| **Motion** | 22 | Entrance keyframe, easing, durations, stagger, hover lift, ambient behaviour |
| **Layout** | 22 | Container width, grid rhythm, card proportions, sidebar, reading measure — plus 22 distinct *modes* (bento, masonry, timeline, carousel, split view, theatre, ledger…) |
| **Interface** | 22 | How surfaces are built: glass, clay, paper, blueprint, holographic, neumorphic, retro terminal… |
| **Type & Reading** | 22 | Font pairing, scale, measure, leading, weight, tracking, paragraph rhythm |

**114 options · 6,090,656 combinations.**

Everything is compiled to CSS variables at runtime (`src/design/compile.ts`), so Tailwind utilities,
hand-written component CSS and inline styles all respond to the same switch. The studio also ships
24 curated designer presets, a “surprise me” randomiser, and the ability to name and save your own
presets.

Accessibility is built into the theme system rather than bolted on: the **Still** motion theme
freezes animation, **Paperwhite** and **Maximum Contrast** clear WCAG AA on every surface, and the
**Dyslexia Friendly**, **Large Print** and **Low Stimulation** typography themes change spacing,
weight and measure — not just size.

---

## Stack

- **React 19** + **TypeScript** + **Vite 7** — one codebase, instant HMR, static output you can host anywhere.
- **Tailwind CSS v4** bridged to runtime CSS variables (`@theme inline`), so theme switches never rebuild a class.
- **Zustand** with `persist` for settings and library data.
- **lucide-react** icons, hand-drawn SVG brand mark.
- **Zero backend.** Optional Firestore sync over its REST API — no SDK, no 500 kB download.
- PWA: web manifest, maskable icons and a service worker for offline use.

---

## Getting started

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check + production bundle in dist/
npm run preview  # serve the production bundle
```

### Optional cloud sync

The bundled library makes the app complete on its own. To *also* pull a shared `presentations`
collection from Firestore, copy `.env.example` to `.env` and fill in your Firebase web config:

```bash
cp .env.example .env
```

Firebase web config values are public by design — access is governed by Firestore security rules,
not by these keys. If the rules don't allow public reads (or you leave the file blank), the app
simply runs local-only and says so in the Control Room. Publishing to the cloud additionally
requires write rules that permit it.

---

## Data & privacy

- Drafts, likes, bookmarks, reading progress and theme choices live in `localStorage` on your device.
- No analytics, no cookies, no third-party scripts. The only outbound requests are Google Fonts and,
  if you configure it, your own Firestore project.
- **Control Room → Data portability** exports everything to JSON, imports it back, or wipes it.

---

## Designed for every device

- **Phones (iOS / Android)** — bottom tab bar, 44 px+ touch targets, safe-area padding for notches and home bars, snap carousels, sheet-style panels, installable and offline.
- **Tablets** — rail becomes a swipe-in drawer, two-pane layouts reflow to stacked.
- **Laptops (macOS / Windows)** — full shortcut set, platform-native font stacks, hover affordances.
- **Large screens and TVs** — type and spacing scale above 1800 px; stage-display typography for reading across a room.
- **Everyone** — `prefers-reduced-motion`, `prefers-color-scheme`, keyboard-only navigation and visible focus rings throughout.

---

## Keyboard shortcuts

| Keys | Action |
| --- | --- |
| `⌘K` / `Ctrl+K` | Command palette |
| `/` | Search the library |
| `T` | Theme studio |
| `?` | Shortcut help |
| `G` | Jump to a page by number |
| `Space` | Play / pause rehearsal |
| `↑` / `↓` | Adjust rehearsal pace |
| `R` | Restart rehearsal |
| `F` | Fullscreen during practice |
| `Esc` | Close overlays |

---

## Engineering notes

- `npm run typecheck` — strict TypeScript, no unused locals or parameters.
- `npm run smoke` — renders every route in jsdom, applies all 22 layout modes, compiles all
  6,090,656 theme combinations and fails on any React console error. It caught a real
  render loop in the reader during development, which is why it is part of the repo.
- `npm run verify` — both of the above.

---

## Project layout

```
src/
  design/       theme registries (colour, motion, layout, ui, ux), presets, compiler
  styles/       Tailwind bridge, keyframes, component CSS, responsive rules
  data/         the bundled library of speeches and templates
  store/        settings, library, cloud and UI state (Zustand)
  hooks/        collection selectors, theme engine
  lib/          text analysis/coach, platform helpers
  services/     optional Firestore REST cloud layer
  components/   shell, cards, theme studio, palette, overlays
  pages/        library, reader, studio, practice, community, control, themes, about
public/         manifest, icons, service worker
```

---

## A note on the previous version

This repository previously contained a static "Presentation Lab" site (with a duplicated
`presentation-lab/` folder, seeded admin credentials and third-party branding). All of it has been
replaced by Presentation Buddy. The old files remain in Git history — `git show 4fb8509` brings them
back if you ever need them.
