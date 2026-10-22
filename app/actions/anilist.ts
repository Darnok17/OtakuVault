"use server";

import { headers } from "next/headers";
import { and, desc, eq, gt, inArray, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db, entries } from "@/lib/db";
import {
  browseTitles, getRecommendations, getSeasonalLineup, getTitleById, getTrendingNow, getTypeCounts, searchTitles,
} from "@/lib/anilist";
import {
  DEFAULT_FILTERS, ENTRY_TYPES, lengthFor,
  type AddResult, type BrowseFilters, type BrowseSort, type BrowseStatus, type Season, type Title, type TitlePage,
} from "@/lib/anilist-shared";
import type { EntryType } from "@/lib/types";
import { addEntryAction } from "./entries";

// Thin, validated wrappers over lib/anilist. Every export here is a public endpoint, and each
// call can trigger an upstream AniList request, so inputs are checked before anything runs.

const SEASONS = new Set<string>(["WINTER", "SPRING", "SUMMER", "FALL"]);
const STATUSES = new Set<string>(["RELEASING", "FINISHED", "NOT_YET_RELEASED", "HIATUS"]);
const SORTS = new Set<string>(["popularity", "rating-desc", "rating-asc", "newest", "oldest"]);
const GENRES = new Set([
  "Action", "Adventure", "Comedy", "Drama", "Fantasy", "Horror", "Isekai", "Mecha", "Mystery", "Romance",
  "Sci-Fi", "Seinen", "Shonen", "Slice of Life", "Sports", "Supernatural", "Thriller",
]);

const isEntryType = (v: unknown): v is EntryType => ENTRY_TYPES.includes(v as EntryType);

function posInt(v: unknown, field: string, max: number) {
  if (!Number.isInteger(v) || (v as number) < 1 || (v as number) > max) throw new Error(`Invalid ${field}`);
  return v as number;
}

function year(v: unknown) {
  return v == null ? null : posInt(v, "year", 2100);
}

function list<T extends string>(v: unknown, allowed: Set<string>, field: string): T[] {
  if (!Array.isArray(v) || v.length > allowed.size || v.some((x) => !allowed.has(x))) throw new Error(`Invalid ${field}`);
  return [...new Set(v as T[])];
}

async function sessionUserId() {
  return (await auth.api.getSession({ headers: await headers() }))?.user.id ?? null;
}

/* ---------- Catalog ---------- */

export async function searchTitlesAction(query: string, type?: EntryType): Promise<TitlePage> {
  if (typeof query !== "string" || query.trim().length < 2 || query.length > 100) throw new Error("Invalid query");
  if (type !== undefined && !isEntryType(type)) throw new Error("Invalid type");
  return searchTitles(query, type);
}

export async function getSeasonalLineupAction(y: number, season: Season): Promise<TitlePage> {
  if (!SEASONS.has(season)) throw new Error("Invalid season");
  return getSeasonalLineup(posInt(y, "year", 2100), season);
}

export async function getTrendingNowAction(): Promise<TitlePage> {
  return getTrendingNow();
}

export async function getTitleByIdAction(anilistId: number): Promise<Title> {
  return getTitleById(posInt(anilistId, "anilistId", 10_000_000));
}

export async function browseTitlesAction(filters: BrowseFilters, page = 1): Promise<TitlePage> {
  const f = filters ?? DEFAULT_FILTERS;
  if (!SORTS.has(f.sort)) throw new Error("Invalid sort");
  if (!Number.isInteger(f.minStars) || f.minStars < 0 || f.minStars > 5) throw new Error("Invalid minStars");
  return browseTitles({
    types: list<EntryType>(f.types, new Set(ENTRY_TYPES), "types"),
    statuses: list<BrowseStatus>(f.statuses, STATUSES, "statuses"),
    genres: list(f.genres, GENRES, "genres"),
    yearFrom: year(f.yearFrom),
    yearTo: year(f.yearTo),
    minStars: f.minStars,
    sort: f.sort as BrowseSort,
  }, posInt(page, "page", 200));
}

export async function getTypeCountsAction(): Promise<number[] | null> {
  return getTypeCounts();
}

/* ---------- Personal ---------- */

export type Recommendations =
  | { status: "signin" }
  | { status: "empty" } // signed in, but nothing rated yet
  | { status: "ok"; basis: string[]; items: Title[] };

// The user's top 3 rated entries → AniList recommendations for each → de-duped, minus
// anything already in the collection, 12 shown.
export async function getRecommendationsAction(): Promise<Recommendations> {
  const userId = await sessionUserId();
  if (!userId) return { status: "signin" };

  const top = await db.select({ title: entries.title, type: entries.type }).from(entries)
    .where(and(eq(entries.userId, userId), gt(entries.rating, 0)))
    .orderBy(desc(entries.rating), desc(entries.createdAt))
    .limit(3);
  if (!top.length) return { status: "empty" };

  // Entries are free text, so match each to its best AniList search hit (cached like any search).
  const lookups = await Promise.allSettled(top.map((e) => searchTitles(e.title, e.type)));
  const sources = lookups.flatMap((r) => (r.status === "fulfilled" && r.value.items[0] ? [r.value.items[0]] : []));
  if (!sources.length) {
    // Every lookup failing means AniList trouble, not an empty collection.
    if (lookups.every((r) => r.status === "rejected")) throw (lookups[0] as PromiseRejectedResult).reason;
    return { status: "empty" };
  }

  const owned = new Set((await db.select({ title: entries.title }).from(entries).where(eq(entries.userId, userId)))
    .map((e) => e.title.toLowerCase()));
  const items = (await getRecommendations(sources.map((t) => t.anilistId)))
    .filter((t) => !owned.has(t.title.toLowerCase()) && !owned.has(t.romaji.toLowerCase()))
    .slice(0, 12);
  return { status: "ok", basis: top.map((e) => e.title), items };
}

// "Add to Collection" on a poster. Title data comes from our cache/AniList, never from the client.
export async function addTitleToCollectionAction(anilistId: number): Promise<AddResult> {
  const userId = await sessionUserId();
  if (!userId) return { status: "signin" };

  const t = await getTitleById(posInt(anilistId, "anilistId", 10_000_000));
  const names = [...new Set([t.title, t.romaji].map((n) => n.toLowerCase()))];
  const [dupe] = await db.select({ id: entries.id }).from(entries)
    .where(and(eq(entries.userId, userId), inArray(sql`lower(${entries.title})`, names)))
    .limit(1);
  if (dupe) return { status: "exists" };

  const length = lengthFor(t);
  const entry = await addEntryAction({
    title: t.title.slice(0, 300),
    type: t.entryType,
    status: "plan-to",
    genre: t.genres.slice(0, 3).join(", "),
    totalEps: length.label,
    notes: "",
    rating: 0,
    imageUrl: t.cover ?? "",
    progressCurrent: 0,
    progressTotal: length.total,
  });
  return { status: "added", entry };
}
