import { inArray, eq, lt, sql } from "drizzle-orm";
import { db, cachedTitles, cachedQueries } from "@/lib/db";
import type { EntryType } from "@/lib/types";
import {
  DEFAULT_FILTERS, ENTRY_TYPES, TAG_GENRES,
  type BrowseFilters, type MediaKind, type Season, type Title, type TitlePage,
} from "@/lib/anilist-shared";

// AniList GraphQL client with a Postgres cache in front of it. Server-only (imports the db).
// Titles live in cached_titles (7-day TTL); each list query's ordered ids live in cached_queries.
// On a miss we fetch, cache and serve; if AniList is down we fall back to stale cache.

const ENDPOINT = process.env.ANILIST_API_URL || "https://graphql.anilist.co";

const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const TITLE_TTL = 7 * DAY;
const TTL = { trending: HOUR, seasonal: 6 * HOUR, search: DAY, browse: DAY, counts: DAY, recs: 7 * DAY };

export class AniListError extends Error {}

/* ---------- Transport ---------- */

// AniList allows 90 req/min per IP (30 while degraded). Stay under the lower figure so a burst
// of searches can't get the server's IP blocked; a 429 pauses us for its Retry-After.
const MAX_PER_MIN = 30;
const recent: number[] = [];
let blockedUntil = 0;

async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const now = Date.now();
  while (recent.length && recent[0] < now - 60_000) recent.shift();
  if (now < blockedUntil || recent.length >= MAX_PER_MIN) throw new AniListError("AniList rate limit reached");
  recent.push(now);

  let res: Response;
  try {
    res = await fetch(ENDPOINT, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(8000),
    });
  } catch (err) {
    throw new AniListError(`AniList unreachable: ${(err as Error).message}`);
  }
  if (res.status === 429) {
    blockedUntil = Date.now() + (Number(res.headers.get("Retry-After")) || 60) * 1000;
    throw new AniListError("AniList rate limit reached");
  }
  const body = await res.json().catch(() => null) as { data?: T; errors?: { message: string }[] } | null;
  if (!res.ok || !body?.data) throw new AniListError(body?.errors?.[0]?.message ?? `AniList HTTP ${res.status}`);
  return body.data;
}

const MEDIA_FIELDS = `
  id type format status episodes chapters volumes averageScore popularity genres countryOfOrigin
  season seasonYear startDate { year }
  title { romaji english native }
  coverImage { extraLarge large color }
  bannerImage`;

type RawMedia = {
  id: number; type: MediaKind; format: string | null; status: string | null;
  episodes: number | null; chapters: number | null; volumes: number | null;
  averageScore: number | null; popularity: number | null; genres: string[] | null; countryOfOrigin: string | null;
  season: Season | null; seasonYear: number | null; startDate: { year: number | null } | null;
  title: { romaji: string | null; english: string | null; native: string | null };
  coverImage: { extraLarge: string | null; large: string | null; color: string | null } | null;
  bannerImage: string | null;
  description?: string | null;
  studios?: { nodes: { name: string }[] } | null;
};
type RawPage = { pageInfo: { total: number; hasNextPage: boolean }; media: RawMedia[] };

function entryTypeOf(m: RawMedia): EntryType {
  if (m.type === "ANIME") return "anime";
  if (m.format === "NOVEL") return "novel";
  return m.countryOfOrigin === "KR" ? "webtoon" : "manga";
}

function normalize(m: RawMedia): Title {
  const romaji = m.title.romaji ?? m.title.english ?? `#${m.id}`;
  const t: Title = {
    anilistId: m.id,
    kind: m.type,
    entryType: entryTypeOf(m),
    title: m.title.english ?? romaji,
    romaji,
    native: m.title.native,
    format: m.format,
    status: m.status,
    episodes: m.episodes,
    chapters: m.chapters,
    volumes: m.volumes,
    score: m.averageScore,
    popularity: m.popularity,
    genres: m.genres ?? [],
    cover: m.coverImage?.extraLarge ?? m.coverImage?.large ?? null,
    banner: m.bannerImage,
    color: m.coverImage?.color ?? null,
    season: m.season,
    seasonYear: m.seasonYear,
    startYear: m.startDate?.year ?? null,
  };
  if (m.description !== undefined) {
    t.description = m.description;
    t.studios = m.studios?.nodes.map((s) => s.name) ?? [];
  }
  return t;
}

