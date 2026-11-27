import type { EntryType } from "@/lib/types";
import { DETAILS_VERSION, ENTRY_TYPES, type FuzzyDate, type MediaKind, type Season, type Title, type TitleExtras } from "@/lib/anilist-shared";
import { SourceError, type AiringEpisode, type CatalogSource, type SourceDetails, type SourcePage, type SourceTitle } from "../source";

// AniList (https://graphql.anilist.co) as a catalog source.
//
// Rate limit: AniList allows 90 requests/min per IP, 30 while degraded (the X-RateLimit-Limit
// header says which). Two modes:
//  - request time (the Worker filling a catalog miss): never waits. Out of budget, or within a
//    429's Retry-After, it throws SourceError and the caller serves what the catalog has.
//  - sync job: waits for a slot, honours Retry-After on 429, and retries network errors and
//    5xx with exponential backoff.

export type AniListOptions = {
  endpoint?: string;
  // Sent as x-relay-secret when endpoint is the temporary relay (app/api/anilist-relay).
  relaySecret?: string;
  perMinute?: number;
  wait?: boolean;
  maxRetries?: number;
  timeoutMs?: number;
  fetch?: typeof fetch;
  log?: (msg: string) => void;
};

const ANILIST = "https://graphql.anilist.co";
const PER_PAGE = 50; // AniList's maximum

class NotFound extends SourceError {}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/* ---------- Fields ---------- */

// Enough for a list card and the new-episodes job. Used for recommendation nodes and airing media.
const BASE_FIELDS = `
  id idMal type format status episodes chapters volumes averageScore popularity trending genres countryOfOrigin isAdult updatedAt
  nextAiringEpisode { episode airingAt }
  season seasonYear startDate { year month day }
  title { romaji english native }
  coverImage { extraLarge large medium color }
  bannerImage`;

// Everything stored on a titles row, including tags and studios.
const FULL_FIELDS = `${BASE_FIELDS}
  synonyms duration meanScore favourites source(version: 3) siteUrl description(asHtml: false)
  endDate { year month day }
  tags { name category rank isMediaSpoiler isAdult }
  studios { edges { isMain node { id name isAnimationStudio } } }`;

const DETAILS_FIELDS = `${FULL_FIELDS}
  rankings { rank type allTime }
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
      node { id type format countryOfOrigin title { romaji english } coverImage { large } startDate { year month day } }
    }
  }
  recommendations(sort: RATING_DESC, perPage: 12) { nodes { mediaRecommendation { ${BASE_FIELDS} } } }
  streamingEpisodes { title thumbnail url site }
  externalLinks { url site language icon color }
  trailer { id site }`;

/* ---------- Raw shapes ---------- */

type RawMedia = {
  id: number; idMal: number | null; type: MediaKind; format: string | null; status: string | null;
  episodes: number | null; chapters: number | null; volumes: number | null;
  averageScore: number | null; popularity: number | null; trending: number | null;
  genres: string[] | null; countryOfOrigin: string | null; isAdult: boolean | null; updatedAt: number | null;
  nextAiringEpisode: { episode: number; airingAt: number } | null;
  season: Season | null; seasonYear: number | null; startDate: FuzzyDate | null;
  title: { romaji: string | null; english: string | null; native: string | null };
  coverImage: { extraLarge: string | null; large: string | null; medium: string | null; color: string | null } | null;
  bannerImage: string | null;
  // FULL_FIELDS only
  synonyms?: string[] | null; duration?: number | null; meanScore?: number | null; favourites?: number | null;
  source?: string | null; siteUrl?: string | null; description?: string | null; endDate?: FuzzyDate | null;
  tags?: { name: string; category: string | null; rank: number | null; isMediaSpoiler: boolean | null; isAdult: boolean | null }[] | null;
  studios?: { edges: { isMain: boolean; node: { id: number; name: string; isAnimationStudio: boolean } | null }[] } | null;
};

