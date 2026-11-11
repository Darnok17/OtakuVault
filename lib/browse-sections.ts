import { SEASON_INFO, type BrowseFilters, type Season } from "./anilist-shared";
import type { EntryType } from "./types";

// The "See more" pages behind the Index rails: /index-page/<id>[/<param>]. Shared by the rails
// (for their links), the pages and the load-more action. Pure data — no server imports.

type Source =
  | { kind: "trending"; type?: EntryType }
  | { kind: "seasonal" }
  | { kind: "browse"; type: EntryType; filters: Partial<BrowseFilters> };

export type BrowseSection = {
  title: string;
  kanji: string;
  latin: string; // what the kanji says, for themes that don't show it
  crumb: [label: string, href: string];
  blurb: string;
  source: Source;
};

export const BROWSE_SECTIONS = {
  "all/trending": {
    title: "Trending Now", kanji: "話題", latin: "Trending", crumb: ["All", "/index-page"],
    blurb: "What people are watching and reading this hour, across anime, manga, webtoons and novels.",
    source: { kind: "trending" },
  },
  "anime/trending": {
    title: "Trending Anime", kanji: "話題", latin: "Trending", crumb: ["Anime", "/index-page/anime"],
    blurb: "The anime getting the most attention right now. Refreshed hourly.",
    source: { kind: "trending", type: "anime" },
  },
  "anime/seasonal": {
    title: "This Season", kanji: "今期アニメ", latin: "Seasonal", crumb: ["Anime", "/index-page/anime"],
    blurb: "Every show airing this season, most popular first.",
    source: { kind: "seasonal" },
  },
  "manga/ongoing": {
    title: "Hot Ongoing Manga", kanji: "連載中", latin: "Ongoing", crumb: ["Manga", "/index-page/manga"],
    blurb: "Series still in serialization, ordered by how many readers follow them.",
    source: { kind: "browse", type: "manga", filters: { statuses: ["RELEASING"], sort: "popularity" } },
  },
  "manga/trending": {
    title: "Trending Manga", kanji: "話題", latin: "Trending", crumb: ["Manga", "/index-page/manga"],
    blurb: "The manga getting the most attention right now. Refreshed hourly.",
    source: { kind: "trending", type: "manga" },
  },
  "webtoons/new": {
    title: "New Webtoons This Week", kanji: "新着", latin: "New arrivals", crumb: ["Webtoons", "/index-page/webtoons"],
    blurb: "The newest webtoons still releasing, latest first.",
    source: { kind: "browse", type: "webtoon", filters: { statuses: ["RELEASING"], sort: "newest" } },
  },
  "webtoons/trending": {
    title: "Trending Webtoons", kanji: "話題", latin: "Trending", crumb: ["Webtoons", "/index-page/webtoons"],
    blurb: "The webtoons getting the most attention right now. Refreshed hourly.",
    source: { kind: "trending", type: "webtoon" },
  },
  "novels/recent-translation": {
    title: "Recently Translated", kanji: "新訳", latin: "New in translation", crumb: ["Novels", "/index-page/novels"],
    blurb: "The newest light novels still releasing, latest first.",
    source: { kind: "browse", type: "novel", filters: { statuses: ["RELEASING"], sort: "newest" } },
  },
  "novels/trending": {
    title: "Trending Novels", kanji: "話題", latin: "Trending", crumb: ["Novels", "/index-page/novels"],
    blurb: "The light novels getting the most attention right now. Refreshed hourly.",
    source: { kind: "trending", type: "novel" },
  },
} as const satisfies Record<string, BrowseSection>;

export type BrowseSectionId = keyof typeof BROWSE_SECTIONS;
export const isBrowseSectionId = (v: unknown): v is BrowseSectionId => typeof v === "string" && Object.hasOwn(BROWSE_SECTIONS, v);

export const BROWSE_PER_PAGE = 24;
// AniList stops paging reliably past a few thousand results; nobody scrolls that far anyway.
export const BROWSE_MAX_PAGE = 100;

/* ---------- Links ---------- */

const SEASON_SLUGS: Record<Season, string> = { WINTER: "winter", SPRING: "spring", SUMMER: "summer", FALL: "fall" };

export const seasonSlug = (year: number, season: Season) => `${SEASON_SLUGS[season]}-${year}`;

export function parseSeasonSlug(slug: string): { year: number; season: Season } | null {
  const m = /^(winter|spring|summer|fall)-(\d{4})$/.exec(slug);
  if (!m) return null;
  const year = Number(m[2]);
  if (year < 1960 || year > 2100) return null;
  const season = (Object.keys(SEASON_SLUGS) as Season[]).find((s) => SEASON_SLUGS[s] === m[1])!;
  return { year, season };
}

export const seasonTitle = (year: number, season: Season) => `${SEASON_INFO[season].label} ${year} Season`;

export const browseHref = (id: BrowseSectionId, param?: string) => `/index-page/${id}${param ? `/${param}` : ""}`;

const TRENDING_BY_TYPE: Record<EntryType, BrowseSectionId> = {
  anime: "anime/trending", manga: "manga/trending", webtoon: "webtoons/trending", novel: "novels/trending",
};
export const trendingSection = (type?: EntryType): BrowseSectionId => (type ? TRENDING_BY_TYPE[type] : "all/trending");

export const LINEUP_SECTION: Record<Exclude<EntryType, "anime">, BrowseSectionId> = {
  manga: "manga/ongoing", webtoon: "webtoons/new", novel: "novels/recent-translation",
};