const toPage = (p: RawPage): TitlePage => ({
  items: p.media.map(normalize), total: p.pageInfo.total, hasNext: p.pageInfo.hasNextPage,
});

/* ---------- Cache ---------- */

const isFresh = (updatedAt: Date, ttl: number) => Date.now() - updatedAt.getTime() < ttl;

async function upsertTitles(titles: Title[]) {
  const unique = [...new Map(titles.map((t) => [t.anilistId, t])).values()];
  if (!unique.length) return;
  await db.insert(cachedTitles)
    .values(unique.map((t) => ({ anilistId: t.anilistId, type: t.kind, title: t.title, meta: t })))
    .onConflictDoUpdate({
      target: cachedTitles.anilistId,
      // jsonb merge keeps detail-only keys (description, studios) when a list result refreshes a title.
      set: { type: sql`excluded.type`, title: sql`excluded.title`, meta: sql`${cachedTitles.meta} || excluded.meta`, updatedAt: new Date() },
    });
}

async function titlesByIds(ids: number[]): Promise<Map<number, Title>> {
  if (!ids.length) return new Map();
  const rows = await db.select().from(cachedTitles).where(inArray(cachedTitles.anilistId, ids));
  return new Map(rows.map((r) => [r.anilistId, r.meta as Title]));
}

async function readQuery(key: string, ttl: number): Promise<{ page: TitlePage; fresh: boolean } | null> {
  const [row] = await db.select().from(cachedQueries).where(eq(cachedQueries.key, key));
  if (!row) return null;
  const byId = await titlesByIds(row.anilistIds);
  const items = row.anilistIds.map((id) => byId.get(id)).filter((t): t is Title => !!t);
  if (items.length !== row.anilistIds.length) return null; // a title was evicted; refetch
  return { page: { items, total: row.total, hasNext: row.hasNext }, fresh: isFresh(row.updatedAt, ttl) };
}

async function writeQuery(key: string, page: TitlePage) {
  await upsertTitles(page.items);
  const values = { key, anilistIds: page.items.map((t) => t.anilistId), total: page.total, hasNext: page.hasNext, updatedAt: new Date() };
  await db.insert(cachedQueries).values(values).onConflictDoUpdate({ target: cachedQueries.key, set: values });
  // Searches and filter combos pile up; occasionally drop list rows nobody has refreshed in a week.
  if (Math.random() < 0.02) await db.delete(cachedQueries).where(lt(cachedQueries.updatedAt, new Date(Date.now() - 7 * DAY)));
}

// Concurrent misses for the same key share one upstream request.
const inflight = new Map<string, Promise<TitlePage>>();

async function cachedPage(key: string, ttl: number, fetchPage: () => Promise<TitlePage>): Promise<TitlePage> {
  const hit = await readQuery(key, ttl);
  if (hit?.fresh) return hit.page;
  let pending = inflight.get(key);
  if (!pending) {
    pending = fetchPage()
      .then(async (page) => { await writeQuery(key, page); return page; })
      .finally(() => inflight.delete(key));
    inflight.set(key, pending);
  }
  try {
    return await pending;
  } catch (err) {
    if (hit) return hit.page; // stale beats nothing while AniList is down
    throw err;
  }
}

/* ---------- Query variables ---------- */

const ANIME_FORMATS = ["TV", "TV_SHORT", "MOVIE", "SPECIAL", "OVA", "ONA", "MUSIC"];