type RawPerson = { id: number; name: { full: string | null } | null; image: { large: string | null } | null };
type RawDetails = RawMedia & {
  rankings: { rank: number; type: string; allTime: boolean | null }[] | null;
  staff: { edges: { role: string | null; node: RawPerson | null }[] } | null;
  characters: { edges: { role: string | null; node: RawPerson | null; voiceActors: (RawPerson & { languageV2: string | null })[] | null }[] } | null;
  relations: { edges: { relationType: string | null; node: (Pick<RawMedia, "id" | "type" | "format" | "countryOfOrigin"> & { title: { romaji: string | null; english: string | null }; coverImage: { large: string | null } | null; startDate: FuzzyDate | null }) | null }[] } | null;
  recommendations: { nodes: { mediaRecommendation: RawMedia | null }[] } | null;
  streamingEpisodes: TitleExtras["streamingEpisodes"] | null;
  externalLinks: { url: string | null; site: string; language: string | null; icon: string | null; color: string | null }[] | null;
  trailer: { id: string | null; site: string | null } | null;
};

type RawPage = { pageInfo: { hasNextPage: boolean }; media: RawMedia[] };

/* ---------- Normalizing ---------- */

// AniList has no "webtoon" type: webtoons are Korean MANGA and novels are MANGA with format NOVEL.
export function entryTypeOf(m: Pick<RawMedia, "type" | "format" | "countryOfOrigin">): EntryType {
  if (m.type === "ANIME") return "anime";
  if (m.format === "NOVEL") return "novel";
  return m.countryOfOrigin === "KR" ? "webtoon" : "manga";
}

const hasDate = (d: FuzzyDate | null | undefined) => (d?.year ? d : null);
const isWebUrl = (url: string | null): url is string => !!url && /^https?:\/\//i.test(url);

export function normalizeMedia(m: RawMedia): SourceTitle {
  const romaji = m.title.romaji ?? m.title.english ?? `#${m.id}`;
  const t: SourceTitle = {
    ids: { anilist: m.id, mal: m.idMal ?? null },
    kind: m.type,
    entryType: entryTypeOf(m),
    title: m.title.english ?? romaji,
    romaji,
    english: m.title.english,
    native: m.title.native,
    format: m.format,
    status: m.status,
    country: m.countryOfOrigin,
    isAdult: !!m.isAdult,
    episodes: m.episodes,
    airedEpisodes: m.nextAiringEpisode ? Math.max(m.nextAiringEpisode.episode - 1, 0) : null,
    nextAiring: m.nextAiringEpisode ? { episode: m.nextAiringEpisode.episode, airingAt: new Date(m.nextAiringEpisode.airingAt * 1000) } : null,
    chapters: m.chapters,
    volumes: m.volumes,
    averageScore: m.averageScore,
    popularity: m.popularity,
    trending: m.trending,
    season: m.season,
    seasonYear: m.seasonYear,
    startDate: hasDate(m.startDate),
    color: m.coverImage?.color ?? null,
    coverUrl: m.coverImage?.extraLarge ?? m.coverImage?.large ?? null,
    thumbUrl: m.coverImage?.medium ?? m.coverImage?.large ?? null,
    bannerUrl: m.bannerImage,
    genres: m.genres ?? [],
    updatedAt: m.updatedAt ? new Date(m.updatedAt * 1000) : null,
  };
  if (m.description !== undefined) {
    Object.assign(t, {
      synonyms: m.synonyms ?? [],
      duration: m.duration ?? null,
      meanScore: m.meanScore ?? null,
      favourites: m.favourites ?? null,
      sourceMaterial: m.source ?? null,
      siteUrl: m.siteUrl ?? null,
      description: m.description ?? null,
      endDate: hasDate(m.endDate),
      tags: (m.tags ?? []).map((x) => ({
        name: x.name, category: x.category, rank: x.rank ?? 0, isSpoiler: !!x.isMediaSpoiler, isAdult: !!x.isAdult,
      })),
      studios: (m.studios?.edges ?? []).flatMap((e) => (e.node
        ? [{ sourceId: e.node.id, name: e.node.name, isMain: e.isMain, isAnimationStudio: e.node.isAnimationStudio }] : [])),
    } satisfies Partial<SourceTitle>);
  }
  return t;
}

// A recommendation as the detail page shows it (a Title card). Covers point at the provider
// until the catalog overlays its own copies at read time.
function toCard(t: SourceTitle): Title {
  return {
    anilistId: t.ids.anilist, kind: t.kind, entryType: t.entryType, title: t.title, romaji: t.romaji, native: t.native,
    format: t.format, status: t.status, episodes: t.episodes, airedEpisodes: t.airedEpisodes, chapters: t.chapters,
    volumes: t.volumes, score: t.averageScore, popularity: t.popularity, genres: t.genres, cover: t.coverUrl,
    thumb: t.thumbUrl, banner: t.bannerUrl, color: t.color, season: t.season, seasonYear: t.seasonYear,
    startYear: t.startDate?.year ?? null,
  };
}

