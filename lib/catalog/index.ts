import { cache } from "react";
import { and, desc, eq, gt, inArray, sql, type SQL } from "drizzle-orm";
import { airingSchedule, catalogLookups, db, studios, titles, titleStudios, titleTags, tags } from "@/lib/db";
import type { EntryType } from "@/lib/types";
import {
  DEFAULT_FILTERS, DETAILS_VERSION, ENTRY_TYPES, TAG_GENRES,
  type BrowseFilters, type DetailsResult, type Season, type Title, type TitleDetails, type TitleExtras, type TitlePage,
} from "@/lib/anilist-shared";
import { SourceError, type CatalogSource } from "./source";
import { createAniListSource } from "./sources/anilist";
import { byPopularity, cardColumns, cardsByAnilistId, fromFuzzyInt, saveDetails, toTitle, upsertTitles, visible, type CardRow } from "./store";
import { escapeLike, normalizeSearch } from "./search";

// The title catalog, as pages see it. Everything here reads our own tables (filled by the sync
// job, lib/catalog/sync.ts); the provider is only asked when the catalog doesn't have a title
// yet, or a search finds nothing, and then once: the result is saved and served from here on.

/* ---------- Provider for catalog misses ---------- */

let source: CatalogSource | null = null;

// On Cloudflare this goes through the temporary AniList relay (AniList blocks Workers), with the
// request-time limiter: never waits, fails fast, and the page shows what the catalog has.
function getSource(): CatalogSource {
  source ??= createAniListSource({
    endpoint: process.env.ANILIST_API_URL,
    relaySecret: process.env.ANILIST_RELAY_SECRET,
    perMinute: 30,
    wait: false,
    timeoutMs: 8000,
  });
  return source;
}

// Tests swap in a fake provider.
export function setCatalogSource(s: CatalogSource | null) {
  source = s;
}

const LOOKUP_TTL = 7 * 86_400_000;

// True if `key` wasn't looked up at the provider within LOOKUP_TTL.
async function lookupDue(key: string): Promise<boolean> {
  const [row] = await db.select({ at: catalogLookups.lookedUpAt }).from(catalogLookups).where(eq(catalogLookups.key, key));
  return !row || Date.now() - row.at.getTime() > LOOKUP_TTL;
}

async function markLookup(key: string) {
  const now = new Date();
  await db.insert(catalogLookups).values({ key, lookedUpAt: now }).onConflictDoUpdate({ target: catalogLookups.key, set: { lookedUpAt: now } });
}

