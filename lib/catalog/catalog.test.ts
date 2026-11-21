import { after, before, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { eq } from "drizzle-orm";
import { FakeSource, details, sourceTitle, startTestDb } from "@/tests/helpers";
import { airingSchedule, airingWatermarks, entries, titles, users } from "@/lib/db";
import { DEFAULT_FILTERS } from "@/lib/anilist-shared";
import {
  browseTitles, getAiringStatus, getCachedTitle, getRecommendations, getSeasonalLineup, getTitleById, getTitleDetails,
  getTrendingNow, getTypeCounts, searchTitles, setCatalogSource,
} from "./index";
import { saveDetails, upsertTitles } from "./store";
import { runNewEpisodesJob } from "@/lib/jobs/new-episodes";

// What pages get from the catalog, and when (only then) the provider is asked.

let t: Awaited<ReturnType<typeof startTestDb>>;
let src: FakeSource;
before(async () => { t = await startTestDb(); });
after(async () => { await t.stop(); });
beforeEach(async () => {
  await t.reset();
  src = new FakeSource();
  setCatalogSource(src);
});

const seed = () => upsertTitles([
  sourceTitle(1, { title: "Frieren: Beyond Journey's End", romaji: "Sousou no Frieren", popularity: 9000, averageScore: 91, genres: ["Adventure", "Drama", "Fantasy"], season: "FALL", seasonYear: 2023, startDate: { year: 2023, month: 9, day: 29 } }),
  sourceTitle(2, { title: "Pokémon", popularity: 8000, averageScore: 75, genres: ["Adventure", "Comedy"], startDate: { year: 1997, month: 4, day: 1 } }),
  sourceTitle(3, { title: "Solo Leveling", kind: "MANGA", entryType: "webtoon", country: "KR", popularity: 7000, averageScore: 85, genres: ["Action", "Fantasy"], startDate: { year: 2018, month: 3, day: 4 } }),
  sourceTitle(4, { title: "Unscored Thing", popularity: 100, averageScore: null, genres: ["Drama"], tags: [], startDate: { year: 2010, month: 1, day: 1 } }),
  sourceTitle(5, { title: "Adult Title", isAdult: true, popularity: 99_999 }),
]);

describe("search", () => {
  it("matches titles, romaji and synonyms, accent-insensitive, best match first, without the provider", async () => {
    await seed();
    assert.deepEqual((await searchTitles("frieren")).items.map((x) => x.anilistId), [1]);
    assert.deepEqual((await searchTitles("sousou no")).items.map((x) => x.anilistId), [1]);
    assert.deepEqual((await searchTitles("pokemon")).items.map((x) => x.anilistId), [2]);
    assert.deepEqual((await searchTitles("POKÉMON")).items.map((x) => x.anilistId), [2]);
    assert.deepEqual(src.calls, []);
    // Nothing among the anime: that counts as a miss, so the provider is asked (once).
    assert.deepEqual((await searchTitles("solo", "anime")).items, [], "type filter");
    assert.deepEqual(src.calls, ["search:solo"]);
  });

  it("tolerates typos", async () => {
    await seed();
    assert.equal((await searchTitles("frieran")).items[0]?.anilistId, 1);
  });

  it("never returns adult titles", async () => {
    await seed();
    assert.deepEqual((await searchTitles("adult title")).items, []);
  });

  it("asks the provider once when the catalog has nothing, saves the result, and serves it", async () => {
    await seed();
    src.add(sourceTitle(42, { title: "Dandadan", popularity: 300 }));
    assert.deepEqual((await searchTitles("dandadan")).items.map((x) => x.anilistId), [42]);
    assert.ok(await getCachedTitle(42), "saved to the catalog");
    await searchTitles("nothing like this");
    await searchTitles("nothing like this");
    assert.deepEqual(src.calls, ["search:dandadan", "search:nothing like this"], "a fruitless lookup isn't repeated");
  });

  it("falls back to the catalog's answer when the provider is down", async () => {
    await seed();
    src.down = true;
    assert.deepEqual((await searchTitles("dandadan")).items, []);
  });
});

describe("lists", () => {
  it("browses with filters and sorts, from the catalog only", async () => {
    await seed();
    const ids = async (f: Partial<typeof DEFAULT_FILTERS>) => (await browseTitles({ ...DEFAULT_FILTERS, ...f })).items.map((x) => x.anilistId);
    assert.deepEqual(await ids({}), [1, 2, 3, 4], "popularity, adult left out");
    assert.deepEqual(await ids({ types: ["webtoon"] }), [3]);
    assert.deepEqual(await ids({ genres: ["Adventure", "Drama"] }), [1], "all genres must match");
    assert.deepEqual(await ids({ genres: ["Shonen"] }), [1, 2, 3], "Shonen is an AniList tag");
    assert.deepEqual(await ids({ sort: "rating-desc" }), [1, 3, 2, 4]);
    assert.deepEqual(await ids({ sort: "rating-asc" }), [2, 3, 1], "unscored left out");
    assert.deepEqual(await ids({ sort: "oldest" }), [2, 4, 3, 1]);
    assert.deepEqual(await ids({ yearFrom: 2010, yearTo: 2018 }), [3, 4]);
    assert.deepEqual(await ids({ minStars: 4 }), [1, 3]);
    const page = await browseTitles(DEFAULT_FILTERS, 1);
    assert.equal(page.total, 4);
    assert.equal(page.hasNext, false);
    assert.deepEqual(src.calls, []);
  });

  it("serves seasonal and trending rails and type counts", async () => {
    await seed();
    await upsertTitles([sourceTitle(3, { kind: "MANGA", entryType: "webtoon", trending: 50 }), sourceTitle(2, { trending: 80 })], { trending: true });
    assert.deepEqual((await getTrendingNow()).items.map((x) => x.anilistId), [2, 3]);
    assert.deepEqual((await getTrendingNow("webtoon")).items.map((x) => x.anilistId), [3]);
    assert.deepEqual((await getSeasonalLineup(2023, "FALL")).items.map((x) => x.anilistId), [1]);
    assert.deepEqual(await getTypeCounts(), [3, 0, 1, 0]);
  });

  it("serves our image copy once it exists", async () => {
    await seed();
    assert.equal((await getCachedTitle(1))!.cover, "https://img.example/cover/1.jpg");
    await t.db.update(titles).set({ cover: "https://img.otakuvault.app/catalog/anilist/1/cover-abc.webp" }).where(eq(titles.anilistId, 1));
    const card = (await getCachedTitle(1))!;
    assert.equal(card.cover, "https://img.otakuvault.app/catalog/anilist/1/cover-abc.webp");
    assert.equal(card.thumb, card.cover);
  });
});

describe("title pages", () => {
  it("renders a catalog title with extras without asking the provider", async () => {
    await seed();
    await saveDetails(details(sourceTitle(1, { title: "Frieren: Beyond Journey's End" }), [sourceTitle(2)]));
    src.calls = [];
    const r = await getTitleDetails(1, "anime");
    assert.equal(r.status, "ok");
    if (r.status !== "ok") return;
    assert.equal(r.details.characters[0].name, "A Hero");
    assert.deepEqual(r.details.studios, [{ name: "Studio One", isMain: true }]);
    assert.deepEqual(r.details.tags, [{ name: "Shounen", rank: 80 }]);
    assert.deepEqual(r.details.recommendations.map((x) => x.anilistId), [2]);
    assert.deepEqual(src.calls, []);
  });

  it("fetches a title the catalog doesn't have once, then serves it from the catalog", async () => {
    src.add(sourceTitle(99, { title: "New Show" }));
    const r = await getTitleDetails(99, "anime");
    assert.equal(r.status, "ok");
    await getTitleDetails(99, "anime");
    assert.deepEqual(src.calls, ["fetchDetails:99"]);
  });

  it("answers not-found, and doesn't ask again for a week", async () => {
    assert.deepEqual(await getTitleDetails(123, "anime"), { status: "not-found" });
    assert.deepEqual(await getTitleDetails(123, "anime"), { status: "not-found" });
    assert.deepEqual(src.calls, ["fetchDetails:123"]);
  });

  it("redirects a title asked for under the wrong type", async () => {
    await seed();
    await saveDetails(details(sourceTitle(3, { kind: "MANGA", entryType: "webtoon" })));
    assert.deepEqual(await getTitleDetails(3, "manga"), { status: "wrong-type", entryType: "webtoon" });
  });

  it("still renders a known title without extras while the provider is down", async () => {
    await seed();
    src.down = true;
    const r = await getTitleDetails(1, "anime");
    assert.equal(r.status, "ok");
    if (r.status === "ok") assert.deepEqual(r.details.characters, []);
  });

  it("getTitleById adds a missing title, with description and main studios", async () => {
    src.add(sourceTitle(7, { title: "Seven" }));
    const title = await getTitleById(7);
    assert.equal(title.title, "Seven");
    assert.equal(title.description, "About Seven");
    assert.deepEqual(title.studios, ["Studio One"]);
    await getTitleById(7);
    assert.deepEqual(src.calls, ["fetchById:7"]);
  });

  it("recommends round-robin across sources, de-duped, minus the sources", async () => {
    await seed();
    await saveDetails(details(sourceTitle(1), [sourceTitle(10), sourceTitle(11), sourceTitle(2)]));
    await saveDetails(details(sourceTitle(2), [sourceTitle(10), sourceTitle(12)]));
    assert.deepEqual((await getRecommendations([1, 2])).map((x) => x.anilistId), [10, 11, 12]);
  });
});

describe("new-episodes job", () => {
  it("reads the newest aired episode from the catalog's schedule", async () => {
    const now = new Date("2026-11-20T12:00:00Z");
    const ids = await upsertTitles([sourceTitle(10, { status: "RELEASING", episodes: null, airedEpisodes: 4 })]);
    await t.db.insert(airingSchedule).values([
      { titleId: ids.get(10)!, episode: 5, airingAt: new Date("2026-11-20T09:00:00Z") },
      { titleId: ids.get(10)!, episode: 6, airingAt: new Date("2026-11-27T09:00:00Z") },
    ]);
    assert.equal((await getAiringStatus([10], now)).get(10)?.latestEpisode, 5);

    await t.db.insert(users).values({ id: "u1", email: "a@example.com", displayName: "A" });
    await t.db.insert(entries).values({ userId: "u1", anilistId: 10, title: "Title 10", type: "anime", status: "watching", progressCurrent: 3 });
    await t.db.insert(airingWatermarks).values({ anilistId: 10, lastEpisode: 4, checkedAt: new Date("2026-11-20T11:00:00Z") });
    const report = await runNewEpisodesJob(now);
    assert.deepEqual(report.announced, [{ anilistId: 10, episode: 5, notified: 1 }]);
    assert.equal(report.error, null);
    assert.deepEqual(src.calls, [], "no provider request");
  });
});