function normalizeDetails(m: RawDetails): SourceDetails {
  const related = (m.recommendations?.nodes ?? []).flatMap((n) => (n.mediaRecommendation ? [normalizeMedia(n.mediaRecommendation)] : []));
  const extras: TitleExtras = {
    v: DETAILS_VERSION,
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
          title: e.node.title.english ?? e.node.title.romaji ?? `#${e.node.id}`, cover: e.node.coverImage?.large ?? null,
          startDate: hasDate(e.node.startDate),
        }] : [])),
    recommendations: related.filter((t) => !t.isAdult).map(toCard),
    streamingEpisodes: m.streamingEpisodes ?? [],
    externalLinks: (m.externalLinks ?? []).flatMap((l) => (isWebUrl(l.url) ? [{ url: l.url, site: l.site, language: l.language, icon: l.icon, color: l.color }] : [])),
    trailer: m.trailer?.id && m.trailer.site ? { id: m.trailer.id, site: m.trailer.site } : null,
  };
  return {
    title: normalizeMedia(m),
    extras,
    popularityRank: m.rankings?.find((r) => r.type === "POPULAR" && r.allTime)?.rank ?? null,
    related,
  };
}

/* ---------- Query variables ---------- */

const ANIME_FORMATS = ["TV", "TV_SHORT", "MOVIE", "SPECIAL", "OVA", "ONA", "MUSIC"];

