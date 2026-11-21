import { and, eq, gte, inArray, isNotNull, lt, sql } from "drizzle-orm";
import {
  airingSchedule, db, genres, studios, tags, titleGenres, titles, titleStudios, titleTags,
} from "@/lib/db";
import type { FuzzyDate, Title } from "@/lib/anilist-shared";
import type { AiringEpisode, SourceDetails, SourceTitle } from "./source";
import { searchTextOf } from "./search";

// Writes provider records into the catalog tables and maps rows back to the shapes pages use.
// Shared by the sync job (Node) and the request-time miss path (Worker).

const BATCH = 100;

export const fuzzyInt = (d: FuzzyDate | null | undefined) => (d?.year ? d.year * 10_000 + (d.month ?? 0) * 100 + (d.day ?? 0) : null);
export const fromFuzzyInt = (n: number | null): FuzzyDate | null =>
  n ? { year: Math.floor(n / 10_000), month: Math.floor(n / 100) % 100 || null, day: n % 100 || null } : null;

const chunks = <T>(items: T[], size: number) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) => items.slice(i * size, (i + 1) * size));

type Opts = { trending?: boolean; now?: Date };

// Upserts titles (plus genres, and tags and studios when the records carry them) and returns
// catalog ids by AniList id. Records without description etc. (recommendation cards, see
// SourceTitle) leave those columns as stored. A changed provider image clears our copy so the
// sync copies the new one.
export async function upsertTitles(items: SourceTitle[], opts: Opts = {}): Promise<Map<number, string>> {
  const ids = new Map<number, string>();
  const unique = [...new Map(items.map((t) => [t.ids.anilist, t])).values()];
  for (const batch of chunks(unique, BATCH)) {
    const full = batch.filter((t) => t.description !== undefined);
    const partial = batch.filter((t) => t.description === undefined);
    for (const [group, isFull] of [[full, true], [partial, false]] as const) {
      if (!group.length) continue;
      const rows = await db.insert(titles).values(group.map((t) => rowOf(t, opts)))
        .onConflictDoUpdate({ target: titles.anilistId, set: setOf(isFull, !!opts.trending) })
        .returning({ id: titles.id, anilistId: titles.anilistId });
      for (const r of rows) ids.set(r.anilistId!, r.id);
    }
    await saveGenres(batch, ids);
    await saveTags(full, ids);
    await saveStudios(full, ids);
  }
  return ids;
}

function rowOf(t: SourceTitle, opts: Opts): typeof titles.$inferInsert {
  return {
    anilistId: t.ids.anilist,
    malId: t.ids.mal,
    kind: t.kind,
    entryType: t.entryType,
    title: t.title,
    romaji: t.romaji,
    english: t.english,
    native: t.native,
    synonyms: t.synonyms ?? [],
    format: t.format,
    status: t.status,
    country: t.country,
    isAdult: t.isAdult,
    episodes: t.episodes,
    airedEpisodes: t.airedEpisodes,
    chapters: t.chapters,
    volumes: t.volumes,
    duration: t.duration ?? null,
    averageScore: t.averageScore,
    meanScore: t.meanScore ?? null,
    popularity: t.popularity,
    trending: opts.trending ? t.trending ?? 0 : 0,
    favourites: t.favourites ?? null,
    season: t.season,
    seasonYear: t.seasonYear,
    startDate: fuzzyInt(t.startDate),
    endDate: fuzzyInt(t.endDate),
    description: t.description ?? null,
    sourceMaterial: t.sourceMaterial ?? null,
    siteUrl: t.siteUrl ?? null,
    color: t.color,
    coverSource: t.coverUrl,
    thumbSource: t.thumbUrl,
    bannerSource: t.bannerUrl,
    sourceUpdatedAt: t.updatedAt,
    syncedAt: opts.now ?? new Date(),
    searchText: searchTextOf([t.title, t.romaji, t.english, t.native, ...(t.synonyms ?? [])]),
  };
}

const excluded = (col: string) => sql.raw(`excluded."${col}"`);