// AniList has no "webtoon" type: webtoons are Korean MANGA and novels are MANGA with format NOVEL.
function typeVars(types: EntryType[]) {
  const set = new Set(types);
  if (!set.size || set.size === ENTRY_TYPES.length) return {};
  const formats = new Set<string>();
  if (set.has("anime")) ANIME_FORMATS.forEach((f) => formats.add(f));
  if (set.has("manga")) { formats.add("MANGA"); formats.add("ONE_SHOT"); }
  if (set.has("webtoon")) formats.add("MANGA");
  if (set.has("novel")) formats.add("NOVEL");
  const vars: Record<string, unknown> = { format_in: [...formats] };
  if (!set.has("anime")) vars.type = "MANGA";
  else if (set.size === 1) vars.type = "ANIME";
  // Country only separates manga from webtoons when one is picked on its own.
  if (set.size === 1 && set.has("manga")) vars.countryOfOrigin = "JP";
  if (set.size === 1 && set.has("webtoon")) vars.countryOfOrigin = "KR";
  return vars;
}

const PAGE_QUERY = `
  query ($page: Int, $perPage: Int, $search: String, $type: MediaType, $format_in: [MediaFormat],
         $countryOfOrigin: CountryCode, $season: MediaSeason, $seasonYear: Int, $sort: [MediaSort],
         $status_in: [MediaStatus], $genre_in: [String], $tag_in: [String],
         $startDate_greater: FuzzyDateInt, $startDate_lesser: FuzzyDateInt, $averageScore_greater: Int) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { total hasNextPage }
      media(search: $search, type: $type, format_in: $format_in, countryOfOrigin: $countryOfOrigin,
            season: $season, seasonYear: $seasonYear, sort: $sort, status_in: $status_in,
            genre_in: $genre_in, tag_in: $tag_in, startDate_greater: $startDate_greater,
            startDate_lesser: $startDate_lesser, averageScore_greater: $averageScore_greater, isAdult: false) {
        ${MEDIA_FIELDS}
      }
    }
  }`;

const fetchPage = async (vars: Record<string, unknown>) =>
  toPage((await gql<{ Page: RawPage }>(PAGE_QUERY, vars)).Page);

/* ---------- Public API ---------- */

export function searchTitles(query: string, type?: EntryType): Promise<TitlePage> {
  const q = query.trim().replace(/\s+/g, " ");
  return cachedPage(`search:${type ?? "all"}:${q.toLowerCase()}`, TTL.search, () =>
    fetchPage({ search: q, perPage: 20, sort: ["SEARCH_MATCH"], ...typeVars(type ? [type] : []) }));
}

export function getSeasonalLineup(year: number, season: Season): Promise<TitlePage> {
  return cachedPage(`seasonal:${year}:${season}`, TTL.seasonal, () =>
    fetchPage({ season, seasonYear: year, type: "ANIME", sort: ["POPULARITY_DESC"], perPage: 24 }));
}

export function getTrendingNow(): Promise<TitlePage> {
  return cachedPage("trending", TTL.trending, () => fetchPage({ sort: ["TRENDING_DESC"], perPage: 20 }));
}

const SORTS: Record<BrowseFilters["sort"], string[]> = {
  popularity: ["POPULARITY_DESC"],
  "rating-desc": ["SCORE_DESC"],
  "rating-asc": ["SCORE"],
  newest: ["START_DATE_DESC"],
  oldest: ["START_DATE"],
};

export function browseTitles(filters: BrowseFilters = DEFAULT_FILTERS, page = 1): Promise<TitlePage> {
  const genres = filters.genres.filter((g) => !TAG_GENRES.has(g)).sort();
  const tags = filters.genres.filter((g) => TAG_GENRES.has(g)).map((g) => (g === "Shonen" ? "Shounen" : g)).sort();
  const vars: Record<string, unknown> = {
    page, perPage: 24, sort: SORTS[filters.sort],
    ...typeVars(filters.types),
  };
  if (filters.statuses.length) vars.status_in = [...filters.statuses].sort();
  if (genres.length) vars.genre_in = genres;
  if (tags.length) vars.tag_in = tags;
  if (filters.yearFrom) vars.startDate_greater = (filters.yearFrom - 1) * 10000 + 1231;
  if (filters.yearTo) vars.startDate_lesser = (filters.yearTo + 1) * 10000;
  // Unscored titles would otherwise flood "Rating ↑".
  if (filters.minStars || filters.sort === "rating-asc") vars.averageScore_greater = Math.max(filters.minStars * 20 - 1, 0);
  return cachedPage(`browse:${JSON.stringify(vars)}`, TTL.browse, () => fetchPage(vars));
}

