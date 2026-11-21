import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { eq, sql } from "drizzle-orm";
import { FakeSource, details, sourceTitle, startTestDb } from "@/tests/helpers";
import { airingSchedule, catalogSyncState, entries, titles, titleGenres, titleStudios, titleTags, users } from "@/lib/db";
import { runBackfill, runIncremental } from "./sync";
import { upsertTitles } from "./store";
import { copyImages, imageKey, type ImageStore } from "./images";

// The sync job against a fake provider and a real (in-memory) Postgres.

let t: Awaited<ReturnType<typeof startTestDb>>;
before(async () => { t = await startTestDb(); });
after(async () => { await t.stop(); });
beforeEach(async () => { await t.reset(); });

const NOW = new Date("2026-11-20T12:00:00Z");
const ctx = (source: FakeSource, images: ImageStore | null = null) => ({ source, images, now: () => NOW });

async function row(anilistId: number) {
  const [r] = await t.db.select().from(titles).where(eq(titles.anilistId, anilistId));
  return r;
}

// Only the named step does anything: the rest get nothing from the fake provider.
const onlySteps = { trendingPages: 1, refreshBatches: 0, extrasLimit: 0, imageLimit: 0 };

describe("upsertTitles", () => {
  it("stores a title with its genres, tags and studios, and updates it in place", async () => {
    await upsertTitles([sourceTitle(1, { genres: ["Action", "Drama"], synonyms: ["Pokémon Alt"] })]);
    let r = await row(1);
    assert.equal(r.title, "Title 1");
    assert.equal(r.startDate, 20200401);
    assert.match(r.searchText, /pokemon alt/);
    assert.deepEqual((await t.db.select().from(titleGenres)).map((g) => [g.genre, g.position]), [["Action", 0], ["Drama", 1]]);
    assert.equal((await t.db.select().from(titleTags)).length, 1);
    assert.equal((await t.db.select().from(titleStudios)).length, 1);

    await upsertTitles([sourceTitle(1, { title: "Renamed", genres: ["Drama"], averageScore: 90 })]);
    r = await row(1);
    assert.equal(r.title, "Renamed");
    assert.equal(r.averageScore, 90);
    assert.deepEqual((await t.db.select().from(titleGenres)).map((g) => g.genre), ["Drama"]);
    assert.equal((await t.db.select({ n: sql<number>`count(*)::int` }).from(titles))[0].n, 1);
  });

  it("keeps detail-only fields when a lighter record (a recommendation card) refreshes the title", async () => {
    await upsertTitles([sourceTitle(1, { description: "Long text", synonyms: ["Alias"] })]);
    const card = sourceTitle(1, { popularity: 9999 });
    for (const k of ["description", "synonyms", "tags", "studios", "duration", "meanScore", "favourites", "endDate", "sourceMaterial", "siteUrl"] as const) delete card[k];
    await upsertTitles([card]);
    const r = await row(1);
    assert.equal(r.popularity, 9999);
    assert.equal(r.description, "Long text");
    assert.deepEqual(r.synonyms, ["Alias"]);
    assert.match(r.searchText, /alias/);
    assert.equal((await t.db.select().from(titleTags)).length, 1, "tags untouched");
  });

  it("drops our image copy when the provider's image changes", async () => {
    await upsertTitles([sourceTitle(1)]);
    await t.db.update(titles).set({ cover: "https://img.otakuvault.app/catalog/x.webp" });
    await upsertTitles([sourceTitle(1)]);
    assert.equal((await row(1)).cover, "https://img.otakuvault.app/catalog/x.webp", "same source keeps the copy");
    await upsertTitles([sourceTitle(1, { coverUrl: "https://img.example/new.jpg" })]);
    assert.equal((await row(1)).cover, null);
  });
});

describe("runBackfill", () => {
  it("walks every title above the threshold across popularity windows, and resumes", async () => {
    const src = new FakeSource();
    // 7 anime with distinct popularity, plus one below the threshold and one manga.
    for (let i = 1; i <= 7; i++) src.add(sourceTitle(i, { popularity: 10_000 - i * 100 }));
    src.add(sourceTitle(50, { popularity: 10 }));
    src.add(sourceTitle(60, { kind: "MANGA", entryType: "manga", popularity: 4000 }));

    // pageDepth 2 with 2 per page: windows of 4, so 7 titles need a second window.
    const first = await runBackfill(ctx(src), { kinds: ["ANIME"], minPopularity: 1000, pageDepth: 2, maxPages: 2 });
    assert.equal(first.ANIME.done, false);
    const second = await runBackfill(ctx(src), { kinds: ["ANIME"], minPopularity: 1000, pageDepth: 2 });
    assert.equal(second.ANIME.done, true);

    const ids = (await t.db.select({ id: titles.anilistId }).from(titles)).map((r) => r.id).sort((a, b) => a! - b!);
    assert.deepEqual(ids, [1, 2, 3, 4, 5, 6, 7]);
    assert.ok(src.calls.includes("fetchPage:ANIME:9600:1"), "second window starts at the last popularity seen");
    const [state] = await t.db.select().from(catalogSyncState).where(eq(catalogSyncState.key, "backfill:ANIME:1000"));
    assert.equal(state.value.done, true);
  });

  it("leaves adult titles out", async () => {
    const src = new FakeSource().add(sourceTitle(1), sourceTitle(2, { isAdult: true }));
    await runBackfill(ctx(src), { kinds: ["ANIME"], minPopularity: 1 });
    assert.deepEqual((await t.db.select({ id: titles.anilistId }).from(titles)).map((r) => r.id), [1]);
  });
});

