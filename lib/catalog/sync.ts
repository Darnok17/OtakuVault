import { and, asc, eq, isNotNull, isNull, lt, or, sql } from "drizzle-orm";
import { catalogSyncState, db, entries, titles } from "@/lib/db";
import { DETAILS_VERSION, ENTRY_TYPES, type MediaKind, type Season } from "@/lib/anilist-shared";
import { MAX_PAGE_DEPTH, type CatalogSource, type SourceTitle } from "./source";
import { saveAiring, saveDetails, saveTrending, upsertTitles } from "./store";
import { copyImages, type ImageReport, type ImageStore } from "./images";

// The catalog sync job (scripts/catalog-sync.ts runs it; GitHub Actions runs that hourly).
//
//   backfill     one-off, resumable: every title above a popularity threshold.
//   incremental  hourly: titles edited at the provider since the last run, the airing schedule,
//                trending scores, the current and next season, titles people have in their
//                collections, a slice of the oldest rows, missing/stale extras, and images.
//
// Every step stores its cursor in catalog_sync_state and catches its own errors, so one failing
// step (provider hiccup) doesn't stop the others; the report lists what failed.

export const DEFAULT_MIN_POPULARITY = 1000;

export type SyncContext = {
  source: CatalogSource;
  images?: ImageStore | null;
  now?: () => Date;
  log?: (msg: string) => void;
};

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

async function getState<T extends Record<string, unknown>>(key: string): Promise<T | null> {
  const [row] = await db.select().from(catalogSyncState).where(eq(catalogSyncState.key, key));
  return (row?.value as T | undefined) ?? null;
}

async function setState(key: string, value: Record<string, unknown>) {
  await db.insert(catalogSyncState).values({ key, value }).onConflictDoUpdate({ target: catalogSyncState.key, set: { value, updatedAt: new Date() } });
}

const keepable = (t: SourceTitle) => !t.isAdult;

/* ---------- Backfill ---------- */

type BackfillState = { maxPopularity: number | null; page: number; done: boolean; count: number };

export type BackfillReport = Record<string, { pages: number; titles: number; done: boolean }>;

// Walks the provider most-popular-first in windows of MAX_PAGE_DEPTH pages, saving its place
// after every page, so an interrupted run picks up where it stopped. maxPages bounds one run.
export async function runBackfill(ctx: SyncContext, opts: { kinds?: MediaKind[]; minPopularity?: number; maxPages?: number; restart?: boolean; pageDepth?: number } = {}): Promise<BackfillReport> {
  const log = ctx.log ?? (() => {});
  const minPopularity = opts.minPopularity ?? DEFAULT_MIN_POPULARITY;
  const report: BackfillReport = {};
  let budget = opts.maxPages ?? Infinity;
  for (const kind of opts.kinds ?? (["ANIME", "MANGA"] as MediaKind[])) {
    const key = `backfill:${kind}:${minPopularity}`;
    let state = (!opts.restart && (await getState<BackfillState>(key))) || { maxPopularity: null, page: 1, done: false, count: 0 };
    const r = (report[kind] = { pages: 0, titles: 0, done: state.done });
    let lowest: number | null = null;
    while (!state.done && budget > 0) {
      const { items, hasNext } = await ctx.source.fetchPage({ kind, minPopularity, maxPopularity: state.maxPopularity, page: state.page });
      budget--;
      await upsertTitles(items.filter(keepable), { now: ctx.now?.() });
      r.pages++;
      r.titles += items.length;
      for (const t of items) if (t.popularity !== null) lowest = lowest === null ? t.popularity : Math.min(lowest, t.popularity);
      if (!hasNext || !items.length) {
        state = { ...state, done: true, count: state.count + items.length };
      } else if (state.page >= (opts.pageDepth ?? MAX_PAGE_DEPTH)) {
        // Next window: everything at or below the last popularity seen. Titles exactly at the
        // boundary come round again, which is just a repeat upsert.
        state = { maxPopularity: lowest, page: 1, done: false, count: state.count + items.length };
        lowest = null;
      } else {
        state = { ...state, page: state.page + 1, count: state.count + items.length };
      }
      await setState(key, state);
      if (r.pages % 20 === 0) log(`backfill ${kind}: ${state.count} titles, window ≤ ${state.maxPopularity ?? "∞"}, page ${state.page}`);
    }
    r.done = state.done;
    log(`backfill ${kind}: ${r.done ? "complete" : "paused"} (${state.count} titles so far)`);
  }
  return report;
}

