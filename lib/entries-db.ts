import { and, eq } from "drizzle-orm";
import { db, entries } from "@/lib/db";
import type { Entry, EntryType } from "@/lib/types";

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

// The user's entry for a title: by AniList id, else an unlinked entry of the same type with a
// matching name. Type matters because an anime and its manga usually share a title.
export async function findCollectionEntry(userId: string, anilistId: number, type: EntryType, names: (string | null)[]) {
  const rows = await db.select().from(entries).where(and(eq(entries.userId, userId), eq(entries.type, type)));
  const wanted = new Set(names.flatMap((n) => (n ? [normalizeTitle(n)] : [])).filter(Boolean));
  return rows.find((r) => r.anilistId === anilistId) ?? rows.find((r) => r.anilistId == null && wanted.has(normalizeTitle(r.title))) ?? null;
}
