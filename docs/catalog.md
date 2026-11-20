# Title catalog

OtakuVault keeps its own copy of title metadata in Postgres. Pages (browse, title pages, search,
home rails, collection lookups, the new-episodes job) read **only** from it. AniList is called
by the sync job, and at request time only for a title or search the catalog can't answer yet.

```
           GitHub Actions (hourly)                       Cloudflare Worker (otakuvault.app)
  AniList ──► scripts/catalog-sync.ts ──► Postgres ◄──── lib/catalog (reads)
     ▲              │                     (titles, …)        │ miss: fetch once, save, serve
     │              └──► R2 (img.otakuvault.app/catalog/…)   ▼
     └──────────── relay on Vercel (app/api/anilist-relay) ◄─┘
```

## Code

| Path | What |
| --- | --- |
| `lib/catalog/source.ts` | `CatalogSource`: the provider interface (`fetchById`, `fetchDetails`, `fetchUpdatedSince`, `fetchAiring`, `search`, plus `fetchPage`/`fetchTrending`/`fetchSeason` for the sync). A second provider implements it and fills its own `*_id` column; pages don't change. |
| `lib/catalog/sources/anilist.ts` | AniList implementation: GraphQL, normalizing, rate limiting (waits and backs off in the sync; fails fast at request time). |
| `lib/catalog/store.ts` | Upserts into the catalog tables; row → `Title` mapping. |
| `lib/catalog/index.ts` | What pages call (`searchTitles`, `browseTitles`, `getTitleDetails`, `getTrendingNow`, …, `getAiringStatus`). Same names and shapes the old `lib/anilist.ts` had. |
| `lib/catalog/sync.ts` | Backfill and the hourly incremental steps. |
| `lib/catalog/images.ts` | Copies cover/banner images to R2 (sharp → WebP). |
| `scripts/catalog-sync.ts` | CLI: `pnpm catalog:sync incremental \| backfill \| images \| probe`. |
| `.github/workflows/catalog-sync.yml` | Hourly at :17; manual backfill/images runs; AniList probe on PRs. |

## Tables (migration `0006_title_catalog`)

- **`titles`**: our id (uuid text), `anilist_id` (unique), nullable `mal_id` / `kitsu_id` / `tmdb_id`, every list/detail field, `cover_source`/`banner_source` (provider URLs) and `cover`/`banner` (our R2 copies), `extras` jsonb (characters, staff, relations, recommendations, streaming, links, trailer), `search_text` + generated `search` tsvector.
- **`genres` / `title_genres`**, **`tags` / `title_tags`**, **`studios` / `title_studios`**.
- **`airing_schedule`**: `(title_id, episode) → airing_at`, from a day ago through next week, plus a month of history.
- **`catalog_sync_state`**: the sync's cursors. **`catalog_lookups`**: request-time misses (unknown ids, searches) so the same miss doesn't hit the provider again for a week.

`cached_titles` / `cached_queries` (the old AniList cache) are no longer read. Dropping them is a
separate, destructive migration, deliberately not part of this change.

## What the sync does

**Backfill** (`pnpm catalog:sync backfill --min-popularity 1000`), one-off and resumable: every
anime and manga with AniList popularity ≥ 1000 (about 10k anime + 11k manga, Nov 2026). AniList
can't page deeper than 5000 results and has no id cursor, so it walks most-popular-first in
popularity windows and saves its place after every page. At AniList's degraded 30 req/min it takes
about 20 minutes, then `pnpm catalog:sync images --concurrency 16` copies the images (about 40 minutes).

**Incremental** (hourly, ~120 AniList requests, about 5 minutes):

1. **updated**: titles edited at AniList since the last run (`UPDATED_AT_DESC`). New ones join
   if popularity ≥ 1000; ones already in the catalog are refreshed whatever their popularity.
   AniList records 1000+ edits an hour, so this reads up to 40 pages (2000 titles); past that
   the run says so, and the refresh step picks up what was skipped.
2. **airing**: the airing schedule for yesterday through next week, with the airing titles.
3. **trending**: the top 200 trending per entry type; trending scores are replaced wholesale.
4. **seasons** (every 6 h): the current and next anime season, complete.
5. **referenced**: titles people have in collections but the catalog lacks.
6. **refresh**: the 1000 rows synced longest ago (scores and popularity drift without edits;
   a full cycle takes about a day).
7. **extras**: characters/staff/relations/recommendations for 30 titles per run, missing ones
   (most popular first), then those older than a week.
8. **images**: missing cover/banner copies.

Each step catches its own errors and logs them, and the run only fails (red X) if every step
failed. The **new-episodes job** (Worker Cron Trigger, :00) reads `airing_schedule` and makes no
provider request; the sync at :17 keeps the schedule current.

## Request-time misses

- **Title page / `getTitleById`** for a title the catalog lacks: one `fetchDetails` /
  `fetchById` through the relay, saved, then served. Unknown ids are remembered for a week.
- **Catalog title without extras**: one `fetchDetails`, saved. If AniList is unreachable, the
  page still renders, minus characters and staff.
- **Search** (Postgres: full text over titles and synonyms, plus trigram similarity for typos):
  if nothing in the catalog contains the query, AniList's search is asked once (per query and
  type, per week), the results are saved, and the catalog is searched again.

These go through the request-time limiter: it never waits, and on a rate limit or outage the page
serves what the catalog has.

## Images

Copied by the sync as WebP (cover 460 px wide, banner 1600 px) to
`otakuvault-media/catalog/anilist/<id>/<cover|banner>-<hash of the source URL>.webp`, served from
`https://img.otakuvault.app/...` with a year-long immutable cache. A changed source URL clears
our copy and the next run copies the new one. Until a title's image is copied (titles that arrive
through a request-time miss), its pages show the AniList URL. Expected size: about 2 GB for 21k
titles, inside R2's 10 GB free tier. The app only ever deletes keys under `uploads/`.

Characters', staff and streaming-episode images in `extras` are still AniList-hosted.

## The AniList relay

The Worker still needs the relay (`ANILIST_API_URL` + `ANILIST_RELAY_SECRET`, see the migration
guide) for the request-time misses above, since AniList blocks Cloudflare Workers. The sync job
doesn't use it. Once nothing on Cloudflare calls AniList (for example: drop the request-time
fallbacks once the catalog covers what people look up), remove `ANILIST_API_URL` from
`wrangler.jsonc` and delete the relay, its secrets and then the Vercel project
(migration guide, Phase 14).

## Operating it

- **Secrets** (GitHub repo): `DATABASE_URL` (Neon pooled string), `CLOUDFLARE_API_TOKEN`
  (needs R2 write), `CLOUDFLARE_ACCOUNT_ID`.
- **Run now**: Actions → Catalog sync → Run workflow (mode `incremental`, `backfill` or `images`).
- **Locally**: `DATABASE_URL=… pnpm catalog:sync incremental`. Add `CLOUDFLARE_ACCOUNT_ID`,
  `CLOUDFLARE_API_TOKEN` and `MEDIA_BASE_URL=https://img.otakuvault.app` for image copies.
- **Raise the threshold or scope**: run `backfill --min-popularity 500`; it keeps a separate
  cursor per threshold. Check R2 usage first (each 1000 titles ≈ 100 MB of images).
- **Tests**: `pnpm test` (sync and catalog reads against PGlite with a fake source).
