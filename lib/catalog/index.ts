import { cache } from "react";
import type { EntryType } from "@/lib/types";
import type { BrowseFilters, DetailsResult, Season, Title, TitlePage } from "@/lib/anilist-shared";
import * as live from "./live";
import * as reads from "./reads";

// The title catalog, as pages see it. Two interchangeable backends, picked per call by the
// CATALOG_SOURCE variable:
//
//   anilist (default)  lib/catalog/live.ts: straight from AniList (through the relay on
//                      Cloudflare), cached at the edge, no Postgres at all.
//   db                 lib/catalog/reads.ts: our own catalog tables, filled by the sync job
//                      (lib/catalog/sync.ts), with AniList only for catalog misses.
//
// See docs/catalog.md, "Source switch".

export type CatalogMode = "anilist" | "db";

export function catalogMode(): CatalogMode {
  return process.env.CATALOG_SOURCE?.trim().toLowerCase() === "db" ? "db" : "anilist";
}

const fromDb = () => catalogMode() === "db";

export type { AiringStatus } from "./reads";
// Tests swap the db mode's provider for a fake one.
export { setCatalogSource } from "./reads";

export function getSeasonalLineup(year: number, season: Season): Promise<TitlePage> {
  return fromDb() ? reads.getSeasonalLineup(year, season) : live.getSeasonalLineup(year, season);
}

export function getSeasonalPage(year: number, season: Season, page: number): Promise<TitlePage> {
  return fromDb() ? reads.getSeasonalPage(year, season, page) : live.getSeasonalPage(year, season, page);
}

export function getTrendingNow(type?: EntryType): Promise<TitlePage> {
  return fromDb() ? reads.getTrendingNow(type) : live.getTrendingNow(type);
}

export function getTrendingPage(type: EntryType | undefined, page: number): Promise<TitlePage> {
  return fromDb() ? reads.getTrendingPage(type, page) : live.getTrendingPage(type, page);
}

export function browseTitles(filters?: BrowseFilters, page = 1): Promise<TitlePage> {
  return fromDb() ? reads.browseTitles(filters, page) : live.browseTitles(filters, page);
}

export function getTypeCounts(): Promise<number[] | null> {
  return fromDb() ? reads.getTypeCounts() : live.getTypeCounts();
}

export function searchTitles(query: string, type?: EntryType): Promise<TitlePage> {
  return fromDb() ? reads.searchTitles(query, type) : live.searchTitles(query, type);
}

export function getCachedTitle(anilistId: number): Promise<Title | null> {
  return fromDb() ? reads.getCachedTitle(anilistId) : live.getCachedTitle(anilistId);
}

export function getTitleById(anilistId: number): Promise<Title> {
  return fromDb() ? reads.getTitleById(anilistId) : live.getTitleById(anilistId);
}

// Wrapped in cache() so metadata and the page share one lookup.
export const getTitleDetails = cache((anilistId: number, type: EntryType): Promise<DetailsResult> =>
  fromDb() ? reads.getTitleDetails(anilistId, type) : live.getTitleDetails(anilistId, type));

export function getRecommendations(sourceIds: number[]): Promise<Title[]> {
  return fromDb() ? reads.getRecommendations(sourceIds) : live.getRecommendations(sourceIds);
}

// For the new-episodes job. The db mode reads the catalog's airing schedule; the anilist mode
// asks AniList for the shows' current state.
export function getAiringStatus(anilistIds: number[], now = new Date()): Promise<Map<number, reads.AiringStatus>> {
  return fromDb() ? reads.getAiringStatus(anilistIds, now) : live.getAiringStatus(anilistIds);
}
