// One-time backfill: moves base64 data-URL images out of the database into storage.
//   - entries.image_url            data:image/... → uploaded cover URL
//   - moodboards.nodes[].data.*    data:image/... → uploaded image URL
//
// Run with `pnpm db:migrate-images` (add `-- --dry-run` to only count). Storage follows
// lib/storage.ts: local public/uploads by default; set STORAGE_DRIVER=blob plus the Blob
// token to backfill production. Safe to re-run: only data URLs are touched, and a row that
// changed while it was being converted is skipped (run again to pick it up).

import "dotenv/config";
import { eq, like, sql, and } from "drizzle-orm";
import { db, entries, moodboards } from "./index";
import { isDataImage, uploadDataUrl } from "../storage";
import type { MoodNode } from "../types";

const dryRun = process.argv.includes("--dry-run");
const stats = { covers: 0, nodeImages: 0, boards: 0, skipped: 0, failed: 0, bytesBefore: 0 };
const kb = (n: number) => `${Math.round(n / 1024).toLocaleString("en-US")} KB`;

async function migrateCovers() {
  const ids = await db.select({ id: entries.id }).from(entries).where(like(entries.imageUrl, "data:image/%"));
  for (const { id } of ids) {
    const [row] = await db.select({ userId: entries.userId, imageUrl: entries.imageUrl }).from(entries).where(eq(entries.id, id));
    if (!row || !isDataImage(row.imageUrl)) continue;
    stats.bytesBefore += row.imageUrl.length;
    if (dryRun) { stats.covers++; continue; }
    try {
      const url = await uploadDataUrl(row.imageUrl, "cover", row.userId);
      const updated = await db.update(entries).set({ imageUrl: url })
        .where(and(eq(entries.id, id), eq(entries.imageUrl, row.imageUrl)))
        .returning({ id: entries.id });
      if (updated.length) stats.covers++; else stats.skipped++;
    } catch (err) {
      stats.failed++;
      console.error(`  ✕ entry ${id}:`, (err as Error).message);
    }
  }
}

async function migrateBoards() {
  const ids = await db.select({ entryId: moodboards.entryId }).from(moodboards)
    .where(sql`${moodboards.nodes}::text like '%data:image/%'`);
  for (const { entryId } of ids) {
    const [row] = await db.select({ nodes: moodboards.nodes, userId: entries.userId }).from(moodboards)
      .innerJoin(entries, eq(entries.id, moodboards.entryId))
      .where(eq(moodboards.entryId, entryId));
    if (!row) continue;
    // The same image placed twice on a board is uploaded once.
    const uploaded = new Map<string, string>();
    let count = 0;
    try {
      const nodes: MoodNode[] = [];
      for (const node of row.nodes) {
        const data: Record<string, string> = {};
        for (const [k, v] of Object.entries(node.data ?? {})) {
          if (!isDataImage(v)) { data[k] = v; continue; }
          count++;
          stats.bytesBefore += v.length;
          if (!uploaded.has(v)) uploaded.set(v, dryRun ? v : await uploadDataUrl(v, "moodboard", row.userId));
          data[k] = uploaded.get(v)!;
        }
        nodes.push({ ...node, data });
      }
      if (dryRun) { stats.nodeImages += count; stats.boards++; continue; }
      const updated = await db.update(moodboards).set({ nodes })
        // Only if nobody saved the board meanwhile.
        .where(and(eq(moodboards.entryId, entryId), sql`${moodboards.nodes} = ${JSON.stringify(row.nodes)}::jsonb`))
        .returning({ id: moodboards.id });
      if (updated.length) { stats.nodeImages += count; stats.boards++; } else stats.skipped++;
    } catch (err) {
      stats.failed++;
      console.error(`  ✕ moodboard of entry ${entryId}:`, (err as Error).message);
    }
  }
}

async function main() {
  console.log(`Migrating data-URL images to storage${dryRun ? " (dry run — nothing is written)" : ""}…`);
  await migrateCovers();
  await migrateBoards();
  const verb = dryRun ? "would convert" : "converted";
  console.log(`  covers:           ${verb} ${stats.covers}`);
  console.log(`  moodboard images: ${verb} ${stats.nodeImages} across ${stats.boards} board(s)`);
  console.log(`  base64 removed from the DB: ${kb(stats.bytesBefore)}`);
  if (stats.skipped) console.log(`  skipped (changed during migration — run again): ${stats.skipped}`);
  if (stats.failed) console.log(`  failed: ${stats.failed}`);
  process.exitCode = stats.failed ? 1 : 0;
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => db.$client.end());