describe("runIncremental", () => {
  it("saves edited titles we have or that are popular enough, and advances the cursor", async () => {
    const src = new FakeSource();
    await upsertTitles([sourceTitle(1, { popularity: 50 })]); // obscure, but already in the catalog
    await t.db.insert(catalogSyncState).values({ key: "updated", value: { since: "2026-11-20T10:00:00.000Z" } });
    src.add(
      sourceTitle(1, { popularity: 60, title: "Edited", updatedAt: new Date("2026-11-20T11:00:00Z") }),
      sourceTitle(2, { popularity: 5000, updatedAt: new Date("2026-11-20T11:30:00Z") }),
      sourceTitle(3, { popularity: 20, updatedAt: new Date("2026-11-20T11:40:00Z") }), // obscure and new: skipped
      sourceTitle(4, { popularity: 5000, updatedAt: new Date("2026-11-20T09:00:00Z") }), // before the cursor
    );
    const report = await runIncremental(ctx(src), onlySteps);
    assert.ok(report.updated.ok, report.updated.detail);
    assert.equal((await row(1)).title, "Edited");
    assert.ok(await row(2));
    assert.equal(await row(3), undefined);
    assert.equal(await row(4), undefined);
    const [state] = await t.db.select().from(catalogSyncState).where(eq(catalogSyncState.key, "updated"));
    assert.equal(state.value.since, "2026-11-20T11:40:00.000Z");
  });

  it("stores the airing schedule and replaces the window", async () => {
    const src = new FakeSource();
    const show = sourceTitle(10, { status: "RELEASING", episodes: null });
    src.airing = [
      { anilistId: 10, episode: 5, airingAt: new Date("2026-11-20T09:00:00Z"), title: show },
      { anilistId: 10, episode: 6, airingAt: new Date("2026-11-27T09:00:00Z"), title: show },
    ];
    await runIncremental(ctx(src), onlySteps);
    assert.deepEqual((await t.db.select().from(airingSchedule)).map((a) => a.episode).sort(), [5, 6]);

    // Episode 6 postponed out of the window: it goes away; 5 stays.
    src.airing = src.airing.slice(0, 1);
    await runIncremental(ctx(src), onlySteps);
    assert.deepEqual((await t.db.select().from(airingSchedule)).map((a) => a.episode), [5]);
  });

  it("replaces trending scores", async () => {
    const src = new FakeSource();
    await upsertTitles([sourceTitle(1)], { trending: true });
    await t.db.update(titles).set({ trending: 50 });
    src.trending.set("anime", [sourceTitle(2, { trending: 90 })]);
    src.trending.set("webtoon", [sourceTitle(3, { kind: "MANGA", entryType: "webtoon", country: "KR", trending: 40 })]);
    await runIncremental(ctx(src), onlySteps);
    assert.equal((await row(1)).trending, 0, "no longer trending");
    assert.equal((await row(2)).trending, 90);
    assert.equal((await row(3)).trending, 40);
  });

  it("adds titles from people's collections that the catalog lacks", async () => {
    const src = new FakeSource().add(sourceTitle(77, { popularity: 5 }));
    await t.db.insert(users).values({ id: "u1", email: "a@example.com", displayName: "A" });
    await t.db.insert(entries).values({ userId: "u1", anilistId: 77, title: "Obscure", type: "anime", status: "watching" });
    const report = await runIncremental(ctx(src), onlySteps);
    assert.match(report.referenced.detail, /1 of 1 added/);
    assert.ok(await row(77));
  });

  it("fills missing extras, most popular first, within the limit", async () => {
    const src = new FakeSource().add(sourceTitle(1, { popularity: 100 }), sourceTitle(2, { popularity: 900 }));
    await upsertTitles([...src.titles.values()]);
    src.extras.set(2, details(src.titles.get(2)!, [sourceTitle(3, { popularity: 10 })]));
    await runIncremental(ctx(src), { ...onlySteps, extrasLimit: 1 });
    assert.ok((await row(2)).extras, "most popular first");
    assert.equal((await row(1)).extras, null);
    assert.ok(await row(3), "recommended titles join the catalog");
  });

  it("keeps going when a step fails", async () => {
    const src = new FakeSource();
    src.fetchAiring = async () => { throw new Error("boom"); };
    const report = await runIncremental(ctx(src), onlySteps);
    assert.equal(report.airing.ok, false);
    assert.equal(report.trending.ok, true);
  });
});

describe("copyImages", () => {
  it("copies covers to the store, re-encoded, and records our URL", async () => {
    await upsertTitles([sourceTitle(1, { bannerUrl: "https://img.example/banner/1.jpg" }), sourceTitle(2, { coverUrl: "https://img.example/gone.jpg" })]);
    const put: string[] = [];
    const store: ImageStore = { async put(key, body, type) { put.push(`${key} ${type} ${body.length > 0}`); return `https://img.test/${key}`; } };
    // A real 1x1 PNG, so sharp has something to encode.
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
    const fetchImage = (async (url: string) => (url.includes("gone") ? new Response("", { status: 404 }) : new Response(png))) as typeof fetch;

    const r = await copyImages(store, 10, { fetchImage });
    assert.deepEqual(r, { copied: 2, gone: 1, failed: 0 });
    const one = await row(1);
    assert.equal(one.cover, `https://img.test/${imageKey(1, "cover", "https://img.example/cover/1.jpg")}`);
    assert.match(one.banner!, /catalog\/anilist\/1\/banner-[0-9a-f]{12}\.webp$/);
    assert.ok(put.every((p) => p.includes("image/webp true")));
    const two = await row(2);
    assert.equal(two.cover, null);
    assert.equal(two.coverSource, null, "a cover the provider lost isn't retried every run");

    assert.deepEqual(await copyImages(store, 10, { fetchImage }), { copied: 0, gone: 0, failed: 0 }, "nothing left to copy");
  });
});
