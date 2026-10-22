"use server";

import { headers } from "next/headers";
import { and, desc, eq, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { deleteImage, isDataImage, isOwnedUpload, uploadDataUrl } from "@/lib/storage";
import { saveMoodboard } from "./moodboards";
import { db, entries, entryStatus, entryType, moodboards } from "@/lib/db";
import type { Entry, EntryStatus, EntryType, Moodboard } from "@/lib/types";

type EntryRow = typeof entries.$inferSelect;
export type NewEntryInput = Omit<Entry, "id" | "created" | "userId">;

// The proxy only checks that a session cookie exists; every action re-validates it.
async function requireUserId() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("Not signed in");
  return session.user.id;
}

const toEntry = (r: EntryRow): Entry => ({
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
});

/* ---------- Input validation (actions are public endpoints; never trust the client) ---------- */

const TYPES = new Set<string>(entryType.enumValues);
const STATUSES = new Set<string>(entryStatus.enumValues);
// Covers are URLs: our uploads (/uploads/... locally, Vercel Blob in prod) or remote images.
const IMAGE_URL = /^(https?:\/\/|\/uploads\/[\w-]+\/[\w.-]+$)/;

function str(v: unknown, field: string, max = 2000) {
  if (typeof v !== "string" || v.length > max) throw new Error(`Invalid ${field}`);
  return v;
}
function int(v: unknown, field: string) {
  if (!Number.isInteger(v) || (v as number) < 0 || (v as number) > 1_000_000) throw new Error(`Invalid ${field}`);
  return v as number;
}
function id(v: unknown) {
  return str(v, "id", 100);
}

// legacyImage: the row's current imageUrl. A pre-upload data URL is accepted only when it's
// that same value coming back unchanged; new base64 images must go through uploadImageAction.
function entryFields(e: NewEntryInput, legacyImage?: string) {
  const rating = e.rating;
  if (typeof rating !== "number" || rating < 0 || rating > 5 || (rating * 2) % 1 !== 0) throw new Error("Invalid rating");
  if (!TYPES.has(e.type)) throw new Error("Invalid type");
  if (!STATUSES.has(e.status)) throw new Error("Invalid status");
  const imageUrl = e.imageUrl === legacyImage && isDataImage(legacyImage) ? e.imageUrl : str(e.imageUrl, "imageUrl", 2000);
  if (imageUrl && imageUrl !== legacyImage && !IMAGE_URL.test(imageUrl)) throw new Error("Invalid imageUrl");
  return {
    title: str(e.title, "title", 300),
    type: e.type as EntryType,
    status: e.status as EntryStatus,
    genre: str(e.genre, "genre", 300),
    totalEps: str(e.totalEps, "totalEps", 100),
    notes: str(e.notes, "notes", 10_000),
    rating,
    imageUrl,
    progressCurrent: int(e.progressCurrent, "progressCurrent"),
    progressTotal: int(e.progressTotal, "progressTotal"),
    // Absent/undefined clears the tier position.
    manualOrder: e.manualOrder == null ? null : int(e.manualOrder, "manualOrder"),
  };
}

/* ---------- Actions ---------- */

export async function getEntriesForUser(): Promise<Entry[]> {
  const userId = await requireUserId();
  const rows = await db.select().from(entries).where(eq(entries.userId, userId)).orderBy(desc(entries.createdAt));
  return rows.map(toEntry);
}

export async function addEntryAction(entry: NewEntryInput): Promise<Entry> {
  const userId = await requireUserId();
  const [row] = await db.insert(entries).values({ ...entryFields(entry), userId }).returning();
  return toEntry(row);
}

export async function updateEntryAction(entry: Entry): Promise<Entry> {
  const userId = await requireUserId();
  const where = and(eq(entries.id, id(entry.id)), eq(entries.userId, userId));
  const [old] = await db.select({ imageUrl: entries.imageUrl }).from(entries).where(where);
  if (!old) throw new Error("Entry not found");
  const [row] = await db.update(entries).set(entryFields(entry, old.imageUrl)).where(where).returning();
  if (!row) throw new Error("Entry not found");
  // A replaced or removed cover we uploaded is deleted, unless something else still shows it.
  if (old.imageUrl !== row.imageUrl) await deleteIfUnused(old.imageUrl, userId);
  return toEntry(row);
}

async function deleteIfUnused(url: string, userId: string) {
  if (!isOwnedUpload(url, userId)) return;
  try {
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(entries).where(eq(entries.imageUrl, url));
    const [{ m }] = await db.select({ m: sql<number>`count(*)::int` }).from(moodboards)
      .where(sql`strpos(${moodboards.nodes}::text, ${url}) > 0`);
    if (!n && !m) await deleteImage(url);
  } catch (err) {
    console.error("Deleting replaced cover failed:", url, err); // an orphaned file is harmless
  }
}

// Idempotent: deleting something already gone (or not yours) is a no-op.
// The entry's moodboard row goes with it (FK cascade), so the board is returned for Undo.
export async function deleteEntryAction(entryId: string): Promise<Moodboard | null> {
  const userId = await requireUserId();
  return db.transaction(async (tx) => {
    const [board] = await tx.select({ nodes: moodboards.nodes, wires: moodboards.wires }).from(moodboards)
      .innerJoin(entries, eq(entries.id, moodboards.entryId))
      .where(and(eq(entries.id, id(entryId)), eq(entries.userId, userId)));
    await tx.delete(entries).where(and(eq(entries.id, id(entryId)), eq(entries.userId, userId)));
    return board ?? null;
  });
}

// Undo of a delete: re-inserts with the original id and timestamp, plus the moodboard the
// delete returned. A taken id is left untouched. Returns the entry as stored (its cover URL can
// change; see below), or null if the id was taken.
export async function restoreEntryAction(entry: Entry, board?: Moodboard | null): Promise<Entry | null> {
  const userId = await requireUserId();
  if (!Number.isFinite(entry.created)) throw new Error("Invalid created");
  const entryId = id(entry.id);
  // An entry deleted before the backfill ran may still carry base64 images: store them as uploads now.
  if (isDataImage(entry.imageUrl)) entry = { ...entry, imageUrl: await uploadDataUrl(entry.imageUrl, "cover", userId) };
  if (board?.nodes.some((n) => Object.values(n.data ?? {}).some(isDataImage))) {
    board = {
      ...board,
      nodes: await Promise.all(board.nodes.map(async (n) => ({
        ...n,
        data: Object.fromEntries(await Promise.all(Object.entries(n.data ?? {}).map(async ([k, v]) =>
          [k, isDataImage(v) ? await uploadDataUrl(v, "moodboard", userId) : v]))),
      }))),
    };
  }
  const [restored] = await db.insert(entries)
    .values({ ...entryFields(entry), id: entryId, userId, createdAt: new Date(entry.created) })
    .onConflictDoNothing()
    .returning();
  if (!restored) return null;
  // saveMoodboard re-validates the board and re-checks ownership.
  if (board?.nodes.length) await saveMoodboard(entryId, board.nodes, board.wires);
  return toEntry(restored);
}

// Drag-reorder within a rating tier: manualOrder = position in orderedIds.
export async function reorderEntriesAction(orderedIds: string[]): Promise<void> {
  const userId = await requireUserId();
  if (!Array.isArray(orderedIds) || orderedIds.length > 5000) throw new Error("Invalid order");
  await db.transaction(async (tx) => {
    for (const [i, entryId] of orderedIds.entries()) {
      await tx.update(entries)
        .set({ manualOrder: i })
        .where(and(eq(entries.id, id(entryId)), eq(entries.userId, userId)));
    }
  });
}