// Concurrent misses for the same key share one provider request.
const inflight = new Map<string, Promise<unknown>>();
function once<T>(key: string, run: () => Promise<T>): Promise<T> {
  let p = inflight.get(key) as Promise<T> | undefined;
  if (!p) {
    p = run().finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  return p;
}

/* ---------- Lists ---------- */

const PAGE = 24;

async function listTitles(where: SQL | undefined, orderBy: SQL[] | readonly unknown[], page = 1, perPage = PAGE): Promise<TitlePage> {
  const rows = await db.select({ ...cardColumns, total: sql<number>`count(*) over ()`.mapWith(Number) })
    .from(titles)
    .where(and(visible, where))
    .orderBy(...(orderBy as SQL[]))
    .limit(perPage)
    .offset((page - 1) * perPage);
  const total = rows[0]?.total ?? 0;
  return { items: rows.map((r) => toTitle(r as CardRow)), total, hasNext: page * perPage < total };
}

function typeWhere(types: EntryType[]): SQL | undefined {
  const set = [...new Set(types)];
  return set.length && set.length < ENTRY_TYPES.length ? inArray(titles.entryType, set) : undefined;
}

export function getSeasonalLineup(year: number, season: Season): Promise<TitlePage> {
  return getSeasonalPage(year, season, 1);
}

export function getSeasonalPage(year: number, season: Season, page: number): Promise<TitlePage> {
  return listTitles(and(eq(titles.kind, "ANIME"), eq(titles.seasonYear, year), eq(titles.season, season)), byPopularity, page);
}

export function getTrendingNow(type?: EntryType): Promise<TitlePage> {
  return listTitles(and(gt(titles.trending, 0), typeWhere(type ? [type] : [])), [desc(titles.trending), ...byPopularity], 1, 20);
}

export function getTrendingPage(type: EntryType | undefined, page: number): Promise<TitlePage> {
  return listTitles(and(gt(titles.trending, 0), typeWhere(type ? [type] : [])), [desc(titles.trending), ...byPopularity], page);
}

const hasGenre = (genre: string) =>
  sql`exists (select 1 from title_genres g where g.title_id = ${titles.id} and g.genre = ${genre})`;
const hasTag = (tag: string) =>
  sql`exists (select 1 from title_tags t where t.title_id = ${titles.id} and t.tag = ${tag})`;

const SORTS: Record<BrowseFilters["sort"], SQL[]> = {
  popularity: [...byPopularity] as SQL[],
  "rating-desc": [sql`${titles.averageScore} desc nulls last`, ...(byPopularity as unknown as SQL[])],
  "rating-asc": [sql`${titles.averageScore} asc nulls last`, ...(byPopularity as unknown as SQL[])],
  newest: [sql`${titles.startDate} desc nulls last`, titles.anilistId as unknown as SQL],
  oldest: [sql`${titles.startDate} asc nulls last`, titles.anilistId as unknown as SQL],
};

// Every filter must match; several genres mean a title has all of them (as AniList's genre_in).
export function browseTitles(filters: BrowseFilters = DEFAULT_FILTERS, page = 1): Promise<TitlePage> {
  const conds: (SQL | undefined)[] = [typeWhere(filters.types)];
  if (filters.statuses.length) conds.push(inArray(titles.status, filters.statuses));
  for (const g of filters.genres) {
    // AniList keeps some of the site's genres as tags.
    conds.push(TAG_GENRES.has(g) ? hasTag(g === "Shonen" ? "Shounen" : g) : hasGenre(g));
  }
  if (filters.yearFrom) conds.push(sql`${titles.startDate} >= ${filters.yearFrom * 10_000}`);
  if (filters.yearTo) conds.push(sql`${titles.startDate} < ${(filters.yearTo + 1) * 10_000}`);
  // Unscored titles would otherwise flood "Rating ↑".
  if (filters.minStars || filters.sort === "rating-asc") conds.push(sql`${titles.averageScore} >= ${Math.max(filters.minStars * 20, 1)}`);
  return listTitles(and(...conds), SORTS[filters.sort], page);
}

// Catalog size per entry type, for the Type filter's counts: [anime, manga, webtoon, novel].
export async function getTypeCounts(): Promise<number[] | null> {
  const rows = await db.select({ type: titles.entryType, n: sql<number>`count(*)`.mapWith(Number) })
    .from(titles).where(visible).groupBy(titles.entryType);
  const by = new Map(rows.map((r) => [r.type, r.n]));
  return ENTRY_TYPES.map((t) => by.get(t) ?? 0);
}

/* ---------- Search ---------- */

const SEARCH_LIMIT = 20;

async function searchCatalog(q: string, type?: EntryType): Promise<{ page: TitlePage; strong: number }> {
  const like = `%${escapeLike(q)}%`;
  // "Strong" hits contain the query (or all its words); trigram similarity adds near misses
  // ("frieran") below them.
  const strong = sql<boolean>`(${titles.searchText} like ${like} or ${titles.search} @@ plainto_tsquery('simple', ${q}))`;
  const rows = await db.select({ ...cardColumns, strong })
    .from(titles)
    .where(and(visible, typeWhere(type ? [type] : []), sql`(${strong} or ${q} <% ${titles.searchText})`))
    .orderBy(desc(strong), desc(sql`word_similarity(${q}, ${titles.searchText})`), ...(byPopularity as unknown as SQL[]))
    .limit(SEARCH_LIMIT);
  const items = rows.map((r) => toTitle(r as CardRow));
  return { page: { items, total: items.length, hasNext: false }, strong: rows.filter((r) => r.strong).length };
}

// Postgres search over titles and synonyms (full text plus trigram). A query nothing in the
// catalog contains asks the provider once a week, saves what it finds, and searches again.
export async function searchTitles(query: string, type?: EntryType): Promise<TitlePage> {
  const q = normalizeSearch(query);
  if (q.length < 2) return { items: [], total: 0, hasNext: false };
  const first = await searchCatalog(q, type);
  if (first.strong > 0) return first.page;

  const key = `search:${type ?? "all"}:${q}`;
  if (!(await lookupDue(key))) return first.page;
  try {
    await once(key, async () => {
      const found = await getSource().search(query, type);
      await upsertTitles(found);
      await markLookup(key);
    });
  } catch (err) {
    if (!(err instanceof SourceError)) throw err;
    return first.page; // provider down or rate limited: what we have
  }
  return (await searchCatalog(q, type)).page;
}

/* ---------- Single titles ---------- */

// The title as stored, without asking the provider. Null if the catalog doesn't have it.
export async function getCachedTitle(anilistId: number): Promise<Title | null> {
  return (await cardsByAnilistId([anilistId])).get(anilistId) ?? null;
}

// Fetches titles the catalog doesn't have yet from the provider and stores them. Ids the
// provider doesn't know are remembered for a week so they aren't asked for again.
async function fillMissing(anilistIds: number[]) {
  const have = new Set((await db.select({ id: titles.anilistId }).from(titles).where(inArray(titles.anilistId, anilistIds))).map((r) => r.id));
  const due: number[] = [];
  for (const id of anilistIds) if (!have.has(id) && (await lookupDue(`id:${id}`))) due.push(id);
  if (!due.length) return;
  await once(`ids:${due.join(",")}`, async () => {
    const found = await getSource().fetchById(due);
    await upsertTitles(found);
    const got = new Set(found.map((t) => t.ids.anilist));
    for (const id of due) if (!got.has(id)) await markLookup(`id:${id}`);
  });
}

export async function getTitleById(anilistId: number): Promise<Title> {
  await fillMissing([anilistId]);
  const [row] = await db.select({ ...cardColumns, description: titles.description }).from(titles)
    .where(and(eq(titles.anilistId, anilistId), eq(titles.isAdult, false)));
  if (!row) throw new Error("Title not found");
  const main = await db.select({ name: studios.name }).from(titleStudios)
    .innerJoin(studios, eq(studios.id, titleStudios.studioId))
    .where(and(eq(titleStudios.titleId, row.id), eq(titleStudios.isMain, true)))
    .orderBy(titleStudios.position);
  return { ...toTitle(row as CardRow), description: row.description, studios: main.map((s) => s.name) };
}

const extrasOk = (e: TitleExtras | null | undefined): e is TitleExtras => !!e && e.v === DETAILS_VERSION;

// Fetches and stores a title's extras (or the whole title when the catalog lacks it). Returns
// false if the provider doesn't know the id.
async function fillExtras(anilistId: number): Promise<boolean> {
  return once(`details:${anilistId}`, async () => {
    const d = await getSource().fetchDetails(anilistId);
    if (!d) {
      await markLookup(`id:${anilistId}`);
      return false;
    }
    await saveDetails(d);
    return true;
  });
}

async function loadDetails(anilistId: number): Promise<TitleDetails | null> {
  const [row] = await db.select().from(titles).where(and(eq(titles.anilistId, anilistId), eq(titles.isAdult, false)));
  if (!row) return null;
  const [tagRows, studioRows, genreRows] = await Promise.all([
    db.select({ name: titleTags.tag, rank: titleTags.rank }).from(titleTags)
      .innerJoin(tags, eq(tags.name, titleTags.tag))
      .where(and(eq(titleTags.titleId, row.id), eq(titleTags.isSpoiler, false), eq(tags.isAdult, false)))
      .orderBy(desc(titleTags.rank), titleTags.tag),
    db.select({ name: studios.name, isMain: titleStudios.isMain }).from(titleStudios)
      .innerJoin(studios, eq(studios.id, titleStudios.studioId))
      .where(eq(titleStudios.titleId, row.id)).orderBy(titleStudios.position),
    db.execute<{ genre: string }>(sql`select genre from title_genres where title_id = ${row.id} order by position`),
  ]);
  const card = toTitle({ ...row, genres: genreRows.rows.map((g) => g.genre) } as CardRow);
  const extras = extrasOk(row.extras) ? await overlayCards(row.extras) : null;
  return {
    v: DETAILS_VERSION,
    fetchedAt: (row.extrasFetchedAt ?? row.syncedAt).getTime(),
    anilistId,
    idMal: row.malId,
    siteUrl: row.siteUrl,
    kind: card.kind,
    entryType: row.entryType,
    title: row.title,
    romaji: row.romaji,
    english: row.english,
    native: row.native,
    synonyms: row.synonyms,
    cover: card.cover,
    color: row.color,
    banner: card.banner,
    description: row.description,
    format: row.format,
    status: row.status,
    episodes: row.episodes,
    chapters: row.chapters,
    volumes: row.volumes,
    duration: row.duration,
    startDate: fromFuzzyInt(row.startDate),
    endDate: fromFuzzyInt(row.endDate),
    season: card.season,
    seasonYear: row.seasonYear,
    averageScore: row.averageScore,
    meanScore: row.meanScore,
    popularity: row.popularity,
    popularityRank: row.popularityRank,
    favourites: row.favourites,
    source: row.sourceMaterial,
    genres: card.genres,
    tags: tagRows,
    studios: studioRows,
    staff: extras?.staff ?? [],
    characters: extras?.characters ?? [],
    relations: extras?.relations ?? [],
    recommendations: extras?.recommendations ?? [],
    streamingEpisodes: extras?.streamingEpisodes ?? [],
    externalLinks: extras?.externalLinks ?? [],
    trailer: extras?.trailer ?? null,
  };
}

// Extras store the provider's covers for related titles; use the catalog's (our copies, current
// data) wherever we have them.
async function overlayCards(extras: TitleExtras): Promise<TitleExtras> {
  const cards = await cardsByAnilistId([...extras.recommendations.map((t) => t.anilistId), ...extras.relations.map((r) => r.id)]);
  return {
    ...extras,
    recommendations: extras.recommendations.map((t) => cards.get(t.anilistId) ?? t),
    relations: extras.relations.map((r) => ({ ...r, cover: cards.get(r.id)?.cover ?? r.cover })),
  };
}

// Wrapped in cache() so metadata and the page share one lookup.
export const getTitleDetails = cache(async (anilistId: number, type: EntryType): Promise<DetailsResult> => {
  const [row] = await db.select({ extras: titles.extras }).from(titles).where(eq(titles.anilistId, anilistId));
  if (!extrasOk(row?.extras) && (row || (await lookupDue(`id:${anilistId}`)))) {
    try {
      await fillExtras(anilistId);
    } catch (err) {
      // Without the provider, a known title still renders (minus characters, staff, …).
      if (!(err instanceof SourceError) || !row) throw err;
    }
  }
  const details = await loadDetails(anilistId);
  if (!details) return { status: "not-found" };
  return details.entryType === type ? { status: "ok", details } : { status: "wrong-type", entryType: details.entryType };
});

// Titles recommended for the given sources (from each source's extras), round-robin across
// sources so one title can't crowd out the others, de-duped and excluding the sources themselves.
export async function getRecommendations(sourceIds: number[]): Promise<Title[]> {
  const ids = [...new Set(sourceIds)].sort((a, b) => a - b);
  if (!ids.length) return [];
  const rows = await db.select({ anilistId: titles.anilistId, extras: titles.extras }).from(titles).where(inArray(titles.anilistId, ids));
  const extrasBy = new Map(rows.map((r) => [r.anilistId!, r.extras]));
  for (const id of ids) {
    if (extrasOk(extrasBy.get(id))) continue;
    try {
      if (await fillExtras(id)) {
        const [r] = await db.select({ extras: titles.extras }).from(titles).where(eq(titles.anilistId, id));
        extrasBy.set(id, r?.extras ?? null);
      }
    } catch (err) {
      if (!(err instanceof SourceError)) throw err;
    }
  }
  const lists = await Promise.all(ids.map(async (id) => {
    const e = extrasBy.get(id);
    return extrasOk(e) ? (await overlayCards(e)).recommendations : [];
  }));
  const seen = new Set(ids);
  const items: Title[] = [];
  for (let i = 0; lists.some((l) => i < l.length); i++) {
    for (const list of lists) {
      const t = list[i];
      if (t && !seen.has(t.anilistId)) { seen.add(t.anilistId); items.push(t); }
    }
  }
  return items;
}

/* ---------- Airing (new-episodes job) ---------- */

export type AiringStatus = {
  anilistId: number;
  title: string;
  status: string | null;
  // The newest episode that has aired, or null when it can't be told (no schedule, on hiatus).
  latestEpisode: number | null;
};

// From the catalog's airing schedule (kept current by the sync job). Ids the catalog doesn't
// have are missing from the map; the sync adds every title someone has in their collection.
export async function getAiringStatus(anilistIds: number[], now = new Date()): Promise<Map<number, AiringStatus>> {
  const ids = [...new Set(anilistIds)];
  if (!ids.length) return new Map();
  const rows = await db.select({
    anilistId: titles.anilistId, title: titles.title, status: titles.status, episodes: titles.episodes, aired: titles.airedEpisodes,
    lastAired: sql<number | null>`(select max(${airingSchedule.episode}) from ${airingSchedule} where ${airingSchedule.titleId} = ${titles.id} and ${airingSchedule.airingAt} <= ${now})`,
  }).from(titles).where(and(inArray(titles.anilistId, ids), eq(titles.kind, "ANIME")));
  return new Map(rows.map((r) => {
    // The schedule knows about episodes that aired since the last sync; aired_episodes (from the
    // next scheduled episode at sync time) covers shows whose history fell out of the schedule.
    const known = [r.lastAired === null ? null : Number(r.lastAired), r.aired].filter((n): n is number => n !== null);
    const latestEpisode =
      r.status === "FINISHED" ? (r.episodes ?? (known.length ? Math.max(...known) : null))
      : known.length ? Math.max(...known)
      : r.status === "NOT_YET_RELEASED" ? 0
      : null;
    return [r.anilistId!, { anilistId: r.anilistId!, title: r.title, status: r.status, latestEpisode }];
  }));
}
