// The catalog sync job. Talks to AniList directly (not through the relay: this runs on GitHub
// Actions or a laptop, which AniList doesn't block) and writes straight to DATABASE_URL.
//
//   pnpm catalog:sync incremental                 the hourly run (GitHub Actions: catalog-sync.yml)
//   pnpm catalog:sync backfill [--min-popularity 1000] [--kinds ANIME,MANGA] [--max-pages N] [--restart]
//   pnpm catalog:sync images [--limit 5000]       copy missing cover/banner images to R2
//   pnpm catalog:sync probe                       one AniList request, no database (CI smoke test)
//
// Image copies need CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN (R2 write) and MEDIA_BASE_URL;
// without them the images step is skipped. CATALOG_MEDIA_BUCKET defaults to otakuvault-media.
// ANILIST_PER_MINUTE (default 25) keeps us under AniList's limit (90/min, 30 while degraded).

import "dotenv/config";
import { parseArgs } from "node:util";
import type { MediaKind } from "@/lib/anilist-shared";
import { createAniListSource } from "@/lib/catalog/sources/anilist";
import { r2RestStore, copyImages, type ImageStore } from "@/lib/catalog/images";

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    "min-popularity": { type: "string" },
    kinds: { type: "string" },
    "max-pages": { type: "string" },
    restart: { type: "boolean" },
    limit: { type: "string" },
  },
});
const mode = positionals[0] ?? "incremental";
const log = (m: string) => console.log(`[${new Date().toISOString()}] ${m}`);
const num = (v: string | undefined) => (v === undefined ? undefined : Number(v));

const source = createAniListSource({
  wait: true,
  perMinute: Number(process.env.ANILIST_PER_MINUTE) || 25,
  timeoutMs: 20_000,
  log,
});

function imageStore(): ImageStore | null {
  const { CLOUDFLARE_ACCOUNT_ID: accountId, CLOUDFLARE_API_TOKEN: apiToken, MEDIA_BASE_URL: publicBaseUrl } = process.env;
  if (!accountId || !apiToken || !publicBaseUrl) return null;
  return r2RestStore({ accountId, apiToken, publicBaseUrl, bucket: process.env.CATALOG_MEDIA_BUCKET || "otakuvault-media" });
}

async function main(): Promise<boolean> {
  if (mode === "probe") {
    const page = await source.fetchTrending("anime", 1);
    log(`AniList reachable: ${page.items.length} trending anime, top "${page.items[0]?.title}"`);
    return page.items.length > 0;
  }

  // Imported only now: lib/db needs DATABASE_URL, which probe doesn't.
  const { db } = await import("@/lib/db");
  const { runBackfill, runIncremental } = await import("@/lib/catalog/sync");
  try {
    if (mode === "backfill") {
      const report = await runBackfill({ source, log }, {
        minPopularity: num(values["min-popularity"]),
        kinds: values.kinds?.split(",").map((k) => k.trim().toUpperCase() as MediaKind),
        maxPages: num(values["max-pages"]),
        restart: values.restart,
      });
      log(`backfill: ${JSON.stringify(report)}`);
      return true;
    }
    if (mode === "images") {
      const store = imageStore();
      if (!store) throw new Error("CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN and MEDIA_BASE_URL are required");
      const r = await copyImages(store, num(values.limit) ?? 5000, { log });
      log(`images: ${JSON.stringify(r)}`);
      return r.failed === 0 || r.copied > 0;
    }
    if (mode === "incremental") {
      const store = imageStore();
      if (!store) log("images: no R2 credentials, skipping image copies");
      const report = await runIncremental({ source, images: store, log }, {
        minPopularity: num(values["min-popularity"]),
        imageLimit: num(values.limit),
      });
      const failed = Object.entries(report).filter(([, r]) => !r.ok).map(([k]) => k);
      log(failed.length ? `done, failed steps: ${failed.join(", ")}` : "done");
      // A run where every step failed is an outage worth a red X; one flaky step is not.
      return failed.length < Object.keys(report).length;
    }
    throw new Error(`Unknown mode "${mode}" (incremental | backfill | images | probe)`);
  } finally {
    await db.$client.end();
  }
}

main().then(
  (ok) => process.exit(ok ? 0 : 1),
  (err) => { console.error(err); process.exit(1); },
);
