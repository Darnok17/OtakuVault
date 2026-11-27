import { and, eq } from "drizzle-orm";
import { db, entries } from "@/lib/db";
import type { Entry, EntryType, ListMark } from "@/lib/types";

// Server-only entry helpers shared by the entry and AniList actions and the detail pages.

type EntryRow = typeof entries.$inferSelect;

export const toEntry = (r: EntryRow): Entry => ({
  id: r.id,
  title: r.title,
  type: r.type,
  status: r.status,
  genre: r.genre,
  totalEps: r.totalEps,
  notes: r.notes,
  rating: r.rating,
  imageUrl: r.imageUrl,
  progressCurrent: r.progressCurrent,
  progressTotal: r.progressTotal,
  created: r.createdAt.getTime(),
  manualOrder: r.manualOrder ?? undefined,
  anilistId: r.anilistId ?? undefined,
});

// Case, spacing and punctuation don't make a different title: "Re:ZERO" = "re zero".
export const normalizeTitle = (s: string) => s.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "");

// Which of `rows` is the entry for a title: by AniList id, else an unlinked entry of the same type
// with a matching name. Type matters because an anime and its manga usually share a title.
function matchEntry<R extends Pick<EntryRow, "anilistId" | "type" | "title">>(rows: R[], anilistId: number, type: EntryType, names: (string | null)[]) {
  const wanted = new Set(names.flatMap((n) => (n ? [normalizeTitle(n)] : [])).filter(Boolean));
  return rows.find((r) => r.anilistId === anilistId)
    ?? rows.find((r) => r.anilistId == null && r.type === type && wanted.has(normalizeTitle(r.title))) ?? null;
}

// The user's entry for a title.
export async function findCollectionEntry(userId: string, anilistId: number, type: EntryType, names: (string | null)[]) {
  const rows = await db.select().from(entries).where(and(eq(entries.userId, userId), eq(entries.type, type)));
  return matchEntry(rows, anilistId, type, names);
}

export type MarkQuery = { anilistId: number; type: EntryType; names: (string | null)[] };

// The title world's "in your list" marks: for each title asked about that the user has an entry
// for, its status, rating and progress. One query, whatever the number of titles; per user and
// per request, so callers must never put the result in a shared cache.
export async function listMarks(userId: string, titles: MarkQuery[]): Promise<Record<number, ListMark>> {
  if (titles.length === 0) return {};
  const rows = await db.select({
    anilistId: entries.anilistId, type: entries.type, title: entries.title, status: entries.status, rating: entries.rating,
    progressCurrent: entries.progressCurrent, progressTotal: entries.progressTotal,
  }).from(entries).where(eq(entries.userId, userId));
  const marks: Record<number, ListMark> = {};
  for (const t of titles) {
    const r = matchEntry(rows, t.anilistId, t.type, t.names);
    if (r) marks[t.anilistId] = { status: r.status, rating: r.rating, progress: r.progressCurrent, total: r.progressTotal };
  }
  return marks;
}