/* ---------- Incremental ---------- */

export type IncrementalOptions = {
  minPopularity?: number;
  updatedPages?: number; // pages of recently edited titles per run
  trendingPages?: number; // per entry type
  refreshBatches?: number; // 50 oldest rows per batch
  extrasLimit?: number; // titles whose extras are filled or refreshed per run
  extrasMaxAge?: number; // ms
  imageLimit?: number; // titles whose images are copied per run
  seasonEvery?: number; // ms between season refreshes
};

export type StepResult = { ok: boolean; detail: string };
export type IncrementalReport = Record<string, StepResult>;

const seasonOf = (d: Date): { year: number; season: Season } => {
  const m = d.getUTCMonth();
  const season: Season = m < 3 ? "WINTER" : m < 6 ? "SPRING" : m < 9 ? "SUMMER" : "FALL";
  return { year: d.getUTCFullYear(), season };
};
const nextSeason = ({ year, season }: { year: number; season: Season }) => {
  const order: Season[] = ["WINTER", "SPRING", "SUMMER", "FALL"];
  const i = order.indexOf(season);
  return i === 3 ? { year: year + 1, season: order[0] } : { year, season: order[i + 1] };
};

export async function runIncremental(ctx: SyncContext, opts: IncrementalOptions = {}): Promise<IncrementalReport> {
  const now = () => ctx.now?.() ?? new Date();
  const log = ctx.log ?? (() => {});
  const o = {
    minPopularity: DEFAULT_MIN_POPULARITY, updatedPages: 40, trendingPages: 4, refreshBatches: 20,
    extrasLimit: 30, extrasMaxAge: 7 * DAY, imageLimit: 2000, seasonEvery: 6 * HOUR, ...opts,
  };
  const report: IncrementalReport = {};
  const step = async (name: string, run: () => Promise<string>) => {
    try {
      report[name] = { ok: true, detail: await run() };
    } catch (err) {
      report[name] = { ok: false, detail: (err as Error).message };
    }
    log(`${name}: ${report[name].ok ? "" : "FAILED "}${report[name].detail}`);
  };

  // 1. Titles edited at the provider since the last run. New ones join the catalog if they're
  //    popular enough; ones we already have (however obscure) are refreshed.
  await step("updated", async () => {
    const state = await getState<{ since: string }>("updated");
    const since = state ? new Date(state.since) : new Date(now().getTime() - HOUR);
    let newest = since;
    let seen = 0;
    let saved = 0;
    let pages = 0;
    for await (const pageItems of ctx.source.fetchUpdatedSince(since, o.updatedPages)) {
      seen += pageItems.length;
      pages++;
      const ids = pageItems.map((t) => t.ids.anilist);
      const have = new Set((await db.select({ id: titles.anilistId }).from(titles).where(sql`${titles.anilistId} = any(${sql.param(ids)}::int[])`)).map((r) => r.id));
      const keep = pageItems.filter((t) => keepable(t) && (have.has(t.ids.anilist) || (t.popularity ?? 0) >= o.minPopularity));
      await upsertTitles(keep, { now: now() });
      saved += keep.length;
      for (const t of pageItems) if (t.updatedAt && t.updatedAt > newest) newest = t.updatedAt;
    }
    await setState("updated", { since: newest.toISOString() });
    // At the page cap the oldest edits of the hour are skipped; the refresh step catches them.
    const truncated = pages >= o.updatedPages ? " (page cap reached; older edits left to the refresh step)" : "";
    return `${seen} edited since ${since.toISOString()}, ${saved} saved${truncated}`;
  });

  // 2. Airing schedule: yesterday through next week.
  await step("airing", async () => {
    const from = new Date(now().getTime() - DAY);
    const to = new Date(now().getTime() + 8 * DAY);
    const eps = (await ctx.source.fetchAiring(from, to, 20)).filter((e) => keepable(e.title));
    const n = await saveAiring(eps, from, to, now());
    return `${n} episodes`;
  });

  // 3. Trending scores, per entry type so the webtoon and novel rails have their own.
  await step("trending", async () => {
    const all: SourceTitle[] = [];
    for (const type of ENTRY_TYPES) {
      for (let p = 1; p <= o.trendingPages; p++) {
        const { items, hasNext } = await ctx.source.fetchTrending(type, p);
        all.push(...items.filter(keepable));
        if (!hasNext) break;
      }
    }
    await saveTrending(all, now());
    return `${all.length} trending titles`;
  });

  // 4. The current and next anime season, complete (new shows start below the threshold).
  await step("seasons", async () => {
    const state = await getState<{ at: string }>("seasons");
    if (state && now().getTime() - new Date(state.at).getTime() < o.seasonEvery) return "not due";
    const cur = seasonOf(now());
    let n = 0;
    for (const { year, season } of [cur, nextSeason(cur)]) {
      for (let p = 1; p <= 20; p++) {
        const { items, hasNext } = await ctx.source.fetchSeason(year, season, p);
        await upsertTitles(items.filter(keepable), { now: now() });
        n += items.length;
        if (!hasNext) break;
      }
    }
    await setState("seasons", { at: now().toISOString() });
    return `${n} titles`;
  });

  // 5. Titles someone has in their collection, so the new-episodes job and collection pages
  //    never depend on a request-time fetch.
  await step("referenced", async () => {
    const missing = await db.selectDistinct({ id: entries.anilistId }).from(entries)
      .where(and(isNotNull(entries.anilistId), sql`not exists (select 1 from ${titles} where ${titles.anilistId} = ${entries.anilistId})`))
      .limit(500);
    if (!missing.length) return "none missing";
    const found = await ctx.source.fetchById(missing.map((m) => m.id!));
    await upsertTitles(found.filter(keepable), { now: now() });
    return `${found.length} of ${missing.length} added`;
  });

  // 6. The rows synced longest ago, so scores and popularity don't drift (a full cycle of
  //    ~20k titles takes about half a day at the defaults).
  await step("refresh", async () => {
    const stale = await db.select({ id: titles.anilistId }).from(titles)
      .where(and(isNotNull(titles.anilistId), lt(titles.syncedAt, new Date(now().getTime() - HOUR))))
      .orderBy(asc(titles.syncedAt)).limit(o.refreshBatches * 50);
    if (!stale.length) return "nothing stale";
    const ids = stale.map((s) => s.id!);
    const found = await ctx.source.fetchById(ids);
    await upsertTitles(found, { now: now() });
    // Ids the provider dropped stay as they are, but move to the back of the queue.
    const gone = ids.filter((id) => !found.some((t) => t.ids.anilist === id));
    if (gone.length) await db.update(titles).set({ syncedAt: now() }).where(sql`${titles.anilistId} = any(${sql.param(gone)}::int[])`);
    return `${found.length} refreshed${gone.length ? `, ${gone.length} not at the provider` : ""}`;
  });

  // 7. Extras (characters, staff, relations, …) for the most popular titles that lack them,
  //    then the stalest ones; one provider request each.
  await step("extras", async () => {
    const todo = await db.select({ id: titles.anilistId }).from(titles)
      .where(and(isNotNull(titles.anilistId), eq(titles.isAdult, false), or(
        isNull(titles.extrasFetchedAt),
        lt(titles.extrasFetchedAt, new Date(now().getTime() - o.extrasMaxAge)),
        sql`(${titles.extras} ->> 'v')::int is distinct from ${DETAILS_VERSION}`,
      )))
      .orderBy(sql`${titles.extrasFetchedAt} asc nulls first`, sql`${titles.popularity} desc nulls last`)
      .limit(o.extrasLimit);
    let n = 0;
    for (const { id } of todo) {
      const d = await ctx.source.fetchDetails(id!);
      if (d) { await saveDetails(d, now()); n++; }
      else await db.update(titles).set({ extrasFetchedAt: now() }).where(eq(titles.anilistId, id!));
    }
    return `${n} of ${todo.length}`;
  });

  // 8. Images.
  await step("images", async () => {
    if (!ctx.images) return "skipped (no image store configured)";
    const r: ImageReport = await copyImages(ctx.images, o.imageLimit, { log });
    return `${r.copied} copied, ${r.gone} gone at the provider, ${r.failed} failed`;
  });

  return report;
}
