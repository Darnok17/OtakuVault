import { DEFAULT_FILTERS, ENTRY_TYPES, type BrowseFilters, type BrowseSort, type BrowseStatus } from "@/lib/anilist-shared";
import type { EntryType } from "@/lib/types";

// The Index filters as URL state, e.g. /index-page/anime?genre=action&year=2020. Client-safe: the
// server parses this for the first page of results and the client for its initial filter state.

export type RawSearchParams = Record<string, string | string[] | undefined>;
type ParamReader = Pick<URLSearchParams, "get" | "getAll">;

export const BROWSE_GENRES = ["Action","Adventure","Comedy","Drama","Fantasy","Horror","Isekai","Mecha","Mystery","Romance","Sci-Fi","Seinen","Shonen","Slice of Life","Sports","Supernatural","Thriller"];
const STATUSES: BrowseStatus[] = ["RELEASING", "FINISHED", "NOT_YET_RELEASED", "HIATUS"];
const SORTS: BrowseSort[] = ["popularity", "rating-desc", "rating-asc", "newest", "oldest"];

const slug = (s: string) => s.toLowerCase().replace(/[\s_]+/g, "-");

export const parseYear = (s: string) => (/^\d{4}$/.test(s) && +s >= 1950 && +s <= 2030 ? +s : null);

export function toUrlParams(raw: RawSearchParams) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(raw)) {
    for (const value of [v].flat()) if (value !== undefined) params.append(k, value);
  }
  return params;
}

// Unknown values are dropped rather than rejected, so a hand-edited URL still renders.
// `lockedType` is the type a sub-route commits to; it wins over any ?type= in the URL.
export function filtersFromParams(params: ParamReader, lockedType?: EntryType): BrowseFilters {
  const many = (name: string) => new Set(params.getAll(name).flatMap((v) => v.split(",")).map((v) => slug(v.trim())));
  const picked = many("type");
  const statuses = many("status");
  const genres = many("genre");
  const year = parseYear(params.get("year") ?? "");
  const rating = Number(params.get("rating"));
  const sort = params.get("sort") as BrowseSort;
  const types = ENTRY_TYPES.filter((t) => picked.has(t));

  return {
    types: lockedType ? [lockedType] : types.length ? types : [...ENTRY_TYPES],
    statuses: STATUSES.filter((s) => statuses.has(slug(s))),
    genres: BROWSE_GENRES.filter((g) => genres.has(slug(g))),
    yearFrom: year ?? parseYear(params.get("from") ?? ""),
    yearTo: year ?? parseYear(params.get("to") ?? ""),
    minStars: Number.isInteger(rating) && rating >= 1 && rating <= 5 ? rating : 0,
    sort: SORTS.includes(sort) ? sort : DEFAULT_FILTERS.sort,
  };
}

export function filtersToQuery(f: BrowseFilters, lockedType?: EntryType) {
  const params = new URLSearchParams();
  if (!lockedType && f.types.length && f.types.length < ENTRY_TYPES.length) f.types.forEach((t) => params.append("type", t));
  f.statuses.forEach((s) => params.append("status", slug(s)));
  f.genres.forEach((g) => params.append("genre", slug(g)));
  if (f.yearFrom && f.yearFrom === f.yearTo) params.set("year", String(f.yearFrom));
  else {
    if (f.yearFrom) params.set("from", String(f.yearFrom));
    if (f.yearTo) params.set("to", String(f.yearTo));
  }
  if (f.minStars) params.set("rating", String(f.minStars));
  if (f.sort !== DEFAULT_FILTERS.sort) params.set("sort", f.sort);
  return params.toString();
}
