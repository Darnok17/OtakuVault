# OtakuVault: Vercel → Cloudflare migration guide

This manual moves OtakuVault's hosting from Vercel to **Cloudflare Workers** and puts it on a real custom domain. The result is meant to be the base for Stripe payments and affiliate links later.

Follow the phases in order. Each step says where to click, what to type, or what file to change. Where this guide had to make a call you might disagree with, it's listed under [Decisions to make](#1-decisions-to-make) first.

- **Updated:** 2026-11-20 after the actual migration. Start with [section 0](#0-status-and-corrections-2026-11-20).
- **Written:** 2026-11-16, against `next@16.4.5`, `better-auth@1.7.12`, `drizzle-orm@0.45.4`, `pg@8.23.1`.
- **Placeholders:** `yourdomain.com` is `otakuvault.app`. `<account-subdomain>` is `conrad-seegert`.
- **Ground rule:** do all code work on a branch (`git switch -c cloudflare-migration`). Vercel keeps serving production from `main` until the cutover in [Phase 12](#phase-12--cutover).

> **Re-check versions before you start.** Cloudflare's Next.js support changes quickly. Before Phase 3, open the [OpenNext Cloudflare docs](https://opennext.js.org/cloudflare) and confirm the adapter still lists "all minor and patch versions of Next.js 16" as supported, and that its `next` peer dependency covers the version in `package.json`.

---

## Contents

0. [Status and corrections (2026-11-20)](#0-status-and-corrections-2026-11-20)
1. [Decisions to make](#1-decisions-to-make)
2. [Dependency inventory](#2-dependency-inventory)
3. [What's hard or blocked on Cloudflare](#3-whats-hard-or-blocked-on-cloudflare)
4. [Phase 0: Prerequisites](#phase-0--prerequisites)
5. [Phase 1: Cloudflare account and Wrangler login](#phase-1--cloudflare-account-and-wrangler-login)
6. [Phase 2: Create the Cloudflare resources](#phase-2--create-the-cloudflare-resources)
7. [Phase 3: Code and config changes](#phase-3--code-and-config-changes)
8. [Phase 4: Run it locally](#phase-4--run-it-locally)
9. [Phase 5: Secrets and environment variables](#phase-5--secrets-and-environment-variables)
10. [Phase 6: First deploy (staging on workers.dev)](#phase-6--first-deploy-staging-on-workersdev)
11. [Phase 7: CI/CD and preview deployments](#phase-7--cicd-and-preview-deployments)
12. [Phase 8: Test every feature on staging](#phase-8--test-every-feature-on-staging)
13. [Phase 9: Buy the domain and attach it](#phase-9--buy-the-domain-and-attach-it)
14. [Phase 10: Email for the domain](#phase-10--email-for-the-domain)
15. [Phase 11: Update everything that references the old URL](#phase-11--update-everything-that-references-the-old-url)
16. [Phase 12: Cutover](#phase-12--cutover)
17. [Phase 13: Rollback plan](#phase-13--rollback-plan)
18. [Phase 14: Decommission Vercel](#phase-14--decommission-vercel)
19. [Phase 15: Preparing for Stripe and affiliate links](#phase-15--preparing-for-stripe-and-affiliate-links)
20. [Final checklist](#final-checklist)
21. [Troubleshooting](#troubleshooting)
22. [Reference links](#reference-links)

## 0. Status and corrections (2026-11-20)

The migration was carried out on branch `feat/cloudflare-migration` (base `main` at `5ee9331`, which is 15 commits newer than the `7dcbe91` this guide audited). **The repo is now the source of truth:** where a snippet below differs from the committed file, the committed file wins. What actually exists:

| Item | State |
| --- | --- |
| Worker | `otakuvault` on account subdomain `conrad-seegert`: <https://otakuvault.conrad-seegert.workers.dev> |
| Custom domains | `otakuvault.app` and `www.otakuvault.app` (Workers Custom Domains, declared in `wrangler.jsonc` `routes`). `www` → apex is a zone Redirect Rule (301, path and query kept). |
| Zone settings | SSL **Full (strict)**, Always Use HTTPS **on**, minimum TLS **1.2**. HSTS still off (turn on after a stable week, Phase 12). The zone had **no DNS records** before the migration (no email records to keep). |
| Hyperdrive | `otakuvault-db` → production Neon `main` branch, direct (non-pooler) host, **caching disabled**. Uses the existing owner role (the "simpler alternative" in 2.1); no `hyperdrive_user` role was created. |
| R2 | `otakuvault-cache` (Next incremental cache), `otakuvault-media` (uploads; public at `img.otakuvault.app`). Both in `enam`. |
| D1 | `otakuvault-tag-cache` (tag cache). Its table is created by `opennextjs-cloudflare deploy` itself. |
| Images | `IMAGES` binding, used for upload normalization. |
| Cron Trigger | `0 * * * *` → `scheduled()` in `cloudflare/worker.ts` → `POST /api/jobs/new-episodes` with `CRON_SECRET`, through the app's own fetch handler. |
| Worker secrets | `BETTER_AUTH_SECRET` (new value), `CRON_SECRET` (new; it was never set on Vercel), `ANILIST_RELAY_SECRET`. No OAuth secrets: OAuth isn't set up yet, so only email/password sign-in exists. |
| CI/CD | GitHub Actions `.github/workflows/deploy.yml` (repo secrets `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`). |
| Staging Worker (D8) | **Not created yet.** It needs a Neon `staging` branch, which needs Neon console/API access. Until then, PR previews are unpromoted versions of the production Worker (production data). |
| Vercel | Project `otaku-vault` (`https://otaku-vault-gold.vercel.app`) still serves and is the rollback. It also hosts the temporary AniList relay. |

**Corrections to the plan below** (each is also fixed or flagged in place):

1. **AniList blocks Cloudflare Workers.** Every request from a Worker gets `403 "You have been manually blocked. Please come to the principal's office."`, whatever the User-Agent (checked from a throwaway probe Worker). The inventory said "Works". Fix in place: `ANILIST_API_URL` on the Worker points at a **temporary relay** route on the Vercel project (`app/api/anilist-relay`: POST only, fixed upstream, `x-relay-secret` required, active only on Vercel with `ANILIST_RELAY_SECRET` set). Long-term fix: a local title catalog that a sync job fills off Cloudflare, so pages stop calling AniList at request time. After that, the relay is only needed by whatever still calls AniList from Cloudflare; **delete the relay, its env vars and (Phase 14) the Vercel project once nothing on Cloudflare uses it.**
2. **There is a cron job** (`/api/jobs/new-episodes`, PR #3). The inventory said none. It runs from a Cron Trigger via a custom Worker entry (`cloudflare/worker.ts`), not a separate Worker as 15.4 suggested.
3. **`@vercel/blob` and `sharp` stay until cutover (D5, 3.1).** Removing them would break the Vercel build of `main` the moment this branch merges, and Vercel is the rollback. `lib/storage.ts` has three drivers: `r2` (Workers, set in `wrangler.jsonc`), `blob` (Vercel, default in production elsewhere) and `local` (dev). sharp and Blob are imported lazily, so they never reach the Worker bundle. Remove them in Phase 14. As a consequence, Phase 12 step 1 (disconnect Vercel Git so its build doesn't fail) is no longer needed.
4. **CI/CD is GitHub Actions, not Workers Builds (D7).** Workers Builds needs the Cloudflare GitHub App authorized in the dashboard, which an API token can't do. Actions also gates deploys on lint and typecheck. Don't also connect Workers Builds, or every push deploys twice.
5. **`initOpenNextCloudflareForDev()` must not run unconditionally (3.4).** It doesn't check the Next phase, so it would start miniflare during `next build` (Vercel, CI) and make plain `pnpm dev` demand a local Hyperdrive connection string. It now runs only in `next dev` with `CF_DEV_BINDINGS=1`. Dev doesn't need bindings otherwise (Node uses `DATABASE_URL` and the local upload driver).
6. **`opennextjs-cloudflare deploy`/`upload` need `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE`** even for a remote deploy (it starts a local platform proxy). Any dummy value works; `deploy.yml` sets one.
7. **D1 tag-cache table (2.4):** the current OpenNext schema has `stale` and `expire` columns, and `deploy` creates the table itself. Skip the manual `CREATE TABLE`.
8. **Vercel env vars can't be pulled.** All of them are marked Sensitive, so `vercel env pull` returns `"[SENSITIVE]"`. Values have to come from their source (Neon console, provider consoles) or be regenerated.
9. **The Vercel production URL is `https://otaku-vault-gold.vercel.app`** (project `otaku-vault`), not `otakuvault.vercel.app`.
10. **`wrangler types` runtime types clash with the DOM in one place:** HTMLRewriter's `Element.prepend(string | Response | ReadableStream)` merges into the DOM `Element`. `ThemeFx.tsx` uses `insertBefore` instead.
11. **Known log noise:** each DB-backed request logs `unhandledRejection: TypeError: This socket has been closed.` from `pg-cloudflare@1.4.1` tearing down its socket after the query finished (`maxUses: 1`). Responses are correct. Recheck when `pg` updates.
12. **Worker size:** 2.86 MiB gzipped (limit 10 MiB on Paid). Workers Paid is still needed for CPU time (password hashing).
13. **Verified end to end** on both workers.dev and `otakuvault.app` (40 checks): public pages, `proxy.ts` redirects, sign-up/in/out, theme change, upload → Images → R2 → `img.otakuvault.app`, forum thread + reply + nested reply + vote, cron route and Cron Trigger. Smoke-test accounts are named `smoke…@example.com`, with forum threads titled `Smoke test …` in category Meta.

---

## 1. Decisions to make

Make these before you start. The recommended option is listed first, and the rest of the guide assumes it.

| # | Decision | Recommended | Alternatives and trade-offs |
| --- | --- | --- | --- |
| D1 | **Adapter** | **OpenNext (`@opennextjs/cloudflare`) on Workers.** Mature, supports Next 16, Cache Components / PPR, `'use cache'`, `after()`, and (experimental) Node `proxy.ts`. | **vinext** (Vite reimplementation of Next's API): Cloudflare's docs now put it first, but it's **beta** and reimplements Next rather than running it. Not worth the risk for an app about to take payments. **Cloudflare Pages / `next-on-pages`**: deprecated for Next.js; don't use it. |
| D2 | **Workers plan** | **Workers Paid ($5/month).** | Free plan limits: 3 MiB compressed Worker size (a Next.js app with 14 fonts, Better Auth and Drizzle will very likely exceed this) and 10 ms CPU per request (SSR plus password hashing will exceed it). Treat Paid as required. |
| D3 | **Database connection** | **Keep Neon. Connect through Cloudflare Hyperdrive with the existing `pg` driver, with Hyperdrive query caching disabled.** No data migration. | Neon's HTTP driver (`neon-http`) can't run interactive transactions, and the app uses `db.transaction()` in 8 places (entries, pins, forum). Neon's WebSocket driver works but has the same "no global pool" rule as `pg` and gives you nothing extra. |
| D4 | **Image processing** (replaces `sharp`) | **Cloudflare Images binding** (`env.IMAGES`): resize to 1200 px, JPEG q85, matte background, on the server. Free for 5,000 unique transformations/month, then $0.50 per 1,000. Each upload is one transformation. | **Client-side only**: the browser always re-encodes to JPEG ≤1200 px (most of the code is already in `lib/image.ts`), and the server only validates with `env.IMAGES.info()` (free). Costs nothing, but the server trusts the client's encoding. Pick this if you expect more than ~5,000 uploads a month. |
| D5 | **Upload storage** (replaces Vercel Blob) | **R2 bucket `otakuvault-media`, served publicly at `img.yourdomain.com`.** There are no real users, so nothing is copied: R2 starts empty. **Done, but `@vercel/blob` stays (as the `blob` driver) until Phase 14 so Vercel keeps working as the rollback** (section 0, item 3). | Keep Vercel Blob (it's an HTTP API and works from Workers). Not worth it: it ties you to a Vercel account. |
| D6 | **Next.js cache backend** | **R2 incremental cache + D1 tag cache + Durable Object queue.** Today the app doesn't use `'use cache'` or `revalidateTag`, so this mostly serves prerendered shells. It's in place for when the store needs product caching. | Minimal option: R2 incremental cache only (what `opennextjs-cloudflare migrate` generates). Fine today, but you'll have to add the rest the first time you call `revalidateTag`/`updateTag`. |
| D7 | **CI/CD** | **Chosen instead: GitHub Actions deploy** (`.github/workflows/deploy.yml`, section 0 item 4). Originally recommended: **Workers Builds** (Cloudflare's Git integration). Production deploys from `main`, every other branch uploads a preview version, and PRs get a preview link. Keep the existing GitHub Actions `ci.yml` for lint and build. | **GitHub Actions deploy** (YAML in [Phase 7B](#7b-alternative-deploy-from-github-actions)). Use it if Workers Builds can't install `pnpm@12.10.1`, or if you want deploys gated on CI passing. |
| D8 | **Preview/staging data** | **A separate `otakuvault-staging` Worker using a Neon branch and its own R2 bucket.** (Not created yet: needs Neon access. Section 0.) Use it for the parallel run and for PR testing. | Preview *versions* of the production Worker share **all production bindings and secrets**: same database, same bucket. Only use those for a last check before promoting. |
| D9 | **Domain registrar** | **Cloudflare Registrar** (at-cost pricing, no markup, free WHOIS privacy). Supports `.com`, `.net`, `.org`, `.io`, `.ai`, `.app`, `.dev`, `.co`, `.me`, `.tv`, `.xyz`, `.shop`, `.store`, `.club`, `.fun`, `.online`, `.site`, and 400+ more. | **Not supported as of this writing: `.gg`, `.moe`, `.anime`**, and IDN (non-ASCII) names. For those, buy at Porkbun, Namecheap or similar, then point the nameservers at Cloudflare (Phase 9B). A domain registered with Cloudflare must keep Cloudflare nameservers. |
| D10 | **Apex vs www** | **`yourdomain.com` canonical, `www` 301 → apex.** | `www` canonical is equally valid. Pick one, then set `BETTER_AUTH_URL`, the OAuth callbacks and Stripe to that exact origin. |
| D11 | **Sending email** | **A dedicated transactional provider (Resend, Postmark or Amazon SES) on a subdomain like `mail.yourdomain.com`.** | **Cloudflare Email Service** (send from Workers via `env.EMAIL.send()`) is in **public beta** since 2026-04-16 and needs Workers Paid. Fine for auth emails if you accept beta status. Receiving is a separate, free product (Email Routing). |

---

## 2. Dependency inventory

Audited from the code on `main` at `7dcbe91`. Rows that turned out wrong are corrected inline (marked **Corrected**); see section 0.

| What the app uses | Where | Vercel-specific? | Cloudflare equivalent | Effort |
| --- | --- | --- | --- | --- |
| **Next.js 16.4.5**, App Router, `cacheComponents: true`, `partialPrefetching`, Turbopack, `experimental.agentFeedback` | `next.config.ts` | No (but Vercel is the only verified adapter) | OpenNext adapter on Workers. Supports Next 16, PPR and Cache Components. | **M**: new config files, build scripts |
| **Hosting / build / deploy** from GitHub, preview per branch | Vercel Git integration; `DEPLOYMENT.md` | Yes | Workers Builds, or GitHub Actions + `wrangler` | **S** |
| **`proxy.ts`** (Next 16 proxy, Node runtime): cookie-only redirect to `/login` | `proxy.ts` | No | OpenNext: "experimental support since 1.20.3". Logic is tiny, so there's a fallback if it misbehaves (Troubleshooting). | **S**, but test it |
| **Postgres on Neon via `pg` `Pool` (global singleton)** + Drizzle `node-postgres` | `lib/db/index.ts` | No | **Hyperdrive** + `pg` ≥ 8.16.3 (you have 8.23.1). **The global pool must become per-request:** reusing a pooled connection across requests breaks on Workers. | **M**: rewrite one file. The 20 importers of `db` stay unchanged (see 3.4). |
| `db.transaction()` (8 call sites) | `app/actions/entries.ts`, `pins.ts`, `forum.ts` | No | Works over Hyperdrive + `pg`. Rules out Neon HTTP. | none |
| **Drizzle migrations** (`drizzle-kit`, `./drizzle`) | `drizzle.config.ts`, `package.json` | No | Unchanged: still run from your machine with the Neon **direct** URL. | none |
| **Better Auth** (email/password + Google/Discord/GitHub OAuth), `nextCookies()` plugin, catch-all `/api/auth/[...all]` | `lib/auth.ts`, `app/api/auth/[...all]/route.ts` | No | Runs on Workers with `nodejs_compat`. Needs `BETTER_AUTH_URL` and all OAuth callbacks updated to the new domain. Existing test sessions won't carry over (cookies are per domain). | **S** |
| **`@vercel/blob`** (`put`, `del`): covers, moodboard images, avatars, forum images; public URLs `*.public.blob.vercel-storage.com` | `lib/storage.ts`, `lib/image.ts` (`isStoredImage`), DB columns | **Yes** | **R2** bucket via binding + public custom domain `img.yourdomain.com`. No data to copy (no real users); test rows pointing at Blob can be wiped or left to break (Phase 12 step 4). | **M** |
| **`sharp`** (native): decode/validate, EXIF-rotate, resize 1200 px, flatten on `#12121a`, mozjpeg q85 | `lib/storage.ts` → `app/actions/uploads.ts` | No, but **native modules can't run on Workers** | **Cloudflare Images binding** (`env.IMAGES`), or client-side encode + `env.IMAGES.info()` (D4). | **M**: blocker until replaced |
| Local upload driver (`node:fs` → `public/uploads`) | `lib/storage.ts` | No | Dev-only. Keep it for `next dev`; never used on Workers. | none |
| Server Actions with 1 MB body cap (uploads ≤ 900 KB) | `app/actions/*.ts` | No | Supported. Workers request bodies allow up to 100 MB on Paid. | none |
| `connection()`, Suspense streaming, PPR shells | `app/**` | No | Supported (streaming works on Workers). Prerendered shells are served from the incremental cache, populated on each deploy. | none |
| ISR / `revalidate*` / `'use cache'` / `cacheTag` | **not used** | n/a | R2 incremental cache + D1 tag cache + DO queue, ready for later (D6) | **S** |
| `next/image` | **not used** (`<img>` everywhere, deliberately) | n/a | Nothing to do. If you add it later, use the `IMAGES` binding (OpenNext supports it) or a custom loader. | none |
| `next/font/google` (14 families) | `app/fonts.ts` | No | Self-hosted at build time; needs network during the build (Workers Builds and GitHub Actions both have it). Fonts add to static assets, not Worker size. | none |
| AniList GraphQL `fetch` | `lib/anilist.ts`, `lib/jobs/new-episodes.ts` | No | **Corrected: blocked.** AniList returns 403 "manually blocked" to all Cloudflare Workers traffic. Temporary relay on Vercel (`app/api/anilist-relay`, `ANILIST_API_URL` + `ANILIST_RELAY_SECRET`); long-term a local catalog synced off Cloudflare. | **M–L** |
| Cron jobs | **Corrected:** `/api/jobs/new-episodes` (PR #3), never scheduled on Vercel (`CRON_SECRET` wasn't set there) | n/a | Cron Trigger `0 * * * *` → `scheduled()` in `cloudflare/worker.ts` | **S** |
| `vercel.json` / `vercel.ts` | **none** | n/a | `wrangler.jsonc` | n/a |
| `@vercel/analytics`, `@vercel/speed-insights`, Edge/Global Config, `@vercel/og` | **none** | n/a | Optional: Cloudflare Web Analytics (free, no code) | none |
| `export const runtime = "edge"` | **none** | n/a | (OpenNext doesn't support the edge runtime, so it's good there are none) | none |
| Sitemap / robots / `metadataBase` / canonical / `NEXT_PUBLIC_SITE_URL` | **none exist yet** | n/a | Add them during the domain step (11.3). Needed for SEO and absolute URLs in Stripe redirects. | **S** |
| CI (`.github/workflows/ci.yml`: lint + build) | `.github/` | No | Keep. Optionally add the deploy job (7B). | **S** |
| Env vars | `.env.example`, `DEPLOYMENT.md` | Partly (`BLOB_READ_WRITE_TOKEN`, `VERCEL_BLOB_READ_WRITE_TOKEN`, `ENABLE_EXPERIMENTAL_COREPACK`) | Wrangler secrets/vars + bindings (Phase 5) | **S** |

> **Env var audit note:** `vercel env ls` failed with "codebase isn't linked", so the variable names above come from `.env.example` and `DEPLOYMENT.md`. To confirm nothing is missing, run `vercel link` (pick the existing `otakuvault` project), then `vercel env ls production`. Only names are shown; values stay hidden. Anything listed there that isn't in the Phase 5 table needs a home on Cloudflare.

---

## 3. What's hard or blocked on Cloudflare

These are the parts that need real code changes. Phase 3 has the full code for each one.

1. **`sharp` can't run on Workers (blocker).** It's a native Node addon. Image upload normalization has to move to the Cloudflare Images binding (or to the browser). EXIF auto-rotation and metadata stripping should be checked once on staging with a real phone photo (Phase 8). The Images docs don't spell these out for the binding.
2. **Vercel Blob → R2.** Code change only: `lib/storage.ts` writes to R2 instead of Blob. There's no data to move.
3. **Global `pg` Pool → per-request client.** Workers won't let one request use a socket opened by another. `lib/db/index.ts` must create the pool per request. The guide keeps the exported `db` name, so the 20 files importing it don't change.
4. **`proxy.ts` support is experimental** in OpenNext. Yours only checks for a cookie, so if it misbehaves, the same check can move into the five protected pages (Troubleshooting).
5. **Preview deployments share production data** unless you use a separate staging Worker (D8).
6. **Windows:** OpenNext doesn't guarantee Windows support. You're on WSL2 with the repo under `/home`, which is the supported setup. Keep it out of `/mnt/c/...`.
7. **Not blocked, just different:** no Vercel "Instant Rollback" button. You use `wrangler rollback` or the dashboard's Deployments tab instead (Phase 13).

---

## Phase 0: Prerequisites

1. **Node 22** (you have v22 via nvm). Check: `node -v`.
2. **pnpm 12.10.1** (from `packageManager`). Check: `pnpm -v`. If it differs: `corepack enable && corepack prepare pnpm@12.10.1 --activate`.
3. **Access to:** Neon console, Vercel dashboard (project `otakuvault`), GitHub repo `Darnok17/otakuvault`, Google Cloud Console / Discord developer portal / GitHub OAuth Apps (whichever providers are enabled).
4. **A payment card** for Workers Paid ($5/month) and the domain.
5. **Rough time budget:** Phases 1–8 take about one focused day. Phase 9 DNS can take minutes to 24 hours. Plan the cutover for a low-traffic hour.

---

## Phase 1: Cloudflare account and Wrangler login

1. Go to <https://dash.cloudflare.com/sign-up>. Create an account and verify your email.
2. **Turn on 2FA:** profile icon (top right) → **My Profile** → **Authentication** → **Two-Factor Authentication**. This account will control your domain and payments infrastructure.
3. **Pick your workers.dev subdomain:** left sidebar → **Compute (Workers)** → **Workers & Pages**. The first visit asks for a subdomain. Pick something like `otakuvault` → your URLs become `*.otakuvault.workers.dev`. This is `<account-subdomain>` below.
4. **Subscribe to Workers Paid:** **Workers & Pages** → **Plans** (or **Manage account → Billing → Subscriptions**) → **Workers Paid** → **Purchase**.
5. **Enable R2:** sidebar → **Storage & Databases** → **R2 Object Storage** → **Purchase R2 Plan**. The free tier is 10 GB storage and has no egress fees, but you still have to activate it with a card.
6. **Log in from WSL** (inside the repo):

   ```bash
   cd ~/projects/otakuvault
   pnpm dlx wrangler@latest login     # opens a browser; approve
   pnpm dlx wrangler@latest whoami    # note the Account ID it prints
   ```

   If the browser doesn't open from WSL, copy the URL it prints into your Windows browser. The callback goes to `localhost:8976`, which WSL2 forwards by default.

---

## Phase 2: Create the Cloudflare resources

Run these from the repo root. Copy every **ID** they print into a scratch note. You'll paste them into `wrangler.jsonc`.

### 2.1 Neon: a role for Hyperdrive, and a staging branch

1. Neon console → project `otakuvault` → **Roles** (under the branch) → **New Role** → name `hyperdrive_user` → **Create**. **Copy the password now.** Neon won't show it again.
2. Give the role access to the tables. Open **SQL Editor** on the `main` branch, database `neondb` (or whatever yours is called), and run:

   ```sql
   -- Run as the owner role. Adjust the schema if you use one other than public.
   GRANT USAGE ON SCHEMA public TO hyperdrive_user;
   GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO hyperdrive_user;
   GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO hyperdrive_user;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO hyperdrive_user;
   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT ON SEQUENCES TO hyperdrive_user;
   ```

   (Simpler alternative: skip the new role and use your existing owner role's direct URL in the next step. The separate role means the Worker can't drop tables, and migrations still run as owner from your machine.)
3. **Get the direct connection string:** project → **Connect** → choose the branch `main`, the database, role `hyperdrive_user` → **turn "Connection pooling" OFF** → copy. It looks like `postgresql://hyperdrive_user:<pw>@ep-xxxx.us-east-1.aws.neon.tech/neondb?sslmode=require`. Hyperdrive does its own pooling, so it should use the direct (non-`-pooler`) host.
4. **Create the staging branch:** project → **Branches** → **Create branch** → name `staging`, parent `main`, "Current data" → **Create**. Repeat steps 1–3 for this branch (roles are per branch, so check that `hyperdrive_user` exists there too) and copy its direct URL.

### 2.2 Hyperdrive configs (production and staging)

```bash
pnpm dlx wrangler@latest hyperdrive create otakuvault-db \
  --connection-string="postgresql://hyperdrive_user:<PASSWORD>@<MAIN-DIRECT-HOST>/neondb?sslmode=require" \
  --caching-disabled

pnpm dlx wrangler@latest hyperdrive create otakuvault-db-staging \
  --connection-string="postgresql://hyperdrive_user:<PASSWORD>@<STAGING-DIRECT-HOST>/neondb?sslmode=require" \
  --caching-disabled
```

- Note each `id`.
- **Why `--caching-disabled`:** Hyperdrive caches read queries for up to 60 s by default and doesn't know when your writes make them stale. OtakuVault is a read-after-write app (save an entry, see it in the list; post a reply, see it in the thread; later, check a Stripe order status), so stale reads would look like bugs. You can turn caching on per config later if you want it.
- If your shell history worries you (it contains the password), run `history -d $((HISTCMD-1))` afterwards, or paste the string through the dashboard instead: **Storage & Databases → Hyperdrive → Create configuration**.

### 2.3 R2 buckets

```bash
pnpm dlx wrangler@latest r2 bucket create otakuvault-cache           # Next.js incremental cache (prod)
pnpm dlx wrangler@latest r2 bucket create otakuvault-cache-staging
pnpm dlx wrangler@latest r2 bucket create otakuvault-media           # user uploads (prod)
pnpm dlx wrangler@latest r2 bucket create otakuvault-media-staging
```

Optional: add `--location enam` (Eastern North America) to the media buckets to keep them near Neon `us-east-1`.

You'll connect `img.yourdomain.com` to `otakuvault-media` in Phase 9. Until then, for staging only, enable the dev URL: dashboard → **R2** → `otakuvault-media-staging` → **Settings** → **Public Development URL** → **Enable** → type `allow`. Copy the `https://pub-<hash>.r2.dev` URL. (r2.dev is rate-limited and not for production.)

### 2.4 D1 database for the tag cache

```bash
pnpm dlx wrangler@latest d1 create otakuvault-tag-cache
pnpm dlx wrangler@latest d1 create otakuvault-tag-cache-staging
```

Note each `database_id`. OpenNext's D1 tag cache stores revalidation timestamps in a `revalidations` table.

> **Corrected:** skip the commands below. `opennextjs-cloudflare deploy` runs `CREATE TABLE IF NOT EXISTS revalidations (tag TEXT NOT NULL, revalidatedAt INTEGER NOT NULL, stale INTEGER, expire INTEGER default NULL, UNIQUE(tag) ON CONFLICT REPLACE)` itself, and the two-column definition below is out of date.

Original step (obsolete):

```bash
for db in otakuvault-tag-cache otakuvault-tag-cache-staging; do
  pnpm dlx wrangler@latest d1 execute "$db" --remote --command \
    "CREATE TABLE IF NOT EXISTS revalidations (tag TEXT NOT NULL, revalidatedAt INTEGER NOT NULL, UNIQUE(tag) ON CONFLICT REPLACE);"
done
```

(Check the [OpenNext caching page](https://opennext.js.org/cloudflare/caching) for the current table definition before running this. If it differs, use theirs.)

### 2.5 Images

Nothing to create. The `images` binding in `wrangler.jsonc` is enough, and the free tier (5,000 unique transformations/month) applies automatically. To check usage later: dashboard → **Media → Images → Overview**.

### 2.6 Durable Objects

Nothing to create. The queue's Durable Object is declared in `wrangler.jsonc` and created on first deploy.

---

## Phase 3: Code and config changes

Do all of this on the `cloudflare-migration` branch. Commit as you go.

> **Done** on `feat/cloudflare-migration`. The snippets in this phase are the original plan; the committed files (`wrangler.jsonc`, `open-next.config.ts`, `cloudflare/worker.ts`, `next.config.ts`, `lib/db/index.ts`, `lib/storage.ts`, `lib/site.ts`) are what runs, and differ where section 0 says so.

### 3.1 Install the adapter and Wrangler

```bash
git switch -c cloudflare-migration
pnpm add @opennextjs/cloudflare@latest
pnpm add -D wrangler@latest
# Corrected: keep @vercel/blob and sharp until Phase 14 (section 0, item 3)
```

`lib/db/migrate-images.ts` (the old one-time data-URL backfill) imports `lib/storage.ts`. It still compiles after 3.9, but it can only run where there's a Worker context. There's no legacy data to backfill, so you can also delete the script and its `db:migrate-images` entry in `package.json`.

You *can* run `pnpm dlx @opennextjs/cloudflare migrate` instead. It generates `wrangler.jsonc`, `open-next.config.ts`, scripts and `.dev.vars`, and creates a cache bucket. If you do, compare what it wrote with the files below and merge. The files below add Hyperdrive, media, Images, D1, the DO queue and a staging environment, which `migrate` doesn't know about.

**Let pnpm run `workerd`'s install script.** Wrangler depends on `workerd`, which downloads its runtime binary in a postinstall step. Your `pnpm-workspace.yaml` only allows approved build scripts. Edit it:

```yaml
# pnpm-workspace.yaml
allowBuilds:
  esbuild: true
  unrs-resolver: false
  workerd: true
```

Then `pnpm install` again and check that `pnpm exec wrangler --version` works.

### 3.2 `wrangler.jsonc` (new file, repo root)

```jsonc
// wrangler.jsonc
{
  "$schema": "node_modules/wrangler/config-schema.json",
  "name": "otakuvault",
  "main": ".open-next/worker.js",
  // Use a recent date (on or before today). Bump it deliberately, then test.
  "compatibility_date": "2026-11-01",
  "compatibility_flags": ["nodejs_compat", "global_fetch_strictly_public"],

  "assets": { "directory": ".open-next/assets", "binding": "ASSETS" },

  // Run the Worker near the database instead of near the visitor; most requests make several queries.
  "placement": { "mode": "smart" },

  "observability": { "enabled": true },

  // OpenNext needs to call itself (cache queue, revalidation). Must match "name".
  "services": [{ "binding": "WORKER_SELF_REFERENCE", "service": "otakuvault" }],

  "hyperdrive": [
    { "binding": "HYPERDRIVE", "id": "<PROD_HYPERDRIVE_ID>" }
  ],

  "r2_buckets": [
    { "binding": "NEXT_INC_CACHE_R2_BUCKET", "bucket_name": "otakuvault-cache" },
    { "binding": "MEDIA", "bucket_name": "otakuvault-media" }
  ],

  "d1_databases": [
    { "binding": "NEXT_TAG_CACHE_D1", "database_name": "otakuvault-tag-cache", "database_id": "<PROD_D1_ID>" }
  ],

  "durable_objects": {
    "bindings": [{ "name": "NEXT_CACHE_DO_QUEUE", "class_name": "DOQueueHandler" }]
  },
  "migrations": [{ "tag": "v1", "new_sqlite_classes": ["DOQueueHandler"] }],

  "images": { "binding": "IMAGES" },

  // Non-secret runtime config. Secrets go in with `wrangler secret put` (Phase 5).
  "vars": {
    "BETTER_AUTH_URL": "https://otakuvault.<account-subdomain>.workers.dev",
    "STORAGE_DRIVER": "r2",
    "MEDIA_BASE_URL": "https://pub-REPLACE.r2.dev"
  },

  // ---- Staging: a separate Worker with its own DB branch, buckets and secrets ----
  "env": {
    "staging": {
      "name": "otakuvault-staging",
      "services": [{ "binding": "WORKER_SELF_REFERENCE", "service": "otakuvault-staging" }],
      "hyperdrive": [{ "binding": "HYPERDRIVE", "id": "<STAGING_HYPERDRIVE_ID>" }],
      "r2_buckets": [
        { "binding": "NEXT_INC_CACHE_R2_BUCKET", "bucket_name": "otakuvault-cache-staging" },
        { "binding": "MEDIA", "bucket_name": "otakuvault-media-staging" }
      ],
      "d1_databases": [
        { "binding": "NEXT_TAG_CACHE_D1", "database_name": "otakuvault-tag-cache-staging", "database_id": "<STAGING_D1_ID>" }
      ],
      "durable_objects": {
        "bindings": [{ "name": "NEXT_CACHE_DO_QUEUE", "class_name": "DOQueueHandler" }]
      },
      "images": { "binding": "IMAGES" },
      "vars": {
        "BETTER_AUTH_URL": "https://otakuvault-staging.<account-subdomain>.workers.dev",
        "STORAGE_DRIVER": "r2",
        "MEDIA_BASE_URL": "https://pub-<staging-hash>.r2.dev"
      }
    }
  }
}
```

Notes:
- Wrangler **does not inherit** bindings into `env.*` blocks, which is why staging repeats them all.
- `MEDIA_BASE_URL` for production becomes `https://img.yourdomain.com` in Phase 9. Until then, production isn't serving real users, so a placeholder is fine.
- Don't use Hyperdrive's `localConnectionString` here (it would commit a password). For local runs, use the env var shown in Phase 4.

### 3.3 `open-next.config.ts` (new file, repo root)

```ts
// open-next.config.ts
import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";
import { withRegionalCache } from "@opennextjs/cloudflare/overrides/incremental-cache/regional-cache";
import d1NextTagCache from "@opennextjs/cloudflare/overrides/tag-cache/d1-next-tag-cache";
import doQueue from "@opennextjs/cloudflare/overrides/queue/do-queue";

export default defineCloudflareConfig({
  incrementalCache: withRegionalCache(r2IncrementalCache, { mode: "long-lived" }),
  tagCache: d1NextTagCache,
  queue: doQueue,
});
```

The import paths above match the OpenNext docs at the time of writing. If one fails to resolve, check [opennext.js.org/cloudflare/caching](https://opennext.js.org/cloudflare/caching) for the current paths. They've been renamed before.

The DO queue's class (`DOQueueHandler`) is exported by the generated `.open-next/worker.js`. You don't write it.

### 3.4 `next.config.ts`: enable bindings in `next dev`

> **Corrected:** don't call `initOpenNextCloudflareForDev()` unconditionally as below. The committed `next.config.ts` exports a phase function and calls it only for `next dev` with `CF_DEV_BINDINGS=1` (section 0, item 5).

```ts
// next.config.ts
import type { NextConfig } from "next";
import { initOpenNextCloudflareForDev } from "@opennextjs/cloudflare";

const nextConfig: NextConfig = {
  experimental: {
    agentFeedback: true,
  },
  cacheComponents: true,
  partialPrefetching: true,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;

// Gives `next dev` access to Cloudflare bindings (getCloudflareContext) through Wrangler's local proxy.
initOpenNextCloudflareForDev();
```

### 3.5 `package.json` scripts

Add these and keep the existing ones (`build` must stay `next build`, because OpenNext calls it):

```jsonc
{
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "preview": "opennextjs-cloudflare build && opennextjs-cloudflare preview",
    "deploy": "opennextjs-cloudflare build && opennextjs-cloudflare deploy",
    "deploy:staging": "opennextjs-cloudflare build && opennextjs-cloudflare deploy --env staging",
    "upload": "opennextjs-cloudflare build && opennextjs-cloudflare upload",
    "cf-typegen": "wrangler types --env-interface CloudflareEnv cloudflare-env.d.ts"
    // ...existing db:* scripts unchanged
  }
}
```

Run `pnpm cf-typegen` once. It writes `cloudflare-env.d.ts` with typed `HYPERDRIVE`, `MEDIA`, `IMAGES` and so on. Commit that file, and re-run it whenever you change bindings.

> The flags for passing a Wrangler environment through OpenNext's CLI (`--env staging` above) have changed between releases. Run `pnpm exec opennextjs-cloudflare deploy --help` to confirm the syntax. If `--env` isn't accepted directly, use `opennextjs-cloudflare deploy -- --env staging` (arguments after `--` go to Wrangler).

### 3.6 `.gitignore`

Append:

```gitignore
# cloudflare / opennext
.open-next
.wrangler
.dev.vars*
!.dev.vars.example
```

### 3.7 `public/_headers` (new file)

Long cache for hashed build assets, served directly by Workers Static Assets:

```text
/_next/static/*
  Cache-Control: public,max-age=31536000,immutable
```

### 3.8 `lib/db/index.ts`: per-request database client (required)

Replace the whole file with the code below. It keeps the `db` export, so `lib/auth.ts`, every server action, `lib/*-db.ts` and the scripts don't change.

```ts
// lib/db/index.ts
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

type Db = NodePgDatabase<typeof schema>;

// On Workers a socket opened by one request can't be used by another, so each request gets its
// own Pool (through Hyperdrive, which does the real pooling) and connections are never reused.
// Everywhere else (next dev, tsx scripts, drizzle-kit) a single Pool on DATABASE_URL is fine.
const onWorkers = typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";

const perRequest = new WeakMap<object, Db>();
const globalForDb = globalThis as unknown as { nodeDb?: Db };

export function getDb(): Db {
  if (onWorkers) {
    const { env, ctx } = getCloudflareContext();
    let db = perRequest.get(ctx);
    if (!db) {
      const pool = new Pool({ connectionString: env.HYPERDRIVE.connectionString, maxUses: 1 });
      db = drizzle(pool, { schema });
      perRequest.set(ctx, db);
    }
    return db;
  }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  globalForDb.nodeDb ??= drizzle(new Pool({ connectionString: process.env.DATABASE_URL }), { schema });
  return globalForDb.nodeDb;
}

// Same `db` the rest of the app already imports; every property access resolves to this request's client.
export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    const real = getDb();
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export * from "./schema";
```

Why this shape:
- `getCloudflareContext().ctx` is the request's `ExecutionContext`, so it works as a per-request key. The `WeakMap` drops the client once the request is gone.
- `maxUses: 1` follows OpenNext's guidance: never hand a connection to a second query batch. Hyperdrive keeps the actual Postgres connections warm, so this costs little.
- Better Auth's Drizzle adapter reads `db._.fullSchema` and the query methods lazily (at request time), so passing it the proxy works. Checked against `@better-auth/drizzle-adapter@1.7.12`.
- The old top-level `throw` on missing `DATABASE_URL` is gone, because Workers don't need `DATABASE_URL`. Scripts and `next dev` still throw when it's missing.
- **CI build:** `ci.yml` sets a placeholder `DATABASE_URL`, and nothing connects at build time, so CI keeps working.

### 3.9 `lib/storage.ts`: R2 + Images instead of Blob + sharp (required)

Replace the file. It keeps the same exports (`normalizeImage`, `uploadName`, `uploadImage`, `isOwnedUpload`, `deleteImage`, `isDataImage`, `uploadDataUrl`, `MAX_IMAGE_WIDTH`), so `app/actions/uploads.ts` only needs the type change shown after the file.

```ts
// lib/storage.ts
import { randomUUID } from "node:crypto";
import { getCloudflareContext } from "@opennextjs/cloudflare";

// Image storage.
//   r2    (production, Workers): normalized with the Cloudflare Images binding, stored in the MEDIA
//         R2 bucket, served from MEDIA_BASE_URL (https://img.yourdomain.com).
//   local (next dev): stored as sent under public/uploads/<userId>/ (the browser already re-encodes
//         large images); no sharp, so nothing native ends up in the Worker bundle.
// STORAGE_DRIVER=local|r2 overrides the NODE_ENV default.

const driver = process.env.STORAGE_DRIVER ?? (process.env.NODE_ENV === "production" ? "r2" : "local");
const mediaBase = () => {
  const base = process.env.MEDIA_BASE_URL;
  if (!base) throw new Error("MEDIA_BASE_URL is not set");
  return base.replace(/\/$/, "");
};

const LOCAL_PREFIX = "/uploads/";

export const MAX_IMAGE_WIDTH = 1200;
const MAX_INPUT_PIXELS = 50_000_000;
const JPEG_QUALITY = 85;
// JPEG has no alpha; transparent areas get the card surface color instead of black.
const MATTE = "#12121a";

const streamOf = (bytes: Uint8Array) => new Blob([bytes]).stream();

// Re-encodes any image the Images binding can read as a JPEG at most MAX_IMAGE_WIDTH wide.
// Throws on anything that isn't a decodable image.
export async function normalizeImage(input: Uint8Array): Promise<Uint8Array> {
  if (driver === "local") {
    const { format } = sniff(input);
    if (!format) throw new Error("Not an image");
    return input;
  }
  const { env } = getCloudflareContext();
  const info = await env.IMAGES.info(streamOf(input)); // free; throws on non-images
  if ("width" in info && info.width * info.height > MAX_INPUT_PIXELS) throw new Error("Image too large");
  const out = await env.IMAGES.input(streamOf(input))
    .transform({ width: MAX_IMAGE_WIDTH, fit: "scale-down", background: MATTE })
    .output({ format: "image/jpeg", quality: JPEG_QUALITY });
  return new Uint8Array(await out.response().arrayBuffer());
}

// Minimal magic-byte check for the dev driver.
function sniff(b: Uint8Array): { format: string | null } {
  const hex = (n: number) => Array.from(b.subarray(0, n), (x) => x.toString(16).padStart(2, "0")).join("");
  if (hex(3) === "ffd8ff") return { format: "jpeg" };
  if (hex(8) === "89504e470d0a1a0a") return { format: "png" };
  if (hex(4) === "47494638") return { format: "gif" };
  if (hex(4) === "52494646" && new TextDecoder().decode(b.subarray(8, 12)) === "WEBP") return { format: "webp" };
  if (new TextDecoder().decode(b.subarray(4, 12)).startsWith("ftypavi")) return { format: "avif" };
  return { format: null };
}

// Unique, safe filename like "cover-<uuid>.jpg" for a kind such as "cover" or "moodboard".
export const uploadName = (kind: string) => `${kind.replace(/[^a-z0-9-]/gi, "")}-${randomUUID()}.jpg`;

const userDir = (userId: string) => {
  if (!/^[\w-]{1,100}$/.test(userId)) throw new Error("Invalid user id");
  return userId;
};

// Stores an already-processed image and returns its public URL.
export async function uploadImage(bytes: Uint8Array, filename: string, userId: string): Promise<string> {
  if (!/^[\w.-]{1,120}$/.test(filename) || filename.startsWith(".")) throw new Error("Invalid filename");
  const key = `uploads/${userDir(userId)}/${filename}`;

  if (driver === "r2") {
    const { env } = getCloudflareContext();
    await env.MEDIA.put(key, bytes, {
      httpMetadata: { contentType: "image/jpeg", cacheControl: "public, max-age=31536000, immutable" },
      onlyIf: { etagDoesNotMatch: "*" }, // uuid names never collide; never overwrite
    });
    return `${mediaBase()}/${key}`;
  }
  const { mkdir, writeFile } = await import("node:fs/promises");
  const path = await import("node:path");
  const file = path.join(process.cwd(), "public", key);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, bytes, { flag: "wx" });
  return `/${key}`;
}

// The R2 key for a URL we issued, or null if the URL isn't ours.
function mediaKey(url: string): string | null {
  try {
    const base = new URL(mediaBase());
    const u = new URL(url);
    if (u.protocol !== "https:" || u.host !== base.host) return null;
    return decodeURIComponent(u.pathname.slice(1));
  } catch {
    return null;
  }
}

// True for URLs this module issued under the user's own folder (local or R2).
export function isOwnedUpload(url: string, userId: string): boolean {
  const prefix = `${LOCAL_PREFIX}${userId}/`;
  if (url.startsWith(LOCAL_PREFIX)) return url.startsWith(prefix) && !url.includes("..");
  const key = driver === "r2" ? mediaKey(url) : null;
  return !!key && `/${key}`.startsWith(prefix) && !key.includes("..");
}

// Removes a stored image. URLs that aren't ours (remote covers, AniList art) are ignored, as is a
// file that's already gone.
export async function deleteImage(url: string): Promise<void> {
  if (url.startsWith(LOCAL_PREFIX)) {
    const { unlink } = await import("node:fs/promises");
    const path = await import("node:path");
    const publicDir = path.join(process.cwd(), "public");
    const file = path.resolve(publicDir, "." + url);
    if (!file.startsWith(path.join(publicDir, "uploads") + path.sep)) return;
    await unlink(file).catch((err: NodeJS.ErrnoException) => { if (err.code !== "ENOENT") throw err; });
    return;
  }
  const key = driver === "r2" ? mediaKey(url) : null;
  if (key?.startsWith("uploads/")) await getCloudflareContext().env.MEDIA.delete(key);
}

const DATA_URL = /^data:image\/[\w.+-]+;base64,/;
export const isDataImage = (v: unknown): boolean => typeof v === "string" && DATA_URL.test(v);

// Turns a legacy base64 data URL into a stored upload; returns the new URL.
export async function uploadDataUrl(dataUrl: string, kind: string, userId: string): Promise<string> {
  const bytes = Uint8Array.from(atob(dataUrl.replace(DATA_URL, "")), (c) => c.charCodeAt(0));
  return uploadImage(await normalizeImage(bytes), uploadName(kind), userId);
}
```

Then in `app/actions/uploads.ts`, change the two `Buffer` lines:

```ts
// app/actions/uploads.ts (only these lines change)
  let jpeg: Uint8Array;
  try {
    // Decoding with the Images binding is the real check: the MIME type is only what the browser claims.
    jpeg = await normalizeImage(new Uint8Array(await file.arrayBuffer()));
```

And in `lib/image.ts`, recognise the new host in `isStoredImage`. It's client code, so it needs a public, build-time variable:

```ts
// lib/image.ts (last line)
const MEDIA_HOST = process.env.NEXT_PUBLIC_MEDIA_HOST; // e.g. "img.yourdomain.com"
export const isStoredImage = (url: string) =>
  url.startsWith("data:") || url.startsWith("/uploads/") ||
  (!!MEDIA_HOST && url.startsWith(`https://${MEDIA_HOST}/`));
```

**Things to check on staging (Phase 8)**, because the Images docs don't state them for the binding:
- **EXIF orientation:** upload a portrait phone photo. If it comes out sideways, read the orientation with `info()` or switch to the client-side path in D4 (browsers apply EXIF orientation when drawing to a canvas, and canvas output carries no EXIF).
- **Metadata stripping:** download a stored image and run `exiftool` on it. If GPS data survives, add `metadata: "none"` to `.transform({...})` if the binding accepts it, or use the client-side path.
- **Background/flatten:** upload a transparent PNG and confirm the transparent area is `#12121a`, not black or white.

After this change nothing imports `sharp` or `@vercel/blob` (both removed in 3.1). Check with `grep -rn "sharp\|@vercel/blob" app lib`. Only the comment in `app/actions/uploads.ts` should match, and you can reword it.

### 3.10 `.env.example` and `.dev.vars.example`

Update `.env.example` (committed, no values) so the next person knows the new names:

```dotenv
# Local Postgres (docker compose). On Cloudflare the app uses the HYPERDRIVE binding instead.
DATABASE_URL=postgres://otaku:otaku@localhost:5432/otakuvault

# Generate with: openssl rand -base64 32
BETTER_AUTH_SECRET=
BETTER_AUTH_URL=http://localhost:3000

# Public site origin (build-time; used for metadataBase, sitemap, Stripe redirect URLs)
NEXT_PUBLIC_SITE_URL=http://localhost:3000

# Uploads: local in dev. On Cloudflare: STORAGE_DRIVER=r2 and MEDIA_BASE_URL=https://img.<domain>
STORAGE_DRIVER=
MEDIA_BASE_URL=
NEXT_PUBLIC_MEDIA_HOST=

# OAuth (optional — leave blank to disable a provider)
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
DISCORD_CLIENT_ID=
DISCORD_CLIENT_SECRET=
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=

# AniList GraphQL endpoint (optional)
ANILIST_API_URL=
```

Create `.dev.vars.example` (committed). It's what `wrangler dev` / `pnpm preview` read:

```dotenv
NEXTJS_ENV=development
```

Then copy it to `.dev.vars` (gitignored). Per OpenNext, keep real values in `.env` so `next dev` and `wrangler dev` both see them. `.dev.vars` only needs `NEXTJS_ENV`.

### 3.11 Commit

```bash
git add -A
git commit -m "Run on Cloudflare Workers via OpenNext (Hyperdrive, R2, Images)"
```

---

## Phase 4: Run it locally

### 4.1 Normal development (unchanged workflow)

```bash
pnpm db:up
pnpm dev
```

`next dev` runs in Node, uses `DATABASE_URL` and the local upload driver, and still has bindings available through `initOpenNextCloudflareForDev()`. Everything should behave exactly as before.

### 4.2 Inside the real Workers runtime (do this before every deploy that touches infra)

```bash
export CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE="postgres://otaku:otaku@localhost:5432/otakuvault"
STORAGE_DRIVER=r2 MEDIA_BASE_URL=http://localhost:8787/__local-media pnpm preview
```

- `pnpm preview` builds with OpenNext and serves on `http://localhost:8787` through `workerd`. This is where Workers-only breakage shows up: native modules, global I/O, Node APIs that aren't there.
- R2 and D1 are simulated locally under `.wrangler/state`. Local Images supports only `width`, `height`, `rotate` and `format`, so the matte background won't show. Use staging to check image output properly.
- Uploaded images won't display locally, because the simulated bucket has no public URL. That's expected; check uploads on staging.
- **Watch the build output** for the line reporting the Worker's gzip size. It must be under **10 MiB** (Paid). If it's close, see Troubleshooting.

---

## Phase 5: Secrets and environment variables

### 5.1 Where each variable lives on Cloudflare

| Name | Kind | Production value | Staging value | Notes |
| --- | --- | --- | --- | --- |
| `HYPERDRIVE` | binding | `otakuvault-db` | `otakuvault-db-staging` | Replaces `DATABASE_URL` at runtime |
| `MEDIA` | binding | R2 `otakuvault-media` | R2 `otakuvault-media-staging` | Replaces Blob |
| `IMAGES` | binding | (account) | (account) | Replaces sharp |
| `NEXT_INC_CACHE_R2_BUCKET`, `NEXT_TAG_CACHE_D1`, `NEXT_CACHE_DO_QUEUE`, `WORKER_SELF_REFERENCE` | bindings | see `wrangler.jsonc` | see `wrangler.jsonc` | OpenNext cache |
| `BETTER_AUTH_SECRET` | **secret** | new random value | different random value | `openssl rand -base64 32`. Reusing Vercel's value would keep cookies valid, but cookies are per domain anyway, so a new one costs nothing extra. |
| `BETTER_AUTH_URL` | var | `https://yourdomain.com` (Phase 11; workers.dev URL until then) | `https://otakuvault-staging.<account-subdomain>.workers.dev` | No trailing slash |
| `GOOGLE_CLIENT_ID` / `_SECRET` | **secret** | prod OAuth client | separate staging client (recommended) | |
| `DISCORD_CLIENT_ID` / `_SECRET` | **secret** | same app, add redirect | same app, add redirect | Discord allows several redirects per app |
| `GITHUB_CLIENT_ID` / `_SECRET` | **secret** | prod OAuth App | **separate OAuth App** | GitHub OAuth Apps allow one callback URL |
| `STORAGE_DRIVER` | var | `r2` | `r2` | |
| `MEDIA_BASE_URL` | var | `https://img.yourdomain.com` | `https://pub-<hash>.r2.dev` | |
| `NEXT_PUBLIC_SITE_URL` | **build** var | `https://yourdomain.com` | staging URL | Inlined at build time. Must be set where the build runs (7A step 6). |
| `NEXT_PUBLIC_MEDIA_HOST` | **build** var | `img.yourdomain.com` | `pub-<hash>.r2.dev` | Inlined at build time |
| `ANILIST_API_URL` | (unset) | | | Leave unset |
| `DATABASE_URL` | local only | | | Your machine: local Postgres, or Neon **direct** URL for `pnpm db:migrate` |
| `BLOB_READ_WRITE_TOKEN`, `VERCEL_BLOB_READ_WRITE_TOKEN` | drop | | | Blob is gone; remove from `.env.example` and your `.env` |
| `ENABLE_EXPERIMENTAL_COREPACK` | drop | | | Vercel-only |
| `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | **secret** (later) | live keys | test-mode keys | Phase 15 |

### 5.2 Set the secrets

Secrets can't be read back after you set them. Each command prompts you to paste the value, so it stays out of shell history.

```bash
# Staging first
for s in BETTER_AUTH_SECRET GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET DISCORD_CLIENT_ID DISCORD_CLIENT_SECRET GITHUB_CLIENT_ID GITHUB_CLIENT_SECRET; do
  pnpm exec wrangler secret put "$s" --env staging
done

# Production
for s in BETTER_AUTH_SECRET GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET DISCORD_CLIENT_ID DISCORD_CLIENT_SECRET GITHUB_CLIENT_ID GITHUB_CLIENT_SECRET; do
  pnpm exec wrangler secret put "$s"
done
```

- Skip any OAuth provider you don't use. The app disables a provider when either half is missing.
- If the Worker doesn't exist yet, Wrangler offers to create an empty one. Say yes.
- Check: `pnpm exec wrangler secret list` (and `--env staging`). Names only.
- Dashboard equivalent: **Workers & Pages → otakuvault → Settings → Variables and Secrets → Add** → Type **Secret**.

**Plain vars** live in `wrangler.jsonc` `vars`, so they're versioned with the code. Don't also set them in the dashboard: each deploy overwrites dashboard vars with the file's values. If you'd rather manage vars in the dashboard, remove them from `vars` and deploy with `opennextjs-cloudflare deploy -- --keep-vars`.

---

## Phase 6: First deploy (staging on workers.dev)

1. **Apply migrations to the staging Neon branch.** The branch was copied from `main`, so it should already be current. Run this anyway to be sure:

   ```bash
   DATABASE_URL='<STAGING owner DIRECT url>' pnpm db:migrate
   ```

2. **Deploy:**

   ```bash
   NEXT_PUBLIC_SITE_URL=https://otakuvault-staging.<account-subdomain>.workers.dev \
   NEXT_PUBLIC_MEDIA_HOST=pub-<staging-hash>.r2.dev \
   pnpm deploy:staging
   ```

   The deploy step also populates the remote incremental cache with the build's prerendered output.
3. Open `https://otakuvault-staging.<account-subdomain>.workers.dev`.
4. **Watch logs live** in a second terminal while you click around:

   ```bash
   pnpm exec wrangler tail otakuvault-staging --format pretty
   ```

   Or use the dashboard: **Workers & Pages → otakuvault-staging → Observability → Logs**.
5. **Register staging OAuth callbacks** (see `OAUTH_SETUP.md` for where each console lives):
   - `https://otakuvault-staging.<account-subdomain>.workers.dev/api/auth/callback/google` (staging Google client: Authorized redirect URIs. Also add the origin under Authorized JavaScript origins.)
   - `…/api/auth/callback/discord` (Discord app → OAuth2 → Redirects → Add)
   - `…/api/auth/callback/github` (new staging GitHub OAuth App: Authorization callback URL)
6. Then go through [Phase 8](#phase-8--test-every-feature-on-staging).

Once staging passes, deploy production to its own workers.dev URL. Nobody uses it yet, so it's safe:

```bash
NEXT_PUBLIC_SITE_URL=https://otakuvault.<account-subdomain>.workers.dev pnpm deploy
```

> Production on workers.dev talks to the **production** Neon database. Signing up there creates real rows, which is fine (the data is shared with the Vercel deployment). Don't run destructive tests there.

---

## Phase 7: CI/CD and preview deployments

### 7A. Workers Builds (not used)

> Not used: deploys run from GitHub Actions (7B, section 0 item 4). Kept for reference.

Do this after Phase 6, so the Workers already exist.

1. Dashboard → **Workers & Pages** → **otakuvault** → **Settings** → **Builds** → **Connect**.
2. Pick **GitHub** → authorize the Cloudflare app for the `Darnok17/otakuvault` repository only → select the repo.
3. **Production branch:** `main`. (Until cutover, `main` hasn't been merged, so nothing changes yet.)
4. **Build command:** leave empty. (The deploy command builds.)
5. **Deploy command:**

   ```bash
   pnpm exec opennextjs-cloudflare build && pnpm exec opennextjs-cloudflare deploy
   ```

   **Non-production branch deploy command:** turn on "Builds for non-production branches", then:

   ```bash
   pnpm exec opennextjs-cloudflare build && pnpm exec opennextjs-cloudflare upload
   ```

   (`upload` runs `wrangler versions upload`, which creates a preview version without promoting it.)
6. **Build variables and secrets** (Settings → Builds → Variables). These are only visible during the build, not at runtime:
   - `NODE_VERSION` = `22`
   - `NEXT_PUBLIC_SITE_URL` = `https://otakuvault.<account-subdomain>.workers.dev` (change to `https://yourdomain.com` in Phase 11)
   - `NEXT_PUBLIC_MEDIA_HOST` = (prod media host)
   - `NEXT_TELEMETRY_DISABLED` = `1`
   - If the install step uses the wrong pnpm version, add `PNPM_VERSION` = `12.10.1`. If that has no effect, put `corepack enable && corepack prepare pnpm@12.10.1 --activate && pnpm install --frozen-lockfile &&` in front of the deploy command. If the build image still can't run pnpm 12, use 7B.
7. **Root directory:** `/`. **Build watch paths:** leave as default (all files).
8. **Save**. Then push the `cloudflare-migration` branch. You should see a build under **Deployments → View build history**, and a preview link under the Worker's **Previews** section. With the Cloudflare GitHub app installed, the PR also gets a comment containing the preview URL.
9. **Staging Worker:** repeat steps 1–7 for **otakuvault-staging**. Production branch `staging` (create it in git), deploy command `pnpm exec opennextjs-cloudflare build && pnpm exec opennextjs-cloudflare deploy --env staging` (check the `--env` syntax as in 3.5), build vars set to the staging values. Push to the `staging` branch to update staging.

**Preview URL format:** a version preview looks like `https://<version-prefix>-otakuvault.<account-subdomain>.workers.dev`. Branch builds also get a stable alias `https://<branch>-otakuvault.<account-subdomain>.workers.dev`. Enable or disable these under **Settings → Domains & Routes → Preview URLs**.

> **Preview versions of `otakuvault` run with production bindings and secrets** (production database, production media bucket). Treat them as "production, unreleased". Do real feature testing on staging. Sign-in won't work on preview URLs anyway, because `BETTER_AUTH_URL` and the OAuth callbacks point elsewhere. Email/password sign-in may also fail Better Auth's origin check there.

### 7B. Deploy from GitHub Actions (used)

> **In use.** The committed `.github/workflows/deploy.yml` differs from the YAML below: it also runs `pnpm typecheck`, sets build placeholders and the dummy `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE`, never cancels a production deploy, and skips fork PRs. `NEXT_PUBLIC_SITE_URL` / `NEXT_PUBLIC_MEDIA_HOST` aren't needed: production builds default to `https://otakuvault.app` / `img.otakuvault.app` (`lib/site.ts`).

Use this if you'd rather deploy only after lint and build pass, or if Workers Builds can't run pnpm 12.

1. Cloudflare dashboard → profile → **My Profile → API Tokens → Create Token** → template **Edit Cloudflare Workers** → Account Resources: your account; Zone Resources: `yourdomain.com` (or All zones) → **Create** → copy.
2. GitHub → repo → **Settings → Secrets and variables → Actions**:
   - Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`
   - Variables: `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_MEDIA_HOST`
3. Add `.github/workflows/deploy.yml`:

```yaml
# .github/workflows/deploy.yml
name: Deploy to Cloudflare

on:
  push:
    branches: [main]
  pull_request:

concurrency:
  group: deploy-${{ github.ref }}
  cancel-in-progress: true

jobs:
  deploy:
    runs-on: ubuntu-latest
    timeout-minutes: 20
    env:
      NEXT_TELEMETRY_DISABLED: 1
      NEXT_PUBLIC_SITE_URL: ${{ vars.NEXT_PUBLIC_SITE_URL }}
      NEXT_PUBLIC_MEDIA_HOST: ${{ vars.NEXT_PUBLIC_MEDIA_HOST }}
      CLOUDFLARE_API_TOKEN: ${{ secrets.CLOUDFLARE_API_TOKEN }}
      CLOUDFLARE_ACCOUNT_ID: ${{ secrets.CLOUDFLARE_ACCOUNT_ID }}
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      # main → production; PRs → an unpromoted preview version
      - if: github.ref == 'refs/heads/main'
        run: pnpm exec opennextjs-cloudflare build && pnpm exec opennextjs-cloudflare deploy
      - if: github.event_name == 'pull_request'
        run: pnpm exec opennextjs-cloudflare build && pnpm exec opennextjs-cloudflare upload -- --preview-alias pr-${{ github.event.number }}
```

PR previews then get a stable URL at `https://pr-<number>-otakuvault.<account-subdomain>.workers.dev`. Check that `--preview-alias` is still the flag name with `pnpm exec wrangler versions upload --help`.

Don't run 7A and 7B at the same time on the same Worker, or every push deploys twice.

### 7C. Keep `ci.yml`

No changes needed. It runs `next build` with placeholder env, which still works.

---

## Phase 8: Test every feature on staging

Work through this list on `https://otakuvault-staging.<account-subdomain>.workers.dev` with `wrangler tail` running. It covers every route and server action in the app.

**Auth (`/login`, `/signup`, `/api/auth/*`, `proxy.ts`)**
- [ ] Sign up with email/password. The username field works, the Terms checkbox is enforced, and a taken username gives an error.
- [ ] The first account on a fresh DB becomes admin. (Staging was copied from prod, so it won't. Check that `isAdmin` stays false for new users.)
- [ ] Log out, log in, wrong password → error message.
- [ ] Google / Discord / GitHub sign-in round trip (each one you've enabled).
- [ ] Logged out, visit `/collection`, `/settings`, `/profile/edit`, `/forum/new`, `/admin/reports` → redirected to `/login?redirect=…` (**proxy.ts**), then sent back after login.
- [ ] Session survives a reload and a new tab.

**Home and browse (`/`, `/index-page/**`)**
- [ ] Home loads, and its board/data sections stream in.
- [ ] Every browse tab: `/index-page`, `/anime`, `/manga`, `/novels`, `/webtoons`, the trending/seasonal/ongoing/new/recent-translation sub-pages. AniList data appears.
- [ ] Title pages `/anime/[id]`, `/manga/[id]`, `/novels/[id]`, `/webtoons/[id]`: details, description "show more", actions (add to collection, pin), OG tags in the page source.

**Collection (`/collection`, moodboards)**
- [ ] New user gets starter entries.
- [ ] Add an entry via AniList search (autofill), and manually.
- [ ] **Upload a cover** (JPEG, PNG with transparency, a large phone photo in portrait, WebP, GIF). The URL is on the staging media host, it displays, orientation is correct, transparency shows as `#12121a`, file size is reasonable. Download one and check the EXIF with `exiftool`.
- [ ] Edit, rate (stars), progress, drag-and-drop reorder, delete + undo toast.
- [ ] Replace a cover → the old R2 object is deleted (check the bucket in the dashboard).
- [ ] Moodboard `/collection/[id]/moodboard`: add nodes, image node upload, wires, undo/redo, autosave indicator, reload persists.
- [ ] Public board `/boards/[entryId]`.

**Forum (`/forum`, `/forum/[threadId]`, `/forum/new`)**
- [ ] Create a thread (with an image and an attached entry/moodboard), reply, nested reply (depth 2), vote up/down (score changes, transactions), report a post.
- [ ] Admin: `/admin/reports` lists the report, and actions work.

**Store (`/store/**`)**
- [ ] `/store`, `/store/categories`, `/store/[productId]`, recommendations, cart add/remove (zustand persists), `/store/checkout` shows the "coming soon" state.

**Profiles and settings**
- [ ] `/profile/[username]`, public fields, pins, cards.
- [ ] `/profile/edit`: change display name and username, upload an avatar.
- [ ] `/settings`: change theme, and check that every theme (terminal, rustic, retro, minimal, comic-strip, manga) renders with its fonts and survives a reload. Account settings save.

**Static, legal, errors**
- [ ] `/terms`, `/privacy`, a non-existent URL → custom 404, favicon.
- [ ] Response headers on `/_next/static/...` include `immutable`.

**Operational**
- [ ] No errors in `wrangler tail` while doing all of the above, especially none mentioning "Cannot perform I/O on behalf of a different request" or "Worker exceeded CPU time limit".
- [ ] Dashboard → Worker → **Metrics**: CPU time per request well under the limit, and no 5xx.
- [ ] Hyperdrive dashboard shows connections, and Neon's **Monitoring** doesn't show a pile-up of connections.

---

## Phase 9: Buy the domain and attach it

### 9A. Buy through Cloudflare Registrar (if your TLD is supported)

1. Dashboard → **Domain Registration** → **Register Domains**.
2. Search for the name → pick the TLD → **Purchase**. Prices are at cost. Renewal costs the same as registration.
3. Fill in the contact details. **WHOIS redaction is on by default.** Leave it on.
4. Turn **Auto-renew** on (Domain Registration → Manage Domains → your domain → Configuration).
5. The domain shows up automatically as a zone in your account, using Cloudflare nameservers. Skip to 9C.

### 9B. Buy elsewhere (for `.gg`, `.moe`, `.anime`, etc.) or use a domain you already own

1. Buy at your registrar of choice. Turn on its WHOIS privacy and auto-renew.
2. Cloudflare dashboard → **Add a domain** (Websites → Add) → enter `yourdomain.com` → **Free** plan → let it scan DNS. For a fresh domain, delete any parking records it imports.
3. Cloudflare shows **two nameservers** (e.g. `ada.ns.cloudflare.com`, `bob.ns.cloudflare.com`).
4. At your registrar: domain → **Nameservers** → **Custom** → enter the two Cloudflare nameservers → save. **Turn off DNSSEC at the registrar first** if it's on (re-enable it through Cloudflare in step 6).
5. Wait for the zone to show **Active** (usually minutes, up to 24 h). Cloudflare emails you.
6. Zone → **DNS → Settings → DNSSEC → Enable** → copy the DS record into your registrar's DNSSEC settings. (With Cloudflare Registrar this is one click.)
7. **Transferring an existing domain to Cloudflare Registrar** (optional, later): the domain must be older than 60 days and unlocked. Get the auth/EPP code from the old registrar → **Domain Registration → Transfer Domains**. Transfers add a year of registration.

### 9C. Zone security baseline (do this before attaching the Worker)

All under the zone (`yourdomain.com`) in the dashboard:

1. **SSL/TLS → Overview → Configure → Full (strict).** Workers Custom Domains always serve over Cloudflare's certificate, so this mostly protects anything else you put behind the zone later.
2. **SSL/TLS → Edge Certificates:**
   - **Always Use HTTPS:** On
   - **Automatic HTTPS Rewrites:** On
   - **Minimum TLS Version:** TLS 1.2
   - **HSTS:** leave it **off until the site has worked on the domain for a week** (Phase 12 step 10). HSTS is hard to undo.
3. **Security → Bots:** leave **Bot Fight Mode OFF**. It challenges API clients and will block Stripe webhooks later (Phase 15). Use WAF rules instead if bots become a problem.

### 9D. Attach the domain to the Worker

1. **Workers & Pages → otakuvault → Settings → Domains & Routes → Add → Custom Domain** → `yourdomain.com` → **Add domain**. Cloudflare creates the DNS record and certificate. Don't create an `A`/`CNAME` for the apex by hand.
   - CLI alternative: add `"routes": [{ "pattern": "yourdomain.com", "custom_domain": true }]` to the top level of `wrangler.jsonc` and deploy.
2. **Do this only at cutover (Phase 12)** if you want the domain to go live at a specific moment. Attaching makes the site reachable immediately. It's also fine to attach it now and not announce it yet.
3. Optional staging domain: on **otakuvault-staging**, add a Custom Domain `staging.yourdomain.com`. Then update its `BETTER_AUTH_URL`, `NEXT_PUBLIC_SITE_URL` and OAuth callbacks to match. You can protect it with **Zero Trust → Access → Applications → Add → Self-hosted** (`staging.yourdomain.com`, allow only your email). Free for up to 50 users.

### 9E. www → apex redirect

> **Done differently:** `www.otakuvault.app` is a second Workers Custom Domain (so Cloudflare manages its DNS record and certificate) instead of an `AAAA 100::` record, and the zone Redirect Rule below answers it before the Worker runs.

1. **DNS → Records → Add record:** Type `AAAA`, Name `www`, IPv6 `100::`, **Proxy status: Proxied**. This placeholder record only exists so Cloudflare receives the traffic; the rule in step 2 answers it.
2. **Rules → Overview → Create rule → Redirect Rule** → choose the template **"Redirect from WWW to root"**. If no template is offered, build it yourself:
   - When: Hostname equals `www.yourdomain.com`
   - Then: Dynamic redirect, expression `concat("https://yourdomain.com", http.request.uri.path)`, status **301**, **Preserve query string** ✓
3. Test: `curl -sI https://www.yourdomain.com/forum?x=1` → `301` with `location: https://yourdomain.com/forum?x=1`.

### 9F. Media domain for R2

1. **R2 → otakuvault-media → Settings → Custom Domains → Add** → `img.yourdomain.com` → **Continue** → **Connect Domain**. Wait for **Active**.
2. **Caching** (uploads are immutable, uuid-named): **Caching → Cache Rules → Create rule** → name "media" → When: Hostname equals `img.yourdomain.com` → **Eligible for cache**, Edge TTL: **Use cache-control header if present**, otherwise 1 year; Browser TTL: respect origin → Deploy.
3. **Caching → Tiered Cache → Smart Tiered Caching:** On.
4. In `wrangler.jsonc`, set production `MEDIA_BASE_URL` to `https://img.yourdomain.com`. In Workers Builds (or GitHub vars), set `NEXT_PUBLIC_MEDIA_HOST` to `img.yourdomain.com`.
5. **Hotlink/abuse protection** (optional): Security → WAF → Custom rule. Block requests to `img.yourdomain.com` whose Referer isn't empty, your domain, or known social sites. Only do this if bandwidth abuse actually happens; it breaks image sharing.

---

## Phase 10: Email for the domain

You need two separate things: **receiving** (e.g. `support@yourdomain.com` forwarding to your Gmail) and **sending** (password resets, email verification, order confirmations). Stripe sends its own receipts from Stripe by default. Getting them sent from your domain is a Stripe setting that also needs DNS records (10.4).

### 10.1 Receiving: Cloudflare Email Routing (free)

1. Zone → **Email → Email Routing → Get started / Enable**.
2. **Destination addresses → Add** → your personal inbox → click the verification link sent to it.
3. **Routing rules → Create address:** `support@` → Send to → your inbox. Add `privacy@`, `abuse@`, `admin@` (the Terms/Privacy pages should list a contact address). Optionally turn on **Catch-all** → your inbox.
4. When prompted, click **Add records automatically**. Cloudflare adds three `MX` records (`route1/2/3.mx.cloudflare.net`) and a TXT SPF record `v=spf1 include:_spf.mx.cloudflare.net ~all`.

### 10.2 Sending: transactional provider on a subdomain

The app doesn't send email yet. Better Auth has email/password with no verification or reset, so you'll want this before taking payments. Set up the domain now so it's warmed up by then.

Recommended: send from **`mail.yourdomain.com`**. This keeps the sending provider's SPF/bounce records separate from the apex records used by Email Routing.

1. Create an account with the provider (Resend, Postmark, Amazon SES, …) → **Domains → Add domain** → `mail.yourdomain.com`.
2. The provider shows DNS records. Typically:
   - **DKIM:** one or more `TXT` or `CNAME` records like `resend._domainkey.mail` or `<selector>._domainkey.mail`
   - **SPF / return-path:** an `MX` and a `TXT` on a subdomain like `send.mail` (provider-specific)
3. Add each one in Cloudflare **DNS → Records**, exactly as shown. **Proxy status: DNS only** (grey cloud). Proxying breaks mail records.
4. Click **Verify** in the provider's dashboard.
5. Store the provider's API key as a Worker secret (`wrangler secret put RESEND_API_KEY`, for example) when you write the email code. Call the provider's HTTP API with `fetch`. SMTP libraries like Nodemailer don't work on Workers (no raw TCP for SMTP).

**Cloudflare Email Service alternative** (public beta since 2026-04-16, Workers Paid): add a `send_email` binding and call `env.EMAIL.send(...)` from the Worker. Domain onboarding happens in the dashboard under **Email → Email Sending**, and it adds its own DKIM/SPF records. It's a reasonable choice if you're fine with a beta for auth emails. Keep the provider option in mind for order receipts.

### 10.3 SPF, DKIM, DMARC: what you should end up with

| Record | Name | Value | Notes |
| --- | --- | --- | --- |
| MX ×3 | `@` | `route1/2/3.mx.cloudflare.net` | Added by Email Routing |
| TXT (SPF) | `@` | `v=spf1 include:_spf.mx.cloudflare.net ~all` | **Exactly one SPF record per name.** If you ever send *from the apex* via a provider, merge its include into this same record, e.g. `v=spf1 include:_spf.mx.cloudflare.net include:amazonses.com ~all`. Never add a second `v=spf1` record. |
| TXT/CNAME (DKIM) | `<selector>._domainkey.mail` | from provider | One per selector |
| TXT (SPF for sender) | as shown by provider (often `send.mail`) | from provider | |
| TXT (DMARC) | `_dmarc` | `v=DMARC1; p=none; rua=mailto:dmarc@yourdomain.com; adkim=r; aspf=r` | Start at `p=none`, read reports for 2–4 weeks, then move to `p=quarantine`, and later `p=reject`. |

- Make `dmarc@yourdomain.com` an Email Routing address so the reports reach you. Or turn on **Email → DMARC Management** in Cloudflare, which collects and charts the reports for you (free).
- If you *never* send mail from the apex, you can tighten the apex SPF to `-all` after the DMARC reports look clean.

### 10.4 Stripe receipts from your domain (do this in Phase 15)

Stripe Dashboard → **Settings → Business → Customer emails** (or **Emails → Custom email domain**) → add `yourdomain.com` → Stripe shows DKIM `CNAME` records and a return-path/bounce `CNAME` → add them in Cloudflare as **DNS only** → verify. Don't edit your SPF record unless Stripe's instructions explicitly ask you to.

---

## Phase 11: Update everything that references the old URL

There's no custom domain on Vercel today, so "old URL" means `https://otakuvault.vercel.app` (or whatever your Vercel production hostname is) and the workers.dev URLs.

### 11.1 Auth

1. **`BETTER_AUTH_URL`**: in `wrangler.jsonc` production `vars`, set `"BETTER_AUTH_URL": "https://yourdomain.com"`. It takes effect on the next deploy.
2. **Google:** Cloud Console → **APIs & Services → Credentials** → prod OAuth client → **Authorized JavaScript origins:** add `https://yourdomain.com`. **Authorized redirect URIs:** add `https://yourdomain.com/api/auth/callback/google` → Save. If the OAuth consent screen is in production mode, also add `yourdomain.com` under **OAuth consent screen → Branding → Authorized domains**, and update the homepage/privacy/terms links there.
3. **Discord:** developer portal → your app → **OAuth2 → Redirects → Add** → `https://yourdomain.com/api/auth/callback/discord` → Save.
4. **GitHub:** Settings → Developer settings → OAuth Apps → prod app → **Homepage URL** `https://yourdomain.com`, **Authorization callback URL** `https://yourdomain.com/api/auth/callback/github` → Update. (GitHub only allows one callback, so the switch is instant. Do this step at cutover, Phase 12 step 6.)
5. Keep the old Vercel callbacks registered until Phase 14, so Vercel keeps working if you roll back.
6. If you serve both `www` and apex without the redirect (not recommended), add `trustedOrigins: ["https://www.yourdomain.com"]` to `betterAuth({...})` in `lib/auth.ts`.

### 11.2 Site URL (new)

Set `NEXT_PUBLIC_SITE_URL=https://yourdomain.com` in the **build** environment (Workers Builds variables or GitHub Actions variables). It's inlined at build time, so the build that goes live must have it.

### 11.3 Add `metadataBase`, robots and a sitemap (small, recommended code additions)

These don't exist yet. Without `metadataBase`, any relative OG image URL would resolve wrong, and search engines won't have a canonical origin.

```ts
// app/layout.tsx: extend the existing metadata export
export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000"),
  title: "OtakuVault",
  description: "Personal collection tracker for anime, manga, webtoons, and novels.",
  alternates: { canonical: "/" },
};
```

```ts
// app/robots.ts
import type { MetadataRoute } from "next";

const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default function robots(): MetadataRoute.Robots {
  // Only the real domain is indexable; workers.dev and preview hosts are not.
  const isProd = site.startsWith("https://yourdomain.com");
  return {
    rules: isProd
      ? [{ userAgent: "*", allow: "/", disallow: ["/api/", "/admin/", "/settings", "/collection", "/profile/edit", "/store/cart", "/store/checkout"] }]
      : [{ userAgent: "*", disallow: "/" }],
    sitemap: isProd ? `${site}/sitemap.xml` : undefined,
  };
}
```

```ts
// app/sitemap.ts
import type { MetadataRoute } from "next";

const site = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";

export default function sitemap(): MetadataRoute.Sitemap {
  const paths = ["/", "/index-page", "/forum", "/store", "/store/categories", "/terms", "/privacy"];
  return paths.map((p) => ({ url: `${site}${p}`, changeFrequency: "daily" }));
  // Later: add /store/[productId] and public /forum/[threadId] URLs from the DB.
}
```

With `cacheComponents` on, check `pnpm build` output to see whether these prerender. If the build complains about dynamic data in `sitemap.ts` once you add DB queries, follow `node_modules/next/dist/docs` on Cache Components (`'use cache'` + `cacheLife`).

Per-page canonicals for title pages: in `app/_components/TitleDetail.tsx`'s `generateMetadata`, add `alternates: { canonical: \`/anime/${id}\` }` (and the equivalent for manga/novels/webtoons).

### 11.4 Other places to update

- [ ] `DEPLOYMENT.md`: rewrite for Cloudflare after the cutover (it currently documents Vercel).
- [ ] `OAUTH_SETUP.md`: production URLs.
- [ ] `README.md`: any vercel.app links.
- [ ] GitHub repo → **About** → Website field.
- [ ] Google Search Console: add a **Domain** property for `yourdomain.com` (verify with a DNS TXT record in Cloudflare) → submit `https://yourdomain.com/sitemap.xml`.
- [ ] Social profiles, Discord server, anything else that links the old URL.
- [ ] **Later, Stripe:** webhook endpoint, Checkout success/cancel URLs, customer portal return URL, branding. All go under `https://yourdomain.com` (Phase 15).
- [ ] **Later, affiliate programs:** register `https://yourdomain.com` as your site in each program. Most programs review the live site, so do this after cutover.

---

## Phase 12: Cutover

There are no real users and no data worth keeping, so cutover is just "make the domain live and retire Vercel". There's no file copy, no URL rewrite and no maintenance window.

1. ~~**Disconnect Vercel from Git first.**~~ **Corrected:** not needed. The branch keeps the `blob` driver and sharp, so Vercel still builds `main` after the merge and stays usable as the rollback. Keep Vercel connected until Phase 14. (It also hosts the AniList relay.)
2. **Merge** `cloudflare-migration` into `main`. With Workers Builds connected, this deploys production.
3. **Database migrations:** none needed (same Neon DB). If the branch added any, run `DATABASE_URL='<prod owner DIRECT url>' pnpm db:migrate` now.
4. **Clear out test data that points at Vercel Blob** (optional, recommended). Any covers, avatars, moodboard or forum images uploaded while testing on Vercel still point at `*.public.blob.vercel-storage.com`, and they'll break once the Blob store is deleted in Phase 14. Pick one:
   - **Start clean:** in the Neon console, reset the production branch (or delete it and create a fresh one), then run `DATABASE_URL='<prod owner DIRECT url>' pnpm db:migrate` and re-run the product seed in `drizzle/seeds/products.sql` if you use it. Update the Hyperdrive config if the host or role changed (`pnpm exec wrangler hyperdrive update <id> --connection-string=...`). The first account you then create becomes admin (`lib/auth.ts`).
   - **Keep the test rows:** do nothing. Those images show as broken after Phase 14; re-upload any you care about on the new site.
5. **Make sure the domain is attached** (9D), and that `BETTER_AUTH_URL`, `MEDIA_BASE_URL`, `NEXT_PUBLIC_SITE_URL` and `NEXT_PUBLIC_MEDIA_HOST` hold the real domain values in the deploy from step 2. Check: `curl -sI https://yourdomain.com` → `200`.
6. **GitHub OAuth callback:** switch it to `https://yourdomain.com/api/auth/callback/github` (11.1 step 4). Google and Discord already have both URLs registered.
7. **Smoke test on `https://yourdomain.com`:** sign up/in (each provider), upload an image (URL is on `img.yourdomain.com`), post in the forum, change the theme.
8. **Redirect the old `*.vercel.app` URL** (optional, cheap). Nobody depends on it, but a redirect stops the old, now-stale deployment from being reachable or indexed:

   ```bash
   mkdir -p ~/vercel-redirect && cd ~/vercel-redirect
   cat > vercel.json <<'JSON'
   {
     "redirects": [
       { "source": "/(.*)", "destination": "https://yourdomain.com/$1", "permanent": true }
     ]
   }
   JSON
   mkdir -p public && echo '<!doctype html><title>Moved</title>' > public/index.html
   vercel link          # choose the existing otakuvault project
   vercel deploy --prod
   ```

   Check: `curl -sI https://otakuvault.vercel.app/forum` → `308` (or `301`) to `https://yourdomain.com/forum`. Alternatively, skip this and delete the Vercel project outright in Phase 14.
9. **One week later, if everything is stable:** zone → **SSL/TLS → Edge Certificates → HSTS → Enable**. Start with Max-Age **1 month**, include subdomains **on** (only if `img.`, `staging.` and `mail.` are all HTTPS, which they are on Cloudflare), Preload **off**, No-Sniff **on**. Raise it to 12 months after another month. Only submit to the preload list once you're sure you'll never serve anything over plain HTTP.

**About DNS TTLs:** the domain is new and has never pointed anywhere else, so there's no old TTL to wait out. Proxied Cloudflare records use a 300 s TTL automatically. Lowering TTLs only matters if you later move the domain *off* Cloudflare (see the rollback table).

---

## Phase 13: Rollback plan

| What broke | Fastest fix |
| --- | --- |
| A bad deploy of new code on Cloudflare | Dashboard → **Workers & Pages → otakuvault → Deployments** → pick the previous version → **Rollback** (instant, no rebuild). CLI: `pnpm exec wrangler rollback` (prompts for the version and a message). Then fix forward on `main`. |
| A bad deploy that included a DB migration | Code rollback as above, then a new forward migration that undoes it, or Neon point-in-time restore (Neon → **Backup & Restore**). Drizzle migrations are forward-only, same as before. |
| Cloudflare hosting turns out to be unworkable **before cutover** | Nothing to undo. Vercel is still serving `main` from before the merge. Detach the custom domain and keep going on Vercel. |
| Same, **after cutover** | 1) Re-deploy to Vercel: `git revert` the migration merge on a `vercel-rollback` branch, reconnect Git (Vercel → Settings → Git → Connect) or run `vercel deploy --prod` from that branch. 2) Images uploaded on Cloudflare live in R2 at `img.yourdomain.com`; **keep the bucket and that domain live**, so they keep loading wherever the app runs. 3) To serve `yourdomain.com` from Vercel: Vercel → Settings → Domains → add `yourdomain.com`; Cloudflare → Worker → remove the Custom Domain; DNS → add the records Vercel shows (`A 76.76.21.21` / `CNAME cname.vercel-dns.com`) as **DNS only**, TTL 60 s. 4) Set `BETTER_AUTH_URL` on Vercel to the domain and redeploy. With no real users, simply staying on Vercel's own URL is also fine. |

**Keep until Phase 14:** the Vercel project and the old OAuth callback URLs. They're what make the "after cutover" rollback quick.

---

## Phase 14: Decommission Vercel

When it's safe: about **a week after cutover**, with no rollbacks, **and once nothing on Cloudflare calls AniList through the relay** (`ANILIST_API_URL` removed from `wrangler.jsonc`). Deleting the Vercel project deletes the relay.

0. **Code cleanup (one PR):** `pnpm remove @vercel/blob sharp`; delete the `blob` driver from `lib/storage.ts` (and the Blob host check in `lib/image.ts`), `sharp: false` from `pnpm-workspace.yaml`, `app/api/anilist-relay/`, the relay header in `lib/anilist.ts`, `ANILIST_API_URL` from `wrangler.jsonc`, then `wrangler secret delete ANILIST_RELAY_SECRET`. Remove `ANILIST_RELAY_SECRET` and the Blob vars from Vercel too (or just delete the project).

1. **Delete the Blob store:** Vercel → **Storage** → the Blob store → Settings → **Delete**. Nothing in the app reads from it any more. (Any leftover test rows that pointed at it show broken images; see Phase 12 step 4.)
2. **The Vercel project:**
   - If you set up the redirect (Phase 12 step 8), keep the redirect-only project for a few months, then delete it.
   - If you didn't, delete it now: Vercel → Project → **Settings → Advanced → Delete Project**. Deleting frees the `otakuvault.vercel.app` name; with no users or inbound links, that doesn't matter.
3. **OAuth:** remove the `*.vercel.app` redirect URIs from Google and Discord. GitHub was already switched.
4. **Docs and env:** rewrite `DEPLOYMENT.md` for Cloudflare (or replace it with a pointer to this guide). Delete `BLOB_READ_WRITE_TOKEN` from your local `.env` if it's there.
5. **Optional:** remove the Vercel CLI link (`rm -rf .vercel`) and delete `public/vercel.svg` / `next.svg` if unused.

---

## Phase 15: Preparing for Stripe and affiliate links

This isn't part of the migration. It's what to know so the Stripe work goes smoothly on Workers. The DB already has `orders.stripe_session_id`.

### 15.1 Stripe SDK on Workers

```ts
// lib/stripe.ts (later)
import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
  // Workers have fetch, not Node's http module; be explicit so the SDK never picks the Node client.
  httpClient: Stripe.createFetchHttpClient(),
});
```

- Create the client inside functions (or keep a module-level one like above). The Stripe client holds no sockets between calls (each call is a `fetch`), so the per-request rule that applies to `pg` doesn't apply here.
- Secrets: `wrangler secret put STRIPE_SECRET_KEY` (test-mode key on staging, live key on production), and `STRIPE_WEBHOOK_SECRET` per endpoint.

### 15.2 Webhook route: raw body and async verification

```ts
// app/api/webhooks/stripe/route.ts (later)
import Stripe from "stripe";
import { stripe } from "@/lib/stripe";

const cryptoProvider = Stripe.createSubtleCryptoProvider();

export async function POST(request: Request) {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });

  // The signature covers the exact bytes Stripe sent: read text, never request.json() first.
  const payload = await request.text();

  let event: Stripe.Event;
  try {
    // constructEvent (sync) fails on Workers; the async variant uses Web Crypto.
    event = await stripe.webhooks.constructEventAsync(
      payload, signature, process.env.STRIPE_WEBHOOK_SECRET!, undefined, cryptoProvider,
    );
  } catch {
    return new Response("Bad signature", { status: 400 });
  }

  // Idempotency: Stripe retries. Record event.id (unique column) and skip if already handled.
  // Do the DB work here (db is per-request, so it works in this handler) and return quickly.
  switch (event.type) {
    case "checkout.session.completed":
      // mark order paid using event.data.object.id → orders.stripe_session_id
      break;
  }
  return new Response("ok");
}
```

Workers-specific notes:
- `/api/webhooks/*` isn't in `proxy.ts`'s matcher, so the auth redirect won't intercept it. Keep it that way.
- **Bot Fight Mode / Super Bot Fight Mode must stay off**, or add a WAF **skip** rule for `URI Path starts with /api/webhooks/stripe`. Otherwise Cloudflare may challenge Stripe's servers and webhooks fail with 403.
- Don't put a Cache Rule over `/api/*`.
- Return 2xx within a few seconds. For slow work (emails, fulfilment), use Next's `after()` (supported by OpenNext) or a Cloudflare Queue.
- **Webhook endpoints:** Stripe Dashboard → **Developers → Webhooks → Add endpoint** → `https://yourdomain.com/api/webhooks/stripe` (live mode). Make a separate test-mode endpoint pointing at `https://staging.yourdomain.com/api/webhooks/stripe` (or the staging workers.dev URL). If staging sits behind Cloudflare Access, add an Access **Bypass** policy for that one path.
- Local testing: `stripe listen --forward-to localhost:3000/api/webhooks/stripe` with `pnpm dev`. Use `stripe trigger checkout.session.completed` to send a test event.
- Checkout `success_url` / `cancel_url`: build them from `process.env.NEXT_PUBLIC_SITE_URL` so they're correct per environment.
- Stripe Tax / the address form: no Workers implications.

### 15.3 Affiliate links

- Add an outbound redirect route, e.g. `app/go/[slug]/route.ts`. It looks up the slug in a table, logs the click, and returns a `302` to the affiliate URL. This lets you change links without editing content, and gives you click counts. It's per-request and uncached by default, which is what you want.
- Mark links `rel="sponsored noopener noreferrer"`, and add a disclosure near them and in `/terms` (FTC rules, and most programs' terms, require it).
- Add `/go/` to `robots.ts` `disallow`.
- Some programs (Amazon Associates especially) need a live site with real content, a privacy policy and a contact address before they approve you. The domain, Email Routing (`support@`) and the existing `/privacy` page cover that.

### 15.4 Background jobs you'll likely need

Abandoned-cart cleanup, order reconciliation and sitemap refreshes would have been Vercel Cron. On Cloudflare:
- Add `"triggers": { "crons": ["0 3 * * *"] }` to `wrangler.jsonc`. OpenNext's generated worker only handles `fetch`, so the simplest pattern is a tiny separate Worker with a `scheduled()` handler that calls an authenticated route on your app (via a service binding or `fetch` with a shared secret header).

---

## Final checklist

**Accounts and resources**
- [ ] Cloudflare account with 2FA, Workers Paid, R2 enabled
- [ ] Neon `hyperdrive_user` role (main + staging branch), staging branch created
- [ ] Hyperdrive `otakuvault-db` and `otakuvault-db-staging`, caching disabled
- [ ] R2: `otakuvault-cache`, `otakuvault-cache-staging`, `otakuvault-media`, `otakuvault-media-staging`
- [ ] D1: `otakuvault-tag-cache` (+ staging), `revalidations` table created

**Code (branch `cloudflare-migration`)**
- [ ] `@opennextjs/cloudflare`, `wrangler` installed; `workerd: true` in `allowBuilds`
- [ ] `wrangler.jsonc`, `open-next.config.ts`, `public/_headers`, `cloudflare-env.d.ts`
- [ ] `next.config.ts` calls `initOpenNextCloudflareForDev()`
- [ ] Scripts: `preview`, `deploy`, `deploy:staging`, `upload`, `cf-typegen`
- [ ] `.gitignore`: `.open-next`, `.wrangler`, `.dev.vars*`
- [ ] `lib/db/index.ts`: per-request client
- [ ] `lib/storage.ts`: R2 + Images; `app/actions/uploads.ts` and `lib/image.ts` updated
- [ ] `.env.example`, `.dev.vars.example` updated
- [ ] `metadataBase`, `app/robots.ts`, `app/sitemap.ts`
- [ ] `pnpm preview` works locally; Worker gzip size < 10 MiB

**Config and secrets**
- [ ] Secrets set for prod and staging (`wrangler secret list`)
- [ ] Build vars: `NODE_VERSION`, `NEXT_PUBLIC_SITE_URL`, `NEXT_PUBLIC_MEDIA_HOST`
- [ ] Workers Builds connected (prod + staging) **or** GitHub Actions deploy, not both

**Testing**
- [ ] Every item in Phase 8 passes on staging
- [ ] Image orientation / EXIF / matte checked

**Domain and email**
- [ ] Domain registered, zone active, DNSSEC on, auto-renew on
- [ ] SSL Full (strict), Always HTTPS, TLS ≥ 1.2, Bot Fight Mode off
- [ ] Custom domain on Worker; `www` → apex 301; `img.` on R2 with cache rule
- [ ] Email Routing (support@, dmarc@); DMARC `p=none`; sending provider verified on `mail.`
- [ ] Google/Discord/GitHub callbacks for the new domain

**Cutover**
- [ ] Vercel Git disconnected, `main` merged and deployed to Cloudflare
- [ ] Test data pointing at Blob wiped (or knowingly left)
- [ ] `*.vercel.app` redirects to the new domain (optional)
- [ ] Smoke test passed on the real domain
- [ ] HSTS enabled after a stable week

**Decommission (about a week later)**
- [ ] Blob store deleted; Vercel project deleted or left as redirect-only
- [ ] Old OAuth callbacks removed
- [ ] `DEPLOYMENT.md` rewritten for Cloudflare

---

## Troubleshooting

| Symptom | Likely cause | Fix |
| --- | --- | --- |
| `Error: Cannot perform I/O on behalf of a different request` | A DB client (or other socket/stream) created in one request is used in another. | Make sure nothing creates a `Pool`/`drizzle` at module scope besides the Node-only branch of `lib/db/index.ts`. Check `lib/db/*.ts` scripts aren't imported by app code. If it still happens, the `ctx` key isn't per-request in your OpenNext version: key the `WeakMap` on `getCloudflareContext().cf` or fall back to React `cache()` as in the [OpenNext DB guide](https://opennext.js.org/cloudflare/howtos/db). |
| `getCloudflareContext has been called without having called initOpenNextCloudflareForDev` | Missing call in `next.config.ts`, or code running at module top level. | Add the call (3.4). Only call `getCloudflareContext()` inside functions, never at import time. In ISR/static contexts use `await getCloudflareContext({ async: true })`. |
| Build error mentioning `sharp`, `.node` files, or `Could not resolve "fs"` from sharp | Something still imports `sharp`. | `grep -rn "sharp" app lib`. Only the comment in uploads should remain. |
| `Your Worker exceeded the size limit of 10 MiB` | Big server bundle. | Check that you're on Workers Paid (Free is 3 MiB). Look at `.open-next/server-functions/default/handler.mjs.meta.json` with esbuild's analyzer to find large deps. Make sure `drizzle-kit`, `tsx` and `dotenv` are only devDependencies (they are). |
| `Worker exceeded CPU time limit` on sign-up/sign-in | Password hashing (scrypt in JS) is CPU-heavy. | Paid plan's default CPU limit is 30 s, which should be plenty. If you set a lower `limits.cpu_ms`, raise it. |
| `/collection` doesn't redirect to `/login` when logged out, or the proxy throws | OpenNext's Node `proxy.ts` support is experimental. | Upgrade `@opennextjs/cloudflare`. If that doesn't help, delete `proxy.ts` and add `if (!session) redirect(\`/login?redirect=…\`)` at the top of the five protected pages (they already call `auth.api.getSession`). |
| OAuth `redirect_uri_mismatch` (Google) / "Invalid OAuth2 redirect_uri" (Discord) / "redirect_uri is not associated" (GitHub) | Callback URL not registered exactly, or `BETTER_AUTH_URL` wrong. | `BETTER_AUTH_URL` must be the exact origin, no trailing slash, `https`. Register `<origin>/api/auth/callback/<provider>`. |
| Email sign-in returns 403 "Invalid origin" | Better Auth's origin check: the page origin differs from `BETTER_AUTH_URL`. | Use the canonical host (www → apex redirect), or add the other origin to `trustedOrigins`. |
| Uploads: `9422` error from Images | Free monthly transformation quota (5,000) used up. | Turn on paid Images ($0.50 per 1,000), or switch to the client-side path (D4). |
| Uploaded images 404 on `img.yourdomain.com` | R2 custom domain not Active, or a key mismatch. | R2 → bucket → Settings → Custom Domains → status. Compare the DB URL path with the object key in the bucket (`uploads/<userId>/<file>.jpg`). |
| Images from before the migration show as broken | Test rows still point at the deleted Vercel Blob store. | Expected if you kept the test data (Phase 12 step 4). Re-upload, or wipe the test data. |
| Stale data after saving | Hyperdrive caching enabled. | `pnpm exec wrangler hyperdrive update <id> --caching-disabled`. |
| Pages show old content after a deploy | The regional cache in front of R2 is serving older prerendered output. | Re-deploy (deploy repopulates the cache). If it persists, switch `withRegionalCache` mode to `"short-lived"`, or remove it. |
| Warning about `DOQueueHandler` not exported during local dev | Known OpenNext issue. | Safe to ignore. The class is only used in production. |
| `wrangler login` hangs in WSL | Browser callback can't reach WSL. | Copy the printed URL into a Windows browser. Or create an API token and `export CLOUDFLARE_API_TOKEN=…`. |
| Workers Builds: wrong pnpm / `ERR_PNPM_BAD_PM_VERSION` | Build image's pnpm differs from `packageManager`. | Set `PNPM_VERSION=12.10.1`, or put corepack activation in front of the deploy command, or switch to GitHub Actions (7B). |
| Workers Builds fails: "name in wrangler config doesn't match" | Dashboard Worker name ≠ `name` in `wrangler.jsonc`. | Production Worker must be `otakuvault`, staging `otakuvault-staging`. |
| Fonts missing in some themes | Build had no network for `next/font/google`. | Re-run the build. Workers Builds and GitHub Actions have network, so this is a flaky download. |
| Stripe webhook 400 "No signatures found" | Body parsed or altered before verification. | Use `await request.text()` and `constructEventAsync` (15.2). |
| Stripe webhook 403 | Cloudflare bot protection challenging Stripe. | WAF skip rule for the webhook path; keep Bot Fight Mode off. |
| SPF "permerror" in DMARC reports | Two `v=spf1` TXT records on the same name. | Merge them into one record. |
| AniList data missing on Cloudflare; logs or job report show `You have been manually blocked` | AniList blocks Cloudflare Workers egress (any User-Agent). | Keep `ANILIST_API_URL` pointed at the relay and `ANILIST_RELAY_SECRET` set on both the Worker and Vercel. Check the relay: `curl -X POST -H 'x-relay-secret: …' -d '{"query":"{ Media(id:1){id} }"}' https://otaku-vault-gold.vercel.app/api/anilist-relay`. |
| `opennextjs-cloudflare deploy` fails: "you should use a local Postgres connection string to emulate Hyperdrive" | The deploy command starts a local platform proxy. | Set `CLOUDFLARE_HYPERDRIVE_LOCAL_CONNECTION_STRING_HYPERDRIVE` to any Postgres URL (it isn't used). |
| `unhandledRejection: TypeError: This socket has been closed.` in Worker logs | `pg-cloudflare` socket teardown after each query (`maxUses: 1`). | Harmless log noise; responses are correct. Recheck after `pg` upgrades. |
| `tsc`: `HTMLCanvasElement` not assignable to `string \| Response \| ReadableStream` on `.prepend()` | `cloudflare-env.d.ts` runtime types merge HTMLRewriter's `Element.prepend` into the DOM. | Use `insertBefore` (or `append`) for DOM nodes. |
| `next build` (Vercel/CI) starts miniflare or wants a Hyperdrive connection string | `initOpenNextCloudflareForDev()` called unconditionally. | Keep the call behind the `PHASE_DEVELOPMENT_SERVER` + `CF_DEV_BINDINGS=1` check in `next.config.ts`. |

---

## Reference links

**Next.js (installed docs, version-matched)**
- `node_modules/next/dist/docs/01-app/01-getting-started/17-deploying.md`: deployment options and adapters (Cloudflare listed as "working on a verified adapter").
- `node_modules/next/dist/docs/01-app/02-guides/deploying-to-platforms.md`: feature/infra matrix.
- `node_modules/next/dist/docs/01-app/03-api-reference/05-config/01-next-config-js/adapterPath.md`

**OpenNext for Cloudflare**
- Overview and supported versions: <https://opennext.js.org/cloudflare>
- Get started (existing app): <https://opennext.js.org/cloudflare/get-started>
- Caching (R2 / D1 / DO queue): <https://opennext.js.org/cloudflare/caching>
- Database & ORM: <https://opennext.js.org/cloudflare/howtos/db>
- Environment variables: <https://opennext.js.org/cloudflare/howtos/env-vars>
- Known issues: <https://opennext.js.org/cloudflare/known-issues>

**Cloudflare**
- Next.js on Workers (incl. vinext): <https://developers.cloudflare.com/workers/frameworks/framework-guides/nextjs/>
- Wrangler configuration: <https://developers.cloudflare.com/workers/wrangler/configuration/>
- Node.js compatibility: <https://developers.cloudflare.com/workers/runtime-apis/nodejs/>
- Workers limits & pricing: <https://developers.cloudflare.com/workers/platform/limits/>
- Secrets: <https://developers.cloudflare.com/workers/configuration/secrets/>
- Workers Builds: <https://developers.cloudflare.com/workers/ci-cd/builds/> and configuration: <https://developers.cloudflare.com/workers/ci-cd/builds/configuration/>
- Preview URLs / versions: <https://developers.cloudflare.com/workers/configuration/previews/>
- Rollbacks: <https://developers.cloudflare.com/workers/configuration/versions-and-deployments/rollbacks/>
- Custom Domains: <https://developers.cloudflare.com/workers/configuration/routing/custom-domains/>
- Hyperdrive + Neon: <https://developers.cloudflare.com/hyperdrive/examples/connect-to-postgres/postgres-database-providers/neon/>
- Hyperdrive local dev: <https://developers.cloudflare.com/hyperdrive/configuration/local-development/>
- Images binding: <https://developers.cloudflare.com/images/transform-images/bindings/> and pricing: <https://developers.cloudflare.com/images/pricing/>
- R2 public buckets / custom domains: <https://developers.cloudflare.com/r2/buckets/public-buckets/>
- Registrar TLD list: <https://www.cloudflare.com/tld-policies/>
- Redirect from www to root: <https://developers.cloudflare.com/rules/url-forwarding/examples/redirect-www-to-root/>
- Email Routing: <https://developers.cloudflare.com/email-routing/>
- Email Service (sending, beta): <https://developers.cloudflare.com/email-service/>
- DMARC Management: <https://developers.cloudflare.com/dmarc-management/>
- HSTS: <https://developers.cloudflare.com/ssl/edge-certificates/additional-options/http-strict-transport-security/>

**Stripe**
- Webhook signature verification: <https://docs.stripe.com/webhooks#verify-official-libraries>
- Stripe on Workers (Cloudflare blog): <https://blog.cloudflare.com/announcing-stripe-support-in-workers>
- Custom email domain: <https://docs.stripe.com/get-started/account/email-domain>
