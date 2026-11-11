"use server";

import { headers } from "next/headers";
import { and, eq, isNull, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db, entries, forumThreads, moodboards, products, profilePins } from "@/lib/db";
import type { PinKind } from "@/lib/types";

// Profile pins: what a user shows off on their profile. One action toggles any of the four
// kinds; the profile edit page reorders and removes.

const KINDS = new Set<PinKind>(["entry", "moodboard", "forum_thread", "product"]);
const MAX_PINS = 24;

export type PinRef = { kind: PinKind; targetId: string };
export type PinResult = { ok: true; pinned: boolean } | { ok: false; error: string };

async function sessionUserId() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user.id ?? null;
}

// The pin must point at something real, and entries/moodboards must be the caller's own.
async function targetExists(userId: string, kind: PinKind, targetId: string) {
  if (kind === "entry" || kind === "moodboard") {
    const [e] = await db.select({ id: entries.id }).from(entries).where(and(eq(entries.id, targetId), eq(entries.userId, userId)));
    if (!e) return false;
    if (kind === "entry") return true;
    const [b] = await db.select({ id: moodboards.id }).from(moodboards).where(eq(moodboards.entryId, targetId));
    return !!b;
  }
  if (kind === "forum_thread") {
    const [t] = await db.select({ id: forumThreads.id }).from(forumThreads).where(and(eq(forumThreads.id, targetId), isNull(forumThreads.deletedAt)));
    return !!t;
  }
  const [p] = await db.select({ id: products.id }).from(products).where(eq(products.id, targetId));
  return !!p;
}

export async function getMyPins(): Promise<PinRef[]> {
  const userId = await sessionUserId();
  if (!userId) return [];
  return db.select({ kind: profilePins.kind, targetId: profilePins.targetId }).from(profilePins).where(eq(profilePins.userId, userId));
}

// Pins the target, or unpins it if it is already pinned.
export async function togglePin(kind: PinKind, targetId: string): Promise<PinResult> {
  const userId = await sessionUserId();
  if (!userId) return { ok: false, error: "Log in to pin things to your profile." };
  if (!KINDS.has(kind) || typeof targetId !== "string" || !targetId || targetId.length > 100) return { ok: false, error: "That can't be pinned." };

  const mine = and(eq(profilePins.userId, userId), eq(profilePins.kind, kind), eq(profilePins.targetId, targetId));
  const removed = await db.delete(profilePins).where(mine).returning({ id: profilePins.id });
  if (removed.length) return { ok: true, pinned: false };

  if (!(await targetExists(userId, kind, targetId))) {
    return { ok: false, error: kind === "moodboard" ? "Add something to this moodboard first." : "That can't be pinned." };
  }
  const [{ count, next }] = await db
    .select({ count: sql<number>`count(*)::int`, next: sql<number>`coalesce(max(${profilePins.position}), -1)::int + 1` })
    .from(profilePins).where(eq(profilePins.userId, userId));
  if (count >= MAX_PINS) return { ok: false, error: `You can pin up to ${MAX_PINS} things. Unpin one first.` };
  await db.insert(profilePins).values({ userId, kind, targetId, position: next }).onConflictDoNothing();
  return { ok: true, pinned: true };
}

export async function removePin(pinId: string): Promise<void> {
  const userId = await sessionUserId();
  if (!userId) throw new Error("Not signed in");
  if (typeof pinId !== "string" || !/^[0-9a-f-]{36}$/i.test(pinId)) throw new Error("Invalid pin");
  await db.delete(profilePins).where(and(eq(profilePins.id, pinId), eq(profilePins.userId, userId)));
}

// Saves the order from the profile edit page: position = index in `pinIds`.
export async function reorderPins(pinIds: string[]): Promise<void> {
  const userId = await sessionUserId();
  if (!userId) throw new Error("Not signed in");
  if (!Array.isArray(pinIds) || pinIds.length > MAX_PINS || pinIds.some((id) => typeof id !== "string" || !/^[0-9a-f-]{36}$/i.test(id))) throw new Error("Invalid order");
  await db.transaction(async (tx) => {
    for (const [position, id] of pinIds.entries()) {
      await tx.update(profilePins).set({ position }).where(and(eq(profilePins.id, id), eq(profilePins.userId, userId)));
    }
  });
}