// Filters selecting one entry type (or all of them).
export function typeVars(types: EntryType[]): Record<string, unknown> {
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
         $id_in: [Int], $popularity_greater: Int, $popularity_lesser: Int, $isAdult: Boolean) {
    Page(page: $page, perPage: $perPage) {
      pageInfo { hasNextPage }
      media(search: $search, type: $type, format_in: $format_in, countryOfOrigin: $countryOfOrigin,
            season: $season, seasonYear: $seasonYear, sort: $sort, id_in: $id_in, popularity_greater: $popularity_greater,
            popularity_lesser: $popularity_lesser, isAdult: $isAdult) {
        ${FULL_FIELDS}
      }
    }
  }`;

/* ---------- Source ---------- */

export function createAniListSource(opts: AniListOptions = {}): CatalogSource {
  const endpoint = opts.endpoint || ANILIST;
  const relaySecret = endpoint.startsWith(ANILIST) ? undefined : opts.relaySecret;
  const perMinute = opts.perMinute ?? 30;
  const wait = opts.wait ?? false;
  const maxRetries = opts.maxRetries ?? (wait ? 5 : 0);
  const doFetch = opts.fetch ?? fetch;
  const log = opts.log ?? (() => {});

  const recent: number[] = [];
  let blockedUntil = 0;

  async function slot() {
    for (;;) {
      const now = Date.now();
      while (recent.length && recent[0] <= now - 60_000) recent.shift();
      const freeAt = Math.max(blockedUntil, recent.length >= perMinute ? recent[0] + 60_000 : 0);
      if (freeAt <= now) { recent.push(now); return; }
      if (!wait) throw new SourceError("AniList rate limit reached");
      await sleep(freeAt - now + 50);
    }
  }

  async function gql<T>(query: string, variables: Record<string, unknown> = {}): Promise<T> {
    for (let attempt = 0; ; attempt++) {
      await slot();
      let res: Response;
      try {
        res = await doFetch(endpoint, {
          method: "POST",
          headers: {
            "Content-Type": "application/json", Accept: "application/json",
            ...(relaySecret ? { "x-relay-secret": relaySecret } : {}),
          },
          body: JSON.stringify({ query, variables }),
          signal: AbortSignal.timeout(opts.timeoutMs ?? 10_000),
        });
      } catch (err) {
        if (attempt < maxRetries) { await backoff(attempt, `network: ${(err as Error).message}`); continue; }
        throw new SourceError(`AniList unreachable: ${(err as Error).message}`);
      }
      if (res.status === 429) {
        const retryAfter = Number(res.headers.get("Retry-After")) || 60;
        blockedUntil = Date.now() + retryAfter * 1000;
        if (attempt < maxRetries) { log(`AniList 429, waiting ${retryAfter}s`); continue; } // slot() waits it out
        throw new SourceError("AniList rate limit reached");
      }
      const body = await res.json().catch(() => null) as { data?: T; errors?: { message: string; status?: number }[] } | null;
      if (res.status === 404 || body?.errors?.some((e) => e.status === 404)) throw new NotFound("Not found on AniList");
      if (res.status >= 500 && attempt < maxRetries) { await backoff(attempt, `HTTP ${res.status}`); continue; }
      if (!res.ok || !body?.data) throw new SourceError(body?.errors?.[0]?.message ?? `AniList HTTP ${res.status}`);
      return body.data;
    }
  }

  async function backoff(attempt: number, why: string) {
    const ms = Math.min(2 ** attempt * 2000, 60_000);
    log(`AniList ${why}; retrying in ${ms / 1000}s`);
    await sleep(ms);
  }

  const page = async (vars: Record<string, unknown>): Promise<SourcePage> => {
    const { Page } = await gql<{ Page: RawPage }>(PAGE_QUERY, { perPage: PER_PAGE, ...vars });
    return { items: Page.media.map(normalizeMedia), hasNext: Page.pageInfo.hasNextPage };
  };

  return {
    name: "anilist",

    async fetchById(ids) {
      const unique = [...new Set(ids)];
      const out: SourceTitle[] = [];
      for (let i = 0; i < unique.length; i += PER_PAGE) {
        out.push(...(await page({ page: 1, id_in: unique.slice(i, i + PER_PAGE) })).items);
      }
      return out;
    },

    async fetchDetails(id) {
      try {
        const { Media } = await gql<{ Media: RawDetails | null }>(`query ($id: Int) { Media(id: $id) { ${DETAILS_FIELDS} } }`, { id });
        return Media ? normalizeDetails(Media) : null;
      } catch (err) {
        if (err instanceof NotFound) return null;
        throw err;
      }
    },

    async *fetchUpdatedSince(since, maxPages) {
      for (let p = 1; p <= maxPages; p++) {
        const { items, hasNext } = await page({ page: p, sort: ["UPDATED_AT_DESC"] });
        const fresh = items.filter((t) => t.updatedAt && t.updatedAt > since);
        if (fresh.length) yield fresh;
        if (!hasNext || fresh.length < items.length) return;
      }
    },

    async fetchAiring(from, to, maxPages) {
      const out: AiringEpisode[] = [];
      for (let p = 1; p <= maxPages; p++) {
        const { Page } = await gql<{ Page: { pageInfo: { hasNextPage: boolean }; airingSchedules: { episode: number; airingAt: number; media: RawMedia | null }[] } }>(`
          query ($page: Int, $from: Int, $to: Int) {
            Page(page: $page, perPage: ${PER_PAGE}) {
              pageInfo { hasNextPage }
              airingSchedules(airingAt_greater: $from, airingAt_lesser: $to, sort: TIME) {
                episode airingAt media { ${FULL_FIELDS} }
              }
            }
          }`, { page: p, from: Math.floor(from.getTime() / 1000) - 1, to: Math.floor(to.getTime() / 1000) });
        for (const s of Page.airingSchedules) {
          if (!s.media) continue;
          out.push({ anilistId: s.media.id, episode: s.episode, airingAt: new Date(s.airingAt * 1000), title: normalizeMedia(s.media) });
        }
        if (!Page.pageInfo.hasNextPage) break;
      }
      return out;
    },

    async search(query, type) {
      const q = query.trim().replace(/\s+/g, " ");
      return (await page({ page: 1, perPage: 20, search: q, sort: ["SEARCH_MATCH"], isAdult: false, ...typeVars(type ? [type] : []) })).items;
    },

    fetchPage({ kind, minPopularity, maxPopularity, page: p }) {
      return page({
        page: p, type: kind, sort: ["POPULARITY_DESC", "ID"], isAdult: false,
        popularity_greater: minPopularity - 1, // both bounds are exclusive at AniList
        ...(maxPopularity !== null ? { popularity_lesser: maxPopularity + 1 } : {}),
      });
    },

    fetchTrending(type, p) {
      return page({ page: p, sort: ["TRENDING_DESC"], isAdult: false, ...typeVars([type]) });
    },

    fetchSeason(year, season, p) {
      return page({ page: p, type: "ANIME", season, seasonYear: year, sort: ["POPULARITY_DESC"], isAdult: false });
    },
  };
}
