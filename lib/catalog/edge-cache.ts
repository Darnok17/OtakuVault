// A small read-through cache for live AniList reads (lib/catalog/live.ts), so popular pages
// don't send a request to AniList on every visit.
//
// Two layers:
//  - memory, per isolate / server process (a few hundred entries, LRU);
//  - on Cloudflare, the Workers Cache API (caches.default), shared by every isolate in a data
//    centre and kept across deploys. Not available on workers.dev hostnames or in Node, where
//    only the memory layer applies.
//
// Why not "use cache"? Its default handler is in-memory and per instance (see
// node_modules/next/dist/docs/01-app/03-api-reference/01-directives/use-cache.md, "Runtime
// caching considerations"); "use cache: remote" needs a cacheHandlers entry that OpenNext doesn't
// provide here. The Postgres-backed alternatives are what this mode exists to avoid.
//
// Entries are fresh for their TTL; after that the next read refetches, and if the provider
// fails, the stale value is served for up to STALE_MS more.

const STALE_MS = 3 * 86_400_000;
const MEMORY_MAX = 400;
const ORIGIN = "https://catalog-cache.otakuvault.internal/";

type Stored<T> = { v: T; at: number };

const memory = new Map<string, Stored<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

function edgeCache(): Cache | null {
  try {
    return (globalThis as { caches?: { default?: Cache } }).caches?.default ?? null;
  } catch {
    return null;
  }
}

async function urlFor(key: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(key));
  return ORIGIN + [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function remember(key: string, s: Stored<unknown>) {
  memory.delete(key);
  memory.set(key, s);
  if (memory.size > MEMORY_MAX) memory.delete(memory.keys().next().value!);
}

async function read<T>(key: string): Promise<Stored<T> | null> {
  const m = memory.get(key) as Stored<T> | undefined;
  if (m) return m;
  const cache = edgeCache();
  if (!cache) return null;
  try {
    const res = await cache.match(await urlFor(key));
    if (!res) return null;
    const s = (await res.json()) as Stored<T>;
    remember(key, s);
    return s;
  } catch {
    return null;
  }
}

async function write(key: string, s: Stored<unknown>, ttlMs: number) {
  remember(key, s);
  const cache = edgeCache();
  if (!cache) return;
  try {
    await cache.put(await urlFor(key), new Response(JSON.stringify(s), {
      headers: { "Content-Type": "application/json", "Cache-Control": `public, max-age=${Math.ceil((ttlMs + STALE_MS) / 1000)}` },
    }));
  } catch (err) {
    console.warn(`catalog cache: put failed for ${key}: ${(err as Error).message}`);
  }
}

// Returns the cached value for `key` while it is younger than ttlMs, else runs `load` (once for
// concurrent callers) and caches its result. If `load` fails, a stale value beats an error.
export async function cached<T>(key: string, ttlMs: number, load: () => Promise<T>): Promise<T> {
  const hit = await read<T>(key);
  const age = hit ? Date.now() - hit.at : Infinity;
  if (hit && age < ttlMs) return hit.v;
  let pending = inflight.get(key) as Promise<T> | undefined;
  if (!pending) {
    pending = load()
      .then(async (v) => { await write(key, { v, at: Date.now() }, ttlMs); return v; })
      .finally(() => inflight.delete(key));
    inflight.set(key, pending);
  }
  try {
    return await pending;
  } catch (err) {
    if (hit && age < ttlMs + STALE_MS) return hit.v;
    throw err;
  }
}

// Tests only.
export function clearMemoryCache() {
  memory.clear();
}
