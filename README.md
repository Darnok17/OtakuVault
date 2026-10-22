# OtakuVault

**Personal Collection Tracker · 収蔵庫**

A dark, terminal-themed hub for everything anime, manga, webtoon, and light novel. Track what you've watched, rank it, build visual moodboards of what it means to you, discover what's next, and shop merch for the series you love — all in one place.

---

## Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Status](#status)
- [Getting Started](#getting-started)
- [Project Structure](#project-structure)
- [Design System](#design-system)
- [Roadmap](#roadmap)
- [Contributing](#contributing)
- [License](#license)

---

## Overview

OtakuVault is an all-in-one personal collection tracker built for serious fans — the kind who want more than a star rating next to a title. Every entry can be ranked within its rating tier, dragged into position, tagged with notes, and expanded into a full visual moodboard with character cards, quotes, custom nodes, and gradient-wired connections.

Alongside the collection sits an **Index** that pulls from AniList's open catalog of 12,000+ titles, a **Forum** for community discussion, and a curated **Store** for figures, art books, and apparel tied to the series you track.

The whole thing is wrapped in a dark, Hyprland-inspired aesthetic — CRT scanlines, powerline chrome, kanji subtitles, and a terminal boot sequence that greets you on first visit.

---

## Features

### Your Collection — 収蔵庫

- Track entries across **four media types**: anime, manga, webtoons, and light novels
- **Half-star rating** system with per-tier ranking (drag to reorder within rating groups)
- **Six sort modes**: rating ↓/↑, newest, oldest, title A–Z/Z–A
- **Status filters**: completed, watching, on hold, dropped, plan-to
- **Separate watchlist** view for titles you've bookmarked to start later
- **Grid or list view** toggle
- **FLIP animations** on every reorder, delete, and restore — including an undo toast
- **Progress tracking** with live bars for currently watching/reading entries
- **Full search** across titles, genres, and personal notes
- Cover art via **drag-and-drop upload** with automatic resize and compression

### Visual Moodboards — 趣境

Open any entry's moodboard and build a canvas of your reactions.

- **8 node types**: Image, Character, Quote, Note, Scene, Theme, Soundtrack, Link
- **Fully custom nodes** with your own text and color theme
- **Pan, zoom, and multi-select** with keyboard shortcuts
- **Gradient wires** that interpolate color between connected nodes
- Switch between **flowing bezier curves** and **grid-snapped orthogonal routing**
- **Marquee selection**, group drag, copy-paste
- **Ctrl+Z / Ctrl+Shift+Z** full undo/redo history (50 steps)
- Autosaves to your account

### Discovery — The Index · 索引

- Browse 12,000+ titles pulled from **AniList's open database**
- **Seasonal lineups** (Fall 2026, Winter 2027, etc.) with hero banners
- **Trending now** updated hourly
- **"Because You Liked..."** recommendations driven by your top-rated entries
- Multi-select filters: **type, status, genre, year, rating**
- One-click **Add to Collection** from any poster card

### Community — The Forum · 掲示板

- **Six categories**: Discussion, News, Reviews, Theory, Fan Art, Help & Recs
- **Pinned threads** for megadiscussions and announcements
- **Trending discussions** carousel updated in 24-hour windows
- Filter by category, status (hot / answered / unanswered), post date, and series tags
- Threaded replies with upvotes

### Merch Store — 商店

- Curated collectibles: figures, art books, posters, apparel, plushies, keychains, manga volumes
- **"Picked for You"** merch feed tied to your top-rated series
- **Featured drops** with limited-time banners
- Full filter sidebar: category, price range, availability, brand, series tie-in
- **Stripe-backed checkout** with order history

### Site-Wide

- **Terminal boot animation** on first visit — type-out sequence, logo reveal, flight to nav
- **Scroll-revealed homepage** introducing the four core features
- **Live stat counters** that animate as they scroll into view
- **Sign up / Log in** with email+password or OAuth (Google, Discord, GitHub)
- **Fully responsive** — works down to phone width

---

## Tech Stack

| Layer                | Technology                                                                 |
| -------------------- | -------------------------------------------------------------------------- |
| Framework            | **Next.js 16** (App Router, Turbopack, Cache Components)                   |
| Language             | **TypeScript**                                                              |
| State management     | **Zustand** with optimistic updates + Server Action sync                   |
| Styling              | Custom CSS with CSS variables + **Tailwind CSS v4** (where it helps)       |
| Database             | **PostgreSQL** (Neon in production, Docker Postgres locally)                |
| ORM                  | **Drizzle ORM**                                                             |
| Authentication       | **Better-Auth** (email + Google + Discord + GitHub)                        |
| File storage         | **Vercel Blob** (prod) with local filesystem fallback (dev)                |
| Payments             | **Stripe Checkout**                                                         |
| External data        | **AniList GraphQL API** with 7-day Postgres cache                          |
| Hosting              | **Vercel**                                                                  |
| CI                   | **GitHub Actions** (lint + build on every push)                            |
| Fonts                | Bebas Neue (display), Noto Sans JP (kanji), Space Mono (code / UI meta)    |

---

## Status

**Phase 1 — Frontend & interactions · Complete**

- [x] Multi-page Next.js scaffold with hash-free routing
- [x] All seven pages ported from the original single-file prototype
- [x] Terminal boot animation with sessionStorage guard
- [x] Collection with Zustand store, drag-reorder, FLIP animations
- [x] Interactive half-star rating + delete-with-undo
- [x] Moodboard with pan/zoom, nodes, gradient wires, snap grid, undo
- [x] Image upload with resize + compression

**Phase 2 — Backend & persistence · In progress**

- [x] Postgres schema with Drizzle
- [x] Better-Auth integration
- [x] Entries migrated from localStorage to database
- [x] Moodboards persisted per entry
- [ ] File storage via Vercel Blob
- [ ] AniList integration with cached titles table
- [ ] Store with Stripe Checkout
- [ ] Deployed to Vercel + Neon

**Phase 3 — Community & extension · Planned**

- [ ] Browser extension for tracking episodes while watching
- [ ] Full forum backend with real-time replies
- [ ] Public profile pages with shareable collections
- [ ] Mobile-first redesign pass

---

## Getting Started

### Prerequisites

- Node.js 22+
- pnpm 10+
- Docker (for local Postgres)
- Git

### Installation

```bash
git clone git@github.com:Darnok17/otakuvault.git
cd otakuvault
pnpm install
```

### Environment

Copy `.env.example` to `.env` and fill in the values. Minimum for local dev:

```env
DATABASE_URL=postgres://otaku:otaku@localhost:5432/otakuvault
BETTER_AUTH_SECRET=<generate a random 32-char hex>
BETTER_AUTH_URL=http://localhost:3000
```

OAuth and Stripe keys are optional for local development.

### Running Locally

```bash
pnpm db:up       # start Postgres in Docker
pnpm db:push     # apply the schema
pnpm dev         # start Next.js on http://localhost:3000
```

Visit **http://localhost:3000** and watch the boot sequence.

### Useful Commands

| Command             | What it does                                     |
| ------------------- | ------------------------------------------------ |
| `pnpm dev`          | Dev server with hot reload                       |
| `pnpm build`        | Production build                                 |
| `pnpm start`        | Production server (after build)                  |
| `pnpm lint`         | ESLint pass                                      |
| `pnpm db:up`        | Start local Postgres                             |
| `pnpm db:down`      | Stop local Postgres                              |
| `pnpm db:push`      | Sync schema to local Postgres                    |
| `pnpm db:studio`    | Open Drizzle Studio in the browser               |
| `pnpm db:generate`  | Generate a migration file from schema changes    |

---

## Project Structure

```
otakuvault/
├── app/
│   ├── _components/            # Shared components (SiteNav, HomeClient)
│   ├── collection/
│   │   ├── _components/        # Collection shell, cards, modal, stars
│   │   └── [entryId]/moodboard/  # Full moodboard route
│   ├── index-page/             # The Index (discovery)
│   ├── forum/
│   ├── store/
│   ├── login/
│   ├── signup/
│   ├── api/
│   │   ├── auth/[...all]/      # Better-Auth handler
│   │   └── webhooks/stripe/    # Stripe webhook
│   ├── actions/                # Server Actions (entries, moodboards, etc.)
│   ├── layout.tsx
│   ├── page.tsx                # Home
│   └── globals.css             # Full custom design system
├── lib/
│   ├── db/
│   │   ├── schema.ts           # Drizzle tables
│   │   └── index.ts            # DB client
│   ├── auth.ts                 # Better-Auth config
│   ├── auth-client.ts
│   ├── anilist.ts              # AniList GraphQL wrapper
│   ├── storage.ts              # File upload abstraction
│   ├── store.ts                # Zustand entries store
│   └── types.ts                # Shared TypeScript types
├── public/                     # Static assets + uploaded images (dev)
├── docker-compose.yml          # Local Postgres
├── drizzle.config.ts
├── middleware.ts               # Auth-protected routes
├── next.config.ts
└── package.json
```

---

## Design System

The entire visual language is built on a dark, Hyprland-inspired palette with CRT scanlines and powerline chrome. All colors live as CSS variables in `app/globals.css`:

- **Media types** · anime (crimson), manga (violet), webtoon (teal), novel (orange)
- **Accents** · gold, azure, pink
- **Typography** · Bebas Neue for display, Space Mono for metadata, Noto Sans JP for kanji subtitles

Every page carries a kanji subtitle (収蔵庫, 索引, 掲示板, 商店, 再接続, 新規登録) and the design cadence stays consistent across all seven routes.

---

## Roadmap

See the [Status](#status) section above for the active phase. Longer-term:

- **Public profiles** · share your collection like a trading card
- **Browser extension** · auto-track episodes as you watch on streaming sites
- **Mobile app** · React Native wrapper around the Server Actions
- **AI recommendations** · beyond "because you liked", a model-driven taste profile
- **Group watch parties** · synced playback + live forum threads

---

## Contributing

This is a personal project, but PRs are welcome. Open an issue first if you're planning a bigger change.

Code style:
- TypeScript strict mode
- Functional React with hooks (no class components)
- Server Actions over API routes where possible
- No `any` without a comment explaining why

---

## License

Copyright (c) 2026 Conrad Seegert. All rights reserved.

This is a proprietary portfolio project. The source is public for study and
review but may not be copied, modified, redistributed, or used commercially
without written permission. See [LICENSE](./LICENSE) for the full terms.

---

## Credits

- Design inspired by [Hyprland](https://hyprland.org) and the Arch Linux boot aesthetic
- Anime data courtesy of [AniList](https://anilist.co)
- Built with [Next.js](https://nextjs.org), [Drizzle](https://orm.drizzle.team), [Better-Auth](https://better-auth.com), [Zustand](https://zustand-demo.pmnd.rs)

---

**OtakuVault · 2026 ·** [darnok17.github.io](https://github.com/Darnok17/otakuvault)
