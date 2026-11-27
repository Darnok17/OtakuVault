import { and, eq, inArray, isNotNull, sql } from "drizzle-orm";
import { airingWatermarks, db, entries } from "@/lib/db";
import { getAiringStatus } from "@/lib/catalog";
import { createNotifications, type NewNotification } from "@/lib/notifications";

// The new-episodes job (app/api/jobs/new-episodes/route.ts runs it on a schedule).
//
// For every anime somebody has marked Watching (and that is linked to AniList), it reads the
// newest aired episode from the title catalog (whose airing schedule the catalog sync keeps
// current; no provider request here) and compares it with airing_watermarks, the newest episode
// already announced. Anything newer is announced to each watcher whose New episodes switch is on,
// then the watermark moves up. Dedupe keys ("episode:<anilistId>:<n>") make retries and
// overlapping runs harmless.
//
// A show seen for the first time, or not checked for STALE_MS (nobody was watching it), only has
// its watermark set: announcing its back catalogue to someone who just started it would be noise.

const STALE_MS = 3 * 24 * 3_600_000;

export type NewEpisodesReport = {
  shows: number;
  checked: number;
  initialized: number;
  announced: { anilistId: number; episode: number; notified: number }[];
  error: string | null;
};

export async function runNewEpisodesJob(now = new Date()): Promise<NewEpisodesReport> {
  const watchers = await db
    .select({ userId: entries.userId, anilistId: entries.anilistId, title: entries.title, progress: entries.progressCurrent })
    .from(entries)
    .where(and(eq(entries.type, "anime"), eq(entries.status, "watching"), isNotNull(entries.anilistId)));
  const byShow = new Map<number, typeof watchers>();
  for (const w of watchers) byShow.set(w.anilistId!, [...(byShow.get(w.anilistId!) ?? []), w]);

  const report: NewEpisodesReport = { shows: byShow.size, checked: 0, initialized: 0, announced: [], error: null };
  if (!byShow.size) return report;

  const ids = [...byShow.keys()];
  const marks = new Map(
    (await db.select().from(airingWatermarks).where(inArray(airingWatermarks.anilistId, ids))).map((m) => [m.anilistId, m]),
  );
  const statuses = await getAiringStatus(ids, now);
  const missing = ids.length - statuses.size;
  // db mode: the sync adds every collection title to the catalog within the hour. anilist mode:
  // AniList was unreachable or rate limited part-way. Either way they're checked next run.
  if (missing) report.error = `${missing} show(s) not checked (not in the catalog yet, or AniList unavailable)`;

  for (const [anilistId, status] of statuses) {
    report.checked++;
    const latest = status.latestEpisode;
    if (latest === null) continue;
    const mark = marks.get(anilistId);

    if (!mark || now.getTime() - mark.checkedAt.getTime() > STALE_MS) {
      await saveMark(anilistId, latest, now);
      report.initialized++;
      continue;
    }
    if (latest <= mark.lastEpisode) {
      await db.update(airingWatermarks).set({ checkedAt: now }).where(eq(airingWatermarks.anilistId, anilistId));
      continue;
    }

    const from = mark.lastEpisode + 1;
    const list: NewNotification[] = (byShow.get(anilistId) ?? [])
      // Someone already past it (tracked progress) doesn't need telling.
      .filter((w) => w.progress < latest)
      .map((w) => ({
        userId: w.userId,
        type: "new_episode",
        title: from === latest ? `Episode ${latest} of ${w.title} is out` : `Episodes ${from}–${latest} of ${w.title} are out`,
        body: w.progress > 0 ? `You're on episode ${w.progress}.` : "It's on your Watching list.",
        link: `/anime/${anilistId}`,
        dedupeKey: `episode:${anilistId}:${latest}`,
      }));
    // Notify before moving the watermark: if this fails, the next run tries again.
    const notified = await createNotifications(list);
    await saveMark(anilistId, latest, now);
    report.announced.push({ anilistId, episode: latest, notified });
  }
  return report;
}

function saveMark(anilistId: number, lastEpisode: number, now: Date) {
  return db.insert(airingWatermarks).values({ anilistId, lastEpisode, checkedAt: now })
    .onConflictDoUpdate({ target: airingWatermarks.anilistId, set: { lastEpisode: sql`excluded.last_episode`, checkedAt: sql`excluded.checked_at` } });
}
