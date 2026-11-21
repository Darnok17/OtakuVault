// OpenNext adapter config. See docs/cloudflare-migration-guide.md (decision D6).
import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import r2IncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/r2-incremental-cache";
import { withRegionalCache } from "@opennextjs/cloudflare/overrides/incremental-cache/regional-cache";
import d1NextTagCache from "@opennextjs/cloudflare/overrides/tag-cache/d1-next-tag-cache";
import doQueue from "@opennextjs/cloudflare/overrides/queue/do-queue";

export default defineCloudflareConfig({
  // Prerendered output and ISR entries in R2, fronted by the Cache API.
  incrementalCache: withRegionalCache(r2IncrementalCache, { mode: "long-lived" }),
  // Tag revalidation timestamps (revalidateTag/updateTag) in D1.
  tagCache: d1NextTagCache,
  // Background revalidation queue on a Durable Object.
  queue: doQueue,
});
