// One-time backfill: links existing entries to AniList by title, so their cards can open detail
// pages. Only exact matches (ignoring case and punctuation) against the title's English, romaji
// or native name are linked; anything else stays unlinked and is logged.
//
// Run with `pnpm db:backfill-anilist` (add `-- --dry-run` to only report). Safe to re-run: only
// entries without an anilist_id are looked at. Paced to stay under the AniList rate limit, so
// expect about two seconds per distinct uncached title.

import "dotenv/config";
import { eq, isNull } from "drizzle-orm";
import { db, entries } from "./index";
import { searchTitles } from "../anilist";
import { normalizeTitle } from "../entries-db";

const dryRun = process.argv.includes("--dry-run");
const PACE_MS = 2200;
const stats = { linked: 0, unmatched: 0, failed: 0 };
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const rows = await db.select({ id: entries.id, title: entries.title, type: entries.type }).from(entries).where(isNull(entries.anilistId));
  console.log(`${rows.length} unlinked entries${dryRun ? " (dry run)" : ""}`);

  // Many users share a title: one lookup per distinct title + type.
  const groups = new Map<string, typeof rows>();
  for (const row of rows) {
    const key = `${row.type}:${normalizeTitle(row.title)}`;
    groups.set(key, [...(groups.get(key) ?? []), row]);
  }

  for (const group of groups.values()) {
    const { title, type } = group[0];
    try {
      const { items } = await searchTitles(title, type);
      const wanted = normalizeTitle(title);
      const match = items.find((t) => [t.title, t.romaji, t.native].some((n) => n && normalizeTitle(n) === wanted));
      if (!match) {
        stats.unmatched += group.length;
        console.log(`  no match:  [${type}] ${title}`);
      } else {
        stats.linked += group.length;
        console.log(`  linked:    [${type}] ${title} -> ${match.anilistId} (${group.length})`);
        if (!dryRun) for (const { id } of group) await db.update(entries).set({ anilistId: match.anilistId }).where(eq(entries.id, id));
      }
    } catch (err) {
      stats.failed += group.length;
      console.log(`  failed:    [${type}] ${title}: ${(err as Error).message}`);
    }
    await sleep(PACE_MS);
  }

  console.log(`\nDone. ${dryRun ? "would link" : "linked"} ${stats.linked}, unmatched ${stats.unmatched}, failed ${stats.failed}`);
}

// Unmatched or failed lookups are expected and don't fail the run.
main()
  .catch((err) => console.error(err))
  .finally(() => db.$client.end());
