"use server";

import { headers } from "next/headers";
import { and, desc, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db, entries, entryStatus, entryType } from "@/lib/db";
import type { Entry, EntryStatus, EntryType } from "@/lib/types";

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
// Covers are base64 data URLs until they move to Blob storage.
const MAX_IMAGE_CHARS = 2_000_000;

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

function entryFields(e: NewEntryInput) {
  const rating = e.rating;
  if (typeof rating !== "number" || rating < 0 || rating > 5 || (rating * 2) % 1 !== 0) throw new Error("Invalid rating");
  if (!TYPES.has(e.type)) throw new Error("Invalid type");
  if (!STATUSES.has(e.status)) throw new Error("Invalid status");
  const imageUrl = str(e.imageUrl, "imageUrl", MAX_IMAGE_CHARS);
  if (imageUrl && !/^(data:image\/|https?:\/\/)/.test(imageUrl)) throw new Error("Invalid imageUrl");
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
  const [row] = await db.update(entries)
    .set(entryFields(entry))
    .where(and(eq(entries.id, id(entry.id)), eq(entries.userId, userId)))
    .returning();
  if (!row) throw new Error("Entry not found");
  return toEntry(row);
}

// Idempotent: deleting something already gone (or not yours) is a no-op.
export async function deleteEntryAction(entryId: string): Promise<void> {
  const userId = await requireUserId();
  await db.delete(entries).where(and(eq(entries.id, id(entryId)), eq(entries.userId, userId)));
}

// Undo of a delete: re-inserts with the original id and timestamp so the entry's
// moodboard (keyed by entry id) stays attached. A taken id is left untouched.
export async function restoreEntryAction(entry: Entry): Promise<void> {
  const userId = await requireUserId();
  if (!Number.isFinite(entry.created)) throw new Error("Invalid created");
  await db.insert(entries)
    .values({ ...entryFields(entry), id: id(entry.id), userId, createdAt: new Date(entry.created) })
    .onConflictDoNothing();
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