// Catalog size per entry type, for the Type filter's counts: [anime, manga, webtoon, novel].
export async function getTypeCounts(): Promise<number[] | null> {
  const key = "counts:types";
  const [row] = await db.select().from(cachedQueries).where(eq(cachedQueries.key, key));
  if (row && isFresh(row.updatedAt, TTL.counts)) return row.anilistIds;
  try {
    const parts = ENTRY_TYPES.map((t, i) => {
      const v = typeVars([t]);
      const args = Object.entries(v).map(([k, val]) => `${k}: ${Array.isArray(val) ? `[${val.join(",")}]` : k === "countryOfOrigin" ? `"${val}"` : val}`).join(", ");
      return `c${i}: Page(perPage: 1) { pageInfo { total } media(${args}, isAdult: false) { id } }`;
    });
    const data = await gql<Record<string, { pageInfo: { total: number } }>>(`{ ${parts.join("\n")} }`);
    const counts = ENTRY_TYPES.map((_, i) => data[`c${i}`].pageInfo.total);
    const values = { key, anilistIds: counts, total: 0, hasNext: false, updatedAt: new Date() };
    await db.insert(cachedQueries).values(values).onConflictDoUpdate({ target: cachedQueries.key, set: values });
    return counts;
  } catch {
    return row?.anilistIds ?? null;
  }
}

export async function getTitleById(anilistId: number): Promise<Title> {
  const [row] = await db.select().from(cachedTitles).where(eq(cachedTitles.anilistId, anilistId));
  const cached = row?.meta as Title | undefined;
  if (row && cached?.description !== undefined && isFresh(row.updatedAt, TITLE_TTL)) return cached!;
  try {
    const data = await gql<{ Media: RawMedia | null }>(`
      query ($id: Int) { Media(id: $id) { ${MEDIA_FIELDS} description(asHtml: false) studios(isMain: true) { nodes { name } } } }`,
      { id: anilistId });
    if (!data.Media) throw new AniListError("Title not found");
    const title = normalize(data.Media);
    await upsertTitles([title]);
    return title;
  } catch (err) {
    if (cached) return cached;
    throw err;
  }
}

// Titles AniList users recommend for the given sources, round-robin across sources so one
// title can't crowd out the others, de-duped and excluding the sources themselves.
export async function getRecommendations(sourceIds: number[]): Promise<Title[]> {
  const ids = [...new Set(sourceIds)].sort((a, b) => a - b);
  if (!ids.length) return [];
  const page = await cachedPage(`recs:${ids.join(",")}`, TTL.recs, async () => {
    const parts = ids.map((id, i) =>
      `r${i}: Media(id: ${id}) { recommendations(sort: RATING_DESC, perPage: 15) { nodes { mediaRecommendation { ${MEDIA_FIELDS} } } } }`);
    const data = await gql<Record<string, { recommendations: { nodes: { mediaRecommendation: RawMedia | null }[] } } | null>>(`{ ${parts.join("\n")} }`);
    const lists = ids.map((_, i) =>
      (data[`r${i}`]?.recommendations.nodes ?? []).flatMap((n) => (n.mediaRecommendation ? [normalize(n.mediaRecommendation)] : [])));
    const seen = new Set(ids);
    const items: Title[] = [];
    for (let i = 0; lists.some((l) => i < l.length); i++) {
      for (const list of lists) {
        const t = list[i];
        if (t && !seen.has(t.anilistId)) { seen.add(t.anilistId); items.push(t); }
      }
    }
    return { items, total: items.length, hasNext: false };
  });
  return page.items;
}
