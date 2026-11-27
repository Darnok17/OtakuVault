import type { EntryType } from "@/lib/types";
import {
  DEFAULT_FILTERS, DETAILS_VERSION, ENTRY_TYPES, TAG_GENRES,
  type BrowseFilters, type DetailsResult, type FuzzyDate, type MediaKind, type Season, type Title, type TitleDetails, type TitlePage,
} from "@/lib/anilist-shared";
import { typeVars } from "./sources/anilist";
import { cached } from "./edge-cache";
import type { AiringStatus } from "./reads";

// CATALOG_SOURCE=anilist (the default): the catalog's read API served straight from AniList,
// with no Postgres at all. Same names and shapes as lib/catalog/reads.ts (the db mode), so pages
// don't know which one they get. This is the pre-catalog lib/anilist.ts with its Postgres cache
// (cached_titles / cached_queries) swapped for lib/catalog/edge-cache.ts.
//
// On Cloudflare every request goes through the relay (ANILIST_API_URL, app/api/anilist-relay on
// Vercel) because AniList blocks Workers.

const ANILIST = "https://graphql.anilist.co";

const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
// Short: this mode trades freshness for fewer AniList calls, and stale entries are still served
// for a few days if AniList is down (see edge-cache.ts).
const TTL = {
  trending: 30 * MIN, seasonal: 3 * HOUR, browse: 3 * HOUR, search: 6 * HOUR, counts: DAY, title: DAY, details: DAY, recs: DAY,
};

export class AniListError extends Error {}
class AniListNotFound extends AniListError {}

/* ---------- Transport ---------- */

// AniList allows 90 req/min per IP (30 while degraded), and every Worker isolate shares the
// relay's IP. Stay under the lower figure per isolate and never wait: out of budget, or inside a
// 429's Retry-After, a call fails at once and the caller serves stale cache or its error state.
const MAX_PER_MIN = 30;
const recent: number[] = [];
let blockedUntil = 0;

async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
  const endpoint = process.env.ANILIST_API_URL || ANILIST;
  // Only for the relay; never sent to AniList itself.
  const relaySecret = endpoint.startsWith(ANILIST) ? undefined : process.env.ANILIST_RELAY_SECRET;

  const now = Date.now();
  while (recent.length && recent[0] < now - 60_000) recent.shift();
  if (now < blockedUntil || recent.length >= MAX_PER_MIN) throw new AniListError("AniList rate limit reached");
  recent.push(now);

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json", Accept: "application/json",
        ...(relaySecret ? { "x-relay-secret": relaySecret } : {}),
      },
      body: JSON.stringify({ query, variables }),
      signal: AbortSignal.timeout(8000),
      cache: "no-store", // edge-cache.ts caches the parsed result
    });
  } catch (err) {
    throw new AniListError(`AniList unreachable: ${(err as Error).message}`);
  }
  if (res.status === 429) {
    blockedUntil = Date.now() + (Number(res.headers.get("Retry-After")) || 60) * 1000;
    throw new AniListError("AniList rate limit reached");
  }
  const body = await res.json().catch(() => null) as { data?: T; errors?: { message: string; status?: number }[] } | null;
  if (res.status === 404 || body?.errors?.some((e) => e.status === 404)) throw new AniListNotFound("Not found on AniList");
  if (!res.ok || !body?.data) throw new AniListError(body?.errors?.[0]?.message ?? `AniList HTTP ${res.status}`);
  return body.data;
}

const MEDIA_FIELDS = `
  id type format status episodes chapters volumes averageScore popularity genres countryOfOrigin
  nextAiringEpisode { episode }
  season seasonYear startDate { year }
  title { romaji english native }
  coverImage { extraLarge large medium color }
  bannerImage`;

