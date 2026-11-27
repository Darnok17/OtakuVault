import { afterEach, beforeEach, describe, it } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_FILTERS } from "@/lib/anilist-shared";
import { browseTitles, catalogMode, getTitleDetails, getTitleById, getTrendingNow } from "./index";
import { clearMemoryCache } from "./edge-cache";

// CATALOG_SOURCE=anilist: pages are served from AniList (through the relay when
// ANILIST_API_URL is set), cached, and Postgres is never touched. DATABASE_URL is unset here,
// so any database access throws.

const media = (id: number) => ({
  id, type: "ANIME", format: "TV", status: "RELEASING", episodes: 12, chapters: null, volumes: null,
  averageScore: 80, popularity: 1000, genres: ["Action"], countryOfOrigin: "JP", nextAiringEpisode: { episode: 5 },
  season: "FALL", seasonYear: 2026, startDate: { year: 2026 },
  title: { romaji: `Show ${id}`, english: null, native: null },
  coverImage: { extraLarge: `https://img/${id}.jpg`, large: null, medium: null, color: null }, bannerImage: null,
});

let calls: { url: string; headers: Record<string, string>; body: { query: string; variables: Record<string, unknown> } }[];
const realFetch = globalThis.fetch;
const saved: Record<string, string | undefined> = { ...process.env };
// Typed loosely: cloudflare-env.d.ts pins the wrangler.jsonc values.
const env = process.env as Record<string, string | undefined>;

function answer(respond: (body: { query: string; variables: Record<string, unknown> }) => Response) {
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    const body = JSON.parse(init.body as string);
    calls.push({ url, headers: init.headers as Record<string, string>, body });
    return respond(body);
  }) as typeof fetch;
}

beforeEach(() => {
  calls = [];
  clearMemoryCache();
  delete env.CATALOG_SOURCE;
  delete env.DATABASE_URL;
  env.ANILIST_API_URL = "https://relay.example/api/anilist-relay";
  env.ANILIST_RELAY_SECRET = "s3cret";
});
afterEach(() => {
  globalThis.fetch = realFetch;
  for (const k of ["CATALOG_SOURCE", "DATABASE_URL", "ANILIST_API_URL", "ANILIST_RELAY_SECRET"]) {
    if (saved[k] === undefined) delete env[k];
    else env[k] = saved[k];
  }
});

describe("catalog, anilist mode", () => {
  it("is the default", () => {
    assert.equal(catalogMode(), "anilist");
    env.CATALOG_SOURCE = "db";
    assert.equal(catalogMode(), "db");
  });

  it("serves lists from AniList through the relay, and caches them", async () => {
    answer(() => Response.json({ data: { Page: { pageInfo: { total: 2, hasNextPage: false }, media: [media(1), media(2)] } } }));
    const first = await getTrendingNow();
    const second = await getTrendingNow();
    assert.deepEqual(first.items.map((t) => t.anilistId), [1, 2]);
    assert.deepEqual(second, first);
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, "https://relay.example/api/anilist-relay");
    assert.equal(calls[0].headers["x-relay-secret"], "s3cret");
    assert.deepEqual(calls[0].body.variables.sort, ["TRENDING_DESC"]);
  });

  it("never sends the relay secret to AniList itself", async () => {
    env.ANILIST_API_URL = "";
    answer(() => Response.json({ data: { Page: { pageInfo: { total: 0, hasNextPage: false }, media: [] } } }));
    await browseTitles(DEFAULT_FILTERS, 1);
    assert.equal(calls[0].url, "https://graphql.anilist.co");
    assert.equal(calls[0].headers["x-relay-secret"], undefined);
  });

  it("caches unknown titles as not found", async () => {
    answer(() => Response.json({ data: null, errors: [{ message: "Not Found.", status: 404 }] }, { status: 404 }));
    assert.deepEqual(await getTitleDetails(999, "anime"), { status: "not-found" });
    assert.deepEqual(await getTitleDetails(999, "manga"), { status: "not-found" });
    assert.equal(calls.length, 1);
  });

  it("fails without a stale copy, then serves stale on later errors", async () => {
    answer(() => new Response("bad gateway", { status: 502 }));
    await assert.rejects(getTitleById(7));
    answer(() => Response.json({ data: { Media: { ...media(7), description: "d", studios: { nodes: [{ name: "S" }] } } } }));
    assert.equal((await getTitleById(7)).studios?.[0], "S");
  });
});