function setOf(full: boolean, trending: boolean) {
  const set: Record<string, unknown> = {
    malId: sql`coalesce(${excluded("mal_id")}, ${titles.malId})`,
    kind: excluded("kind"),
    entryType: excluded("entry_type"),
    title: excluded("title"),
    romaji: excluded("romaji"),
    english: excluded("english"),
    native: excluded("native"),
    format: excluded("format"),
    status: excluded("status"),
    country: excluded("country"),
    isAdult: excluded("is_adult"),
    episodes: excluded("episodes"),
    airedEpisodes: excluded("aired_episodes"),
    chapters: excluded("chapters"),
    volumes: excluded("volumes"),
    averageScore: excluded("average_score"),
    popularity: excluded("popularity"),
    season: excluded("season"),
    seasonYear: excluded("season_year"),
    startDate: excluded("start_date"),
    color: excluded("color"),
    coverSource: excluded("cover_source"),
    thumbSource: excluded("thumb_source"),
    bannerSource: excluded("banner_source"),
    cover: sql`case when ${excluded("cover_source")} is distinct from ${titles.coverSource} then null else ${titles.cover} end`,
    banner: sql`case when ${excluded("banner_source")} is distinct from ${titles.bannerSource} then null else ${titles.banner} end`,
    sourceUpdatedAt: excluded("source_updated_at"),
    syncedAt: excluded("synced_at"),
    updatedAt: sql`now()`,
  };
  if (full) {
    Object.assign(set, {
      synonyms: excluded("synonyms"),
      duration: excluded("duration"),
      meanScore: excluded("mean_score"),
      favourites: excluded("favourites"),
      endDate: excluded("end_date"),
      description: excluded("description"),
      sourceMaterial: excluded("source_material"),
      siteUrl: excluded("site_url"),
      searchText: excluded("search_text"),
    });
  } else {
    // Without synonyms, keep the stored search text unless the title row is new to it.
    set.searchText = sql`case when ${titles.synonyms} = '{}' then ${excluded("search_text")} else ${titles.searchText} end`;
  }
  if (trending) set.trending = excluded("trending");
  return set;
}

async function saveGenres(items: SourceTitle[], ids: Map<number, string>) {
  const names = [...new Set(items.flatMap((t) => t.genres))];
  if (names.length) await db.insert(genres).values(names.map((name) => ({ name }))).onConflictDoNothing();
  const titleIds = items.flatMap((t) => (ids.has(t.ids.anilist) ? [ids.get(t.ids.anilist)!] : []));
  if (!titleIds.length) return;
  await db.delete(titleGenres).where(inArray(titleGenres.titleId, titleIds));
  const rows = items.flatMap((t) => [...new Set(t.genres)].map((genre, position) => ({ titleId: ids.get(t.ids.anilist)!, genre, position })));
  if (rows.length) await db.insert(titleGenres).values(rows).onConflictDoNothing();
}

async function saveTags(items: SourceTitle[], ids: Map<number, string>) {
  const all = items.flatMap((t) => t.tags ?? []);
  const byName = new Map(all.map((x) => [x.name, x]));
  if (byName.size) {
    await db.insert(tags).values([...byName.values()].map((x) => ({ name: x.name, category: x.category, isAdult: x.isAdult })))
      .onConflictDoUpdate({ target: tags.name, set: { category: excluded("category"), isAdult: excluded("is_adult") } });
  }
  const titleIds = items.map((t) => ids.get(t.ids.anilist)!).filter(Boolean);
  if (!titleIds.length) return;
  await db.delete(titleTags).where(inArray(titleTags.titleId, titleIds));
  const rows = items.flatMap((t) => [...new Map((t.tags ?? []).map((x) => [x.name, x])).values()]
    .map((x) => ({ titleId: ids.get(t.ids.anilist)!, tag: x.name, rank: x.rank, isSpoiler: x.isSpoiler })));
  if (rows.length) await db.insert(titleTags).values(rows).onConflictDoNothing();
}

async function saveStudios(items: SourceTitle[], ids: Map<number, string>) {
  const all = new Map(items.flatMap((t) => t.studios ?? []).map((s) => [s.sourceId, s]));
  const studioIds = new Map<number, string>();
  if (all.size) {
    const rows = await db.insert(studios)
      .values([...all.values()].map((s) => ({ anilistId: s.sourceId, name: s.name, isAnimationStudio: s.isAnimationStudio })))
      .onConflictDoUpdate({ target: studios.anilistId, set: { name: excluded("name"), isAnimationStudio: excluded("is_animation_studio") } })
      .returning({ id: studios.id, anilistId: studios.anilistId });
    for (const r of rows) studioIds.set(r.anilistId!, r.id);
  }
  const titleIds = items.map((t) => ids.get(t.ids.anilist)!).filter(Boolean);
  if (!titleIds.length) return;
  await db.delete(titleStudios).where(inArray(titleStudios.titleId, titleIds));
  const rows = items.flatMap((t) => {
    // A studio credited twice (animation and production) keeps its main credit.
    const seen = new Map<number, { isMain: boolean; position: number }>();
    (t.studios ?? []).forEach((s, position) => {
      const prev = seen.get(s.sourceId);
      seen.set(s.sourceId, { isMain: (prev?.isMain ?? false) || s.isMain, position: prev?.position ?? position });
    });
    return [...seen].map(([sourceId, v]) => ({ titleId: ids.get(t.ids.anilist)!, studioId: studioIds.get(sourceId)!, ...v }));
  });
  if (rows.length) await db.insert(titleStudios).values(rows).onConflictDoNothing();
}

