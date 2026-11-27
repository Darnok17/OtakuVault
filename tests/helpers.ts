import { createServer } from "node:net";
import { PGlite } from "@electric-sql/pglite";
import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import type { EntryType } from "@/lib/types";
import { SourceError, type AiringEpisode, type CatalogSource, type SourceDetails, type SourcePage, type SourceTitle } from "@/lib/catalog/source";
import { DETAILS_VERSION } from "@/lib/anilist-shared";

// Test harness: an in-memory Postgres (PGlite, with pg_trgm) behind a socket, so the app's real
// `pg` + drizzle code runs against it unchanged, with every migration in ./drizzle applied.

const freePort = () =>
  new Promise<number>((resolve, reject) => {
    const srv = createServer();
    srv.listen(0, "127.0.0.1", () => {
      const { port } = srv.address() as { port: number };
      srv.close(() => resolve(port));
    });
    srv.on("error", reject);
  });

export async function startTestDb() {
  // These tests cover the catalog's db mode (lib/catalog/reads.ts).
  (process.env as Record<string, string>).CATALOG_SOURCE = "db";
  const pg = await PGlite.create({ extensions: { pg_trgm } });
  const port = await freePort();
  const server = new PGLiteSocketServer({ db: pg, port, host: "127.0.0.1", maxConnections: 20 });
  await server.start();
  process.env.DATABASE_URL = `postgres://postgres:postgres@127.0.0.1:${port}/postgres`;

  const { db } = await import("@/lib/db");
  const { migrate } = await import("drizzle-orm/node-postgres/migrator");
  await migrate(db, { migrationsFolder: "./drizzle" });

  return {
    db,
    async reset() {
      await db.execute(`truncate titles, genres, tags, studios, catalog_sync_state, catalog_lookups, users, airing_watermarks cascade`);
    },
    async stop() {
      await db.$client.end();
      await server.stop();
      await pg.close();
    },
  };
}

/* ---------- A fake catalog source ---------- */

export function sourceTitle(id: number, over: Partial<SourceTitle> = {}): SourceTitle {
  const title = over.title ?? `Title ${id}`;
  return {
    ids: { anilist: id, mal: id + 100_000 },
    kind: "ANIME",
    entryType: "anime",
    title,
    romaji: over.romaji ?? title,
    english: title,
    native: null,
    synonyms: [],
    format: "TV",
    status: "FINISHED",
    country: "JP",
    isAdult: false,
    episodes: 12,
    airedEpisodes: null,
    nextAiring: null,
    chapters: null,
    volumes: null,
    duration: 24,
    averageScore: 70,
    meanScore: 71,
    popularity: 5000,
    trending: 0,
    favourites: 100,
    season: "SPRING",
    seasonYear: 2020,
    startDate: { year: 2020, month: 4, day: 1 },
    endDate: { year: 2020, month: 6, day: 30 },
    description: `About ${title}`,
    sourceMaterial: "MANGA",
    siteUrl: `https://anilist.co/anime/${id}`,
    color: "#ffffff",
    coverUrl: `https://img.example/cover/${id}.jpg`,
    thumbUrl: `https://img.example/thumb/${id}.jpg`,
    bannerUrl: null,
    genres: ["Action"],
    tags: [{ name: "Shounen", category: "Demographic", rank: 80, isSpoiler: false, isAdult: false }],
    studios: [{ sourceId: 1, name: "Studio One", isMain: true, isAnimationStudio: true }],
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...over,
  };
}

export function details(t: SourceTitle, related: SourceTitle[] = []): SourceDetails {
  return {
    title: t,
    popularityRank: 10,
    related,
    extras: {
      v: DETAILS_VERSION,
      staff: [{ id: 1, name: "A Director", role: "Director", image: null }],
      characters: [{ id: 2, name: "A Hero", role: "MAIN", image: null, voiceActors: [] }],
      relations: [],
      recommendations: related.map((r) => ({
        anilistId: r.ids.anilist, kind: r.kind, entryType: r.entryType, title: r.title, romaji: r.romaji, native: r.native,
        format: r.format, status: r.status, episodes: r.episodes, chapters: r.chapters, volumes: r.volumes,
        score: r.averageScore, popularity: r.popularity, genres: r.genres, cover: r.coverUrl, banner: r.bannerUrl,
        color: r.color, season: r.season, seasonYear: r.seasonYear, startYear: r.startDate?.year ?? null,
      })),
      streamingEpisodes: [],
      externalLinks: [],
      trailer: null,
    },
  };
}

// An in-memory provider. Every method call is recorded in `calls`; `down` makes them all fail.
export class FakeSource implements CatalogSource {
  readonly name = "fake";
  titles = new Map<number, SourceTitle>();
  extras = new Map<number, SourceDetails>();
  airing: AiringEpisode[] = [];
  trending = new Map<EntryType, SourceTitle[]>();
  calls: string[] = [];
  down = false;

  add(...ts: SourceTitle[]) {
    for (const t of ts) this.titles.set(t.ids.anilist, t);
    return this;
  }

  private hit(call: string) {
    this.calls.push(call);
    if (this.down) throw new SourceError("provider down");
  }

  async fetchById(ids: number[]) {
    this.hit(`fetchById:${ids.join(",")}`);
    return ids.flatMap((id) => (this.titles.has(id) ? [this.titles.get(id)!] : []));
  }

  async fetchDetails(id: number) {
    this.hit(`fetchDetails:${id}`);
    if (this.extras.has(id)) return this.extras.get(id)!;
    return this.titles.has(id) ? details(this.titles.get(id)!) : null;
  }

  async *fetchUpdatedSince(since: Date, maxPages: number) {
    this.hit(`fetchUpdatedSince:${since.toISOString()}`);
    const all = [...this.titles.values()].filter((t) => t.updatedAt && t.updatedAt > since)
      .sort((a, b) => b.updatedAt!.getTime() - a.updatedAt!.getTime());
    for (let p = 0; p < maxPages && p * 50 < all.length; p++) yield all.slice(p * 50, p * 50 + 50);
  }

  async fetchAiring(from: Date, to: Date) {
    this.hit("fetchAiring");
    return this.airing.filter((e) => e.airingAt >= from && e.airingAt < to);
  }

  async search(query: string) {
    this.hit(`search:${query}`);
    const q = query.toLowerCase();
    return [...this.titles.values()].filter((t) => t.title.toLowerCase().includes(q));
  }

  async fetchPage({ kind, minPopularity, maxPopularity, page }: { kind: string; minPopularity: number; maxPopularity: number | null; page: number }): Promise<SourcePage> {
    this.hit(`fetchPage:${kind}:${maxPopularity}:${page}`);
    const all = [...this.titles.values()]
      .filter((t) => t.kind === kind && (t.popularity ?? 0) >= minPopularity && (maxPopularity === null || (t.popularity ?? 0) <= maxPopularity))
      .sort((a, b) => (b.popularity ?? 0) - (a.popularity ?? 0) || a.ids.anilist - b.ids.anilist);
    // Pages of 2 here so tests can exercise windowing without thousands of titles.
    return { items: all.slice((page - 1) * 2, page * 2), hasNext: page * 2 < all.length };
  }

  async fetchTrending(type: EntryType, page: number) {
    this.hit(`fetchTrending:${type}:${page}`);
    return { items: page === 1 ? this.trending.get(type) ?? [] : [], hasNext: false };
  }

  async fetchSeason(year: number, season: string, page: number) {
    this.hit(`fetchSeason:${year}:${season}:${page}`);
    return { items: [...this.titles.values()].filter((t) => t.seasonYear === year && t.season === season), hasNext: false };
  }
}