type RawMedia = {
  id: number; type: MediaKind; format: string | null; status: string | null;
  episodes: number | null; chapters: number | null; volumes: number | null;
  nextAiringEpisode?: { episode: number } | null;
  averageScore: number | null; popularity: number | null; genres: string[] | null; countryOfOrigin: string | null;
  season: Season | null; seasonYear: number | null; startDate: { year: number | null } | null;
  title: { romaji: string | null; english: string | null; native: string | null };
  coverImage: { extraLarge: string | null; large: string | null; medium: string | null; color: string | null } | null;
  bannerImage: string | null;
  description?: string | null;
  studios?: { nodes: { name: string }[] } | null;
};
type RawPage = { pageInfo: { total: number; hasNextPage: boolean }; media: RawMedia[] };

function entryTypeOf(m: Pick<RawMedia, "type" | "format" | "countryOfOrigin">): EntryType {
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
    airedEpisodes: m.nextAiringEpisode ? Math.max(m.nextAiringEpisode.episode - 1, 0) : null,
    chapters: m.chapters,
    volumes: m.volumes,
    score: m.averageScore,
    popularity: m.popularity,
    genres: m.genres ?? [],
    cover: m.coverImage?.extraLarge ?? m.coverImage?.large ?? null,
    thumb: m.coverImage?.medium ?? m.coverImage?.large ?? null,
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

const cachedPage = (key: string, ttl: number, vars: Record<string, unknown>) => cached(key, ttl, () => fetchPage(vars));

/* ---------- Lists ---------- */

export function searchTitles(query: string, type?: EntryType): Promise<TitlePage> {
  const q = query.trim().replace(/\s+/g, " ");
  if (q.length < 2) return Promise.resolve({ items: [], total: 0, hasNext: false });
  return cachedPage(`search:${type ?? "all"}:${q.toLowerCase()}`, TTL.search,
    { search: q, perPage: 20, sort: ["SEARCH_MATCH"], ...typeVars(type ? [type] : []) });
}

export function getSeasonalLineup(year: number, season: Season): Promise<TitlePage> {
  return getSeasonalPage(year, season, 1);
}

export function getSeasonalPage(year: number, season: Season, page: number): Promise<TitlePage> {
  return cachedPage(`seasonal:${year}:${season}:p${page}`, TTL.seasonal,
    { season, seasonYear: year, type: "ANIME", sort: ["POPULARITY_DESC"], page, perPage: 24 });
}

export function getTrendingNow(type?: EntryType): Promise<TitlePage> {
  return cachedPage(`trending:${type ?? "all"}:20`, TTL.trending,
    { sort: ["TRENDING_DESC"], perPage: 20, ...typeVars(type ? [type] : []) });
}

export function getTrendingPage(type: EntryType | undefined, page: number): Promise<TitlePage> {
  return cachedPage(`trending:${type ?? "all"}:24:p${page}`, TTL.trending,
    { sort: ["TRENDING_DESC"], page, perPage: 24, ...typeVars(type ? [type] : []) });
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
  const vars: Record<string, unknown> = { page, perPage: 24, sort: SORTS[filters.sort], ...typeVars(filters.types) };
  if (filters.statuses.length) vars.status_in = [...filters.statuses].sort();
  if (genres.length) vars.genre_in = genres;
  if (tags.length) vars.tag_in = tags;
  if (filters.yearFrom) vars.startDate_greater = (filters.yearFrom - 1) * 10000 + 1231;
  if (filters.yearTo) vars.startDate_lesser = (filters.yearTo + 1) * 10000;
  // Unscored titles would otherwise flood "Rating ↑".
  if (filters.minStars || filters.sort === "rating-asc") vars.averageScore_greater = Math.max(filters.minStars * 20 - 1, 0);
  return cachedPage(`browse:${JSON.stringify(vars)}`, TTL.browse, vars);
}

// Titles per entry type at AniList, for the Type filter's counts: [anime, manga, webtoon, novel].
export async function getTypeCounts(): Promise<number[] | null> {
  try {
    return await cached("counts:types", TTL.counts, async () => {
      const parts = ENTRY_TYPES.map((t, i) => {
        const v = typeVars([t]);
        const args = Object.entries(v).map(([k, val]) => `${k}: ${Array.isArray(val) ? `[${val.join(",")}]` : k === "countryOfOrigin" ? `"${val}"` : val}`).join(", ");
        return `c${i}: Page(perPage: 1) { pageInfo { total } media(${args}${args ? ", " : ""}isAdult: false) { id } }`;
      });
      const data = await gql<Record<string, { pageInfo: { total: number } }>>(`{ ${parts.join("\n")} }`);
      return ENTRY_TYPES.map((_, i) => data[`c${i}`].pageInfo.total);
    });
  } catch {
    return null;
  }
}

/* ---------- Single titles ---------- */

export function getTitleById(anilistId: number): Promise<Title> {
  return cached(`title:${anilistId}`, TTL.title, async () => {
    const data = await gql<{ Media: RawMedia | null }>(`
      query ($id: Int) { Media(id: $id, isAdult: false) { ${MEDIA_FIELDS} description(asHtml: false) studios(isMain: true) { nodes { name } } } }`,
      { id: anilistId });
    if (!data.Media) throw new AniListNotFound("Title not found");
    return normalize(data.Media);
  });
}

// Used to check an entry's link before saving it. Asks AniList on a cache miss; null when the
// title can't be looked up right now.
export async function getCachedTitle(anilistId: number): Promise<Title | null> {
  return getTitleById(anilistId).catch(() => null);
}

// Titles AniList users recommend for the given sources, round-robin across sources so one
// title can't crowd out the others, de-duped and excluding the sources themselves.
export async function getRecommendations(sourceIds: number[]): Promise<Title[]> {
  const ids = [...new Set(sourceIds)].sort((a, b) => a - b);
  if (!ids.length) return [];
  return cached(`recs:${ids.join(",")}`, TTL.recs, async () => {
    const parts = ids.map((id, i) =>
      `r${i}: Media(id: ${Number(id)}) { recommendations(sort: RATING_DESC, perPage: 15) { nodes { mediaRecommendation { ${MEDIA_FIELDS} isAdult } } } }`);
    const data = await gql<Record<string, { recommendations: { nodes: { mediaRecommendation: (RawMedia & { isAdult: boolean | null }) | null }[] } } | null>>(`{ ${parts.join("\n")} }`);
    const lists = ids.map((_, i) =>
      (data[`r${i}`]?.recommendations.nodes ?? []).flatMap((n) => (n.mediaRecommendation && !n.mediaRecommendation.isAdult ? [normalize(n.mediaRecommendation)] : [])));
    const seen = new Set(ids);
    const items: Title[] = [];
    for (let i = 0; lists.some((l) => i < l.length); i++) {
      for (const list of lists) {
        const t = list[i];
        if (t && !seen.has(t.anilistId)) { seen.add(t.anilistId); items.push(t); }
      }
    }
    return items;
  });
}

/* ---------- Title details ---------- */

const DETAILS_QUERY = `
  query ($id: Int) {
    Media(id: $id, isAdult: false) {
      ${MEDIA_FIELDS}
      idMal siteUrl duration meanScore favourites synonyms source(version: 3)
      description(asHtml: false)
      endDate { year month day }
      startDate { year month day }
      rankings { rank type allTime }
      tags { name rank isMediaSpoiler isAdult }
      studios { edges { isMain node { name } } }
      staff(perPage: 50, sort: [RELEVANCE, ID]) { edges { role node { id name { full } image { large } } } }
      characters(perPage: 50, sort: [ROLE, RELEVANCE, ID]) {
        edges {
          role
          node { id name { full } image { large } }
          voiceActors(sort: [RELEVANCE, ID]) { id name { full } image { large } languageV2 }
        }
      }
      relations {
        edges {
          relationType(version: 2)
          node { id type format countryOfOrigin title { romaji english } coverImage { large } }
        }
      }
      recommendations(sort: RATING_DESC, perPage: 12) { nodes { mediaRecommendation { ${MEDIA_FIELDS} isAdult } } }
      streamingEpisodes { title thumbnail url site }
      externalLinks { url site language icon color }
      trailer { id site }
    }
  }`;

type RawPerson = { id: number; name: { full: string | null } | null; image: { large: string | null } | null };
type RawDetails = Omit<RawMedia, "studios" | "startDate"> & {
  idMal: number | null; siteUrl: string | null; duration: number | null; meanScore: number | null; favourites: number | null;
  synonyms: string[] | null; source: string | null;
  startDate: FuzzyDate | null; endDate: FuzzyDate | null;
  rankings: { rank: number; type: string; allTime: boolean | null }[] | null;
  tags: { name: string; rank: number | null; isMediaSpoiler: boolean | null; isAdult: boolean | null }[] | null;
  studios: { edges: { isMain: boolean; node: { name: string } | null }[] } | null;
  staff: { edges: { role: string | null; node: RawPerson | null }[] } | null;
  characters: { edges: { role: string | null; node: RawPerson | null; voiceActors: (RawPerson & { languageV2: string | null })[] | null }[] } | null;
  relations: { edges: { relationType: string | null; node: (Pick<RawMedia, "id" | "type" | "format" | "countryOfOrigin"> & { title: { romaji: string | null; english: string | null }; coverImage: { large: string | null } | null }) | null }[] } | null;
  recommendations: { nodes: { mediaRecommendation: (RawMedia & { isAdult: boolean | null }) | null }[] } | null;
  streamingEpisodes: TitleDetails["streamingEpisodes"] | null;
  externalLinks: { url: string | null; site: string; language: string | null; icon: string | null; color: string | null }[] | null;
  trailer: { id: string | null; site: string | null } | null;
};

const hasDate = (d: FuzzyDate | null) => (d?.year ? d : null);
const isWebUrl = (url: string | null): url is string => !!url && /^https?:\/\//i.test(url);

function normalizeDetails(m: RawDetails): TitleDetails {
  const base = normalize({
    ...m,
    startDate: m.startDate,
    studios: { nodes: (m.studios?.edges ?? []).flatMap((e) => (e.isMain && e.node ? [e.node] : [])) },
  });
  return {
    v: DETAILS_VERSION,
    fetchedAt: Date.now(),
    anilistId: base.anilistId,
    idMal: m.idMal,
    siteUrl: m.siteUrl,
    kind: base.kind,
    entryType: base.entryType,
    title: base.title,
    romaji: base.romaji,
    english: m.title.english,
    native: base.native,
    synonyms: m.synonyms ?? [],
    cover: base.cover,
    color: base.color,
    banner: base.banner,
    description: m.description ?? null,
    format: base.format,
    status: base.status,
    episodes: base.episodes,
    chapters: base.chapters,
    volumes: base.volumes,
    duration: m.duration,
    startDate: hasDate(m.startDate),
    endDate: hasDate(m.endDate),
    season: base.season,
    seasonYear: base.seasonYear,
    averageScore: base.score,
    meanScore: m.meanScore,
    popularity: base.popularity,
    popularityRank: m.rankings?.find((r) => r.type === "POPULAR" && r.allTime)?.rank ?? null,
    favourites: m.favourites,
    source: m.source,
    genres: base.genres,
    tags: (m.tags ?? []).filter((t) => !t.isMediaSpoiler && !t.isAdult).map((t) => ({ name: t.name, rank: t.rank ?? 0 })),
    studios: (m.studios?.edges ?? []).flatMap((e) => (e.node ? [{ name: e.node.name, isMain: e.isMain }] : [])),
    staff: (m.staff?.edges ?? []).flatMap((e) => (e.node?.name?.full
      ? [{ id: e.node.id, name: e.node.name.full, role: e.role, image: e.node.image?.large ?? null }] : [])),
    characters: (m.characters?.edges ?? []).flatMap((e) => (e.node?.name?.full
      ? [{
          id: e.node.id, name: e.node.name.full, role: e.role, image: e.node.image?.large ?? null,
          voiceActors: (e.voiceActors ?? []).flatMap((v) => (v.name?.full
            ? [{ id: v.id, name: v.name.full, image: v.image?.large ?? null, language: v.languageV2 }] : [])),
        }] : [])),
    relations: (m.relations?.edges ?? []).flatMap((e) => (e.node
      ? [{
          id: e.node.id, relationType: e.relationType, format: e.node.format, entryType: entryTypeOf(e.node),
          title: e.node.title.english ?? e.node.title.romaji ?? `#${e.node.id}`,
          cover: e.node.coverImage?.large ?? null,
        }] : [])),
    recommendations: (m.recommendations?.nodes ?? []).flatMap((n) =>
      (n.mediaRecommendation && !n.mediaRecommendation.isAdult ? [normalize(n.mediaRecommendation)] : [])),
    streamingEpisodes: m.streamingEpisodes ?? [],
    externalLinks: (m.externalLinks ?? []).flatMap((l) => (isWebUrl(l.url) ? [{ url: l.url, site: l.site, language: l.language, icon: l.icon, color: l.color }] : [])),
    trailer: m.trailer?.id && m.trailer.site ? { id: m.trailer.id, site: m.trailer.site } : null,
  };
}

// One Media query per title per TTL.details; unknown ids are cached as null too, so a bad link
// doesn't cost a request per visit.
export async function getTitleDetails(anilistId: number, type: EntryType): Promise<DetailsResult> {
  const details = await cached(`details:v${DETAILS_VERSION}:${anilistId}`, TTL.details, async () => {
    try {
      const { Media } = await gql<{ Media: RawDetails | null }>(DETAILS_QUERY, { id: anilistId });
      return Media ? normalizeDetails(Media) : null;
    } catch (err) {
      if (err instanceof AniListNotFound) return null;
      throw err;
    }
  });
  if (!details) return { status: "not-found" };
  return details.entryType === type ? { status: "ok", details } : { status: "wrong-type", entryType: details.entryType };
}

/* ---------- Airing status (new-episodes job) ---------- */

const AIRING_BATCH = 50; // AniList's maximum perPage

// Always fresh (no cache): the job runs on a schedule and needs the current airing state.
// Batches run one after another under the rate limiter; if one fails, the statuses fetched so
// far are returned, and the rest wait for the next run (the job reports them as unchecked).
export async function getAiringStatus(anilistIds: number[]): Promise<Map<number, AiringStatus>> {
  const statuses = new Map<number, AiringStatus>();
  const unique = [...new Set(anilistIds)];
  for (let i = 0; i < unique.length; i += AIRING_BATCH) {
    const batch = unique.slice(i, i + AIRING_BATCH);
    try {
      const data = await gql<{ Page: { media: { id: number; status: string | null; episodes: number | null; title: RawMedia["title"]; nextAiringEpisode: { episode: number; airingAt: number } | null }[] } }>(
        `query ($ids: [Int], $perPage: Int) {
          Page(page: 1, perPage: $perPage) {
            media(id_in: $ids, type: ANIME) { id status episodes title { romaji english native } nextAiringEpisode { episode airingAt } }
          }
        }`,
        { ids: batch, perPage: AIRING_BATCH },
      );
      for (const m of data.Page.media) {
        const latestEpisode =
          m.nextAiringEpisode ? Math.max(m.nextAiringEpisode.episode - 1, 0)
          : m.status === "FINISHED" ? m.episodes
          : m.status === "NOT_YET_RELEASED" ? 0
          : null;
        statuses.set(m.id, { anilistId: m.id, title: m.title.english ?? m.title.romaji ?? `#${m.id}`, status: m.status, latestEpisode });
      }
    } catch (err) {
      console.warn(`getAiringStatus: ${(err as Error).message}; ${unique.length - i} show(s) left for the next run`);
      break;
    }
  }
  return statuses;
}