// Stores a title together with its extras, and the titles the extras recommend.
export async function saveDetails(d: SourceDetails, now = new Date()) {
  await upsertTitles(d.related, { now });
  const ids = await upsertTitles([d.title], { now });
  await db.update(titles)
    .set({ extras: d.extras, extrasFetchedAt: now, popularityRank: d.popularityRank })
    .where(eq(titles.id, ids.get(d.title.ids.anilist)!));
}

// Replaces the trending scores: titles in `items` get theirs, everything else drops to 0.
export async function saveTrending(items: SourceTitle[], now = new Date()) {
  const ids = await upsertTitles(items, { now, trending: true });
  const keep = [...ids.values()];
  await db.update(titles).set({ trending: 0 })
    .where(and(sql`${titles.trending} > 0`, keep.length ? sql`${titles.id} <> all(${sql.param(keep)}::text[])` : undefined));
}

// Upserts airing episodes in [from, to), replacing what was stored for that window.
export async function saveAiring(episodes: AiringEpisode[], from: Date, to: Date, now = new Date()) {
  const ids = await upsertTitles(episodes.map((e) => e.title), { now });
  const rows = [...new Map(episodes.map((e) => [`${e.anilistId}:${e.episode}`, e])).values()]
    .flatMap((e) => (ids.has(e.anilistId) ? [{ titleId: ids.get(e.anilistId)!, episode: e.episode, airingAt: e.airingAt }] : []));
  await db.transaction(async (tx) => {
    await tx.delete(airingSchedule).where(and(gte(airingSchedule.airingAt, from), lt(airingSchedule.airingAt, to)));
    for (const batch of chunks(rows, 500)) {
      await tx.insert(airingSchedule).values(batch)
        .onConflictDoUpdate({ target: [airingSchedule.titleId, airingSchedule.episode], set: { airingAt: excluded("airing_at") } });
    }
    // Old episodes only matter for "latest aired"; a month of history is plenty.
    await tx.delete(airingSchedule).where(lt(airingSchedule.airingAt, new Date(now.getTime() - 30 * 86_400_000)));
  });
  return rows.length;
}

/* ---------- Reading ---------- */

export const genresSql = sql<string[]>`coalesce((select array_agg(tg.genre order by tg.position) from ${titleGenres} tg where tg.title_id = ${titles.id}), '{}')`;

// Columns for a Title card.
export const cardColumns = {
  id: titles.id,
  anilistId: titles.anilistId,
  kind: titles.kind,
  entryType: titles.entryType,
  title: titles.title,
  romaji: titles.romaji,
  native: titles.native,
  format: titles.format,
  status: titles.status,
  episodes: titles.episodes,
  airedEpisodes: titles.airedEpisodes,
  chapters: titles.chapters,
  volumes: titles.volumes,
  averageScore: titles.averageScore,
  popularity: titles.popularity,
  color: titles.color,
  season: titles.season,
  seasonYear: titles.seasonYear,
  startDate: titles.startDate,
  cover: titles.cover,
  coverSource: titles.coverSource,
  thumbSource: titles.thumbSource,
  banner: titles.banner,
  bannerSource: titles.bannerSource,
  genres: genresSql,
};

export type CardRow = { [K in keyof typeof cardColumns]: K extends "genres" ? string[] : (typeof titles.$inferSelect)[K & keyof typeof titles.$inferSelect] };

export function toTitle(r: CardRow): Title {
  return {
    anilistId: r.anilistId!,
    kind: r.kind as Title["kind"],
    entryType: r.entryType,
    title: r.title,
    romaji: r.romaji,
    native: r.native,
    format: r.format,
    status: r.status,
    episodes: r.episodes,
    airedEpisodes: r.airedEpisodes,
    chapters: r.chapters,
    volumes: r.volumes,
    score: r.averageScore,
    popularity: r.popularity,
    genres: r.genres ?? [],
    // Our R2 copy once the sync has made it, the provider's image until then.
    cover: r.cover ?? r.coverSource,
    thumb: r.cover ?? r.thumbSource,
    banner: r.banner ?? r.bannerSource,
    color: r.color,
    season: r.season as Title["season"],
    seasonYear: r.seasonYear,
    startYear: r.startDate ? Math.floor(r.startDate / 10_000) : null,
  };
}

// Cards for these AniList ids, keyed by id. Adult titles are left out.
export async function cardsByAnilistId(anilistIds: number[]): Promise<Map<number, Title>> {
  const unique = [...new Set(anilistIds)];
  if (!unique.length) return new Map();
  const rows = await db.select(cardColumns).from(titles)
    .where(and(inArray(titles.anilistId, unique), eq(titles.isAdult, false)));
  return new Map(rows.map((r) => [r.anilistId!, toTitle(r as CardRow)]));
}

export const visible = and(isNotNull(titles.anilistId), eq(titles.isAdult, false));
export const byPopularity = [sql`${titles.popularity} desc nulls last`, titles.anilistId] as const;
