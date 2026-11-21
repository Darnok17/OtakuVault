import type { EntryType } from "@/lib/types";
import type { FuzzyDate, MediaKind, Season, TitleExtras } from "@/lib/anilist-shared";

// The contract between the catalog and a metadata provider. Pages never talk to a provider:
// the sync job (lib/catalog/sync.ts) does, plus the one-off fetch for a title the catalog
// doesn't have yet (lib/catalog/index.ts). AniList (sources/anilist.ts) is the only provider
// today; another one implements this interface and fills its own *_id column.

// A title as a provider describes it, already normalized. Fields a particular request didn't ask
// for are undefined, which the catalog reads as "keep what's stored".
export type SourceTitle = {
  ids: { anilist: number; mal: number | null };
  kind: MediaKind;
  entryType: EntryType;
  title: string; // english, else romaji
  romaji: string;
  english: string | null;
  native: string | null;
  synonyms?: string[];
  format: string | null;
  status: string | null;
  country: string | null;
  isAdult: boolean;
  episodes: number | null;
  airedEpisodes: number | null;
  nextAiring: { episode: number; airingAt: Date } | null;
  chapters: number | null;
  volumes: number | null;
  duration?: number | null;
  averageScore: number | null;
  meanScore?: number | null;
  popularity: number | null;
  trending: number | null;
  favourites?: number | null;
  season: Season | null;
  seasonYear: number | null;
  startDate: FuzzyDate | null;
  endDate?: FuzzyDate | null;
  description?: string | null;
  sourceMaterial?: string | null;
  siteUrl?: string | null;
  color: string | null;
  coverUrl: string | null;
  thumbUrl: string | null;
  bannerUrl: string | null;
  genres: string[];
  tags?: { name: string; category: string | null; rank: number; isSpoiler: boolean; isAdult: boolean }[];
  studios?: { sourceId: number; name: string; isMain: boolean; isAnimationStudio: boolean }[];
  updatedAt: Date | null;
};

export type SourceDetails = {
  title: SourceTitle;
  extras: TitleExtras;
  popularityRank: number | null;
  // Titles the extras point at (recommendations), so the catalog can store them too.
  related: SourceTitle[];
};

export type AiringEpisode = { anilistId: number; episode: number; airingAt: Date; title: SourceTitle };

export type SourcePage = { items: SourceTitle[]; hasNext: boolean };

// Deepest page fetchPage can serve (AniList: 5000 entries at 50 per page).
export const MAX_PAGE_DEPTH = 100;

// Raised when the provider is rate limiting us, down, or answering with an error. Callers fall
// back to what the catalog already has.
export class SourceError extends Error {}

export interface CatalogSource {
  readonly name: string;
  // Base records for these ids, in any order; ids the provider doesn't know are left out.
  fetchById(ids: number[]): Promise<SourceTitle[]>;
  // A base record plus extras (characters, staff, relations, …); null if the id doesn't exist.
  fetchDetails(id: number): Promise<SourceDetails | null>;
  // Titles edited at the provider after `since`, newest edit first, one page per iteration.
  // Stops by itself at the first title edited at or before `since`, or after maxPages.
  fetchUpdatedSince(since: Date, maxPages: number): AsyncIterable<SourceTitle[]>;
  // Episodes airing in [from, to), with their titles.
  fetchAiring(from: Date, to: Date, maxPages: number): Promise<AiringEpisode[]>;
  search(query: string, type?: EntryType): Promise<SourceTitle[]>;
  // The backfill's walk over the provider: titles with popularity in [minPopularity,
  // maxPopularity] (no ceiling when null), most popular first, 1-based pages of 50. AniList can't
  // page deeper than 5000 entries, so the backfill starts a new window below the last popularity
  // it saw once it reaches MAX_PAGE_DEPTH.
  fetchPage(opts: { kind: MediaKind; minPopularity: number; maxPopularity: number | null; page: number }): Promise<SourcePage>;
  // Trending titles of one entry type, best first (1-based page of 50).
  fetchTrending(type: EntryType, page: number): Promise<SourcePage>;
  // An anime season's titles by popularity (1-based page of 50).
  fetchSeason(year: number, season: Season, page: number): Promise<SourcePage>;
}
