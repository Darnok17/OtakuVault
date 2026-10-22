"use server";

import { headers } from "next/headers";
import { and, eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db, entries, moodboards } from "@/lib/db";
import { isDataImage } from "@/lib/storage";
import type { MoodNode, MoodNodeType, MoodWire, Moodboard } from "@/lib/types";

// Moodboards are one row per entry. Every action re-checks the session and that the entry
// is the caller's: the proxy only checks that a session cookie exists.

async function requireOwnedEntry(entryId: unknown) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("Not signed in");
  if (typeof entryId !== "string" || entryId.length > 100) throw new Error("Invalid entry id");
  const [entry] = await db.select({ id: entries.id }).from(entries)
    .where(and(eq(entries.id, entryId), eq(entries.userId, session.user.id)));
  if (!entry) throw new Error("Entry not found");
  return entry.id;
}

/* ---------- Validation (never trust the client) ---------- */

const NODE_TYPES = new Set<MoodNodeType>(["note", "image", "quote", "link", "character", "episode", "bubble", "custom"]);
const MAX_NODES = 500;
const MAX_WIRES = 2000;
// Image fields hold upload URLs (see app/actions/uploads.ts), so boards are small text.
const MAX_FIELD_CHARS = 20_000;

const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 100;
const isCoord = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v) && Math.abs(v) <= 1e6;

// legacy: base64 data URLs the stored board already holds. Those may come back unchanged
// (boards not yet backfilled by db:migrate-images); new base64 images are rejected.
function cleanNode(n: unknown, legacy: Set<string>): MoodNode {
  const node = n as MoodNode;
  if (!node || typeof node !== "object" || !isId(node.id) || !NODE_TYPES.has(node.type) || !isCoord(node.x) || !isCoord(node.y)) {
    throw new Error("Invalid node");
  }
  if (!node.data || typeof node.data !== "object" || Array.isArray(node.data)) throw new Error("Invalid node data");
  const data: Record<string, string> = {};
  for (const [k, v] of Object.entries(node.data)) {
    if (k.length > 50 || typeof v !== "string") throw new Error("Invalid node data");
    if (isDataImage(v) ? !legacy.has(v) : v.length > MAX_FIELD_CHARS) throw new Error("Invalid node data");
    data[k] = v;
  }
  return { id: node.id, type: node.type, x: node.x, y: node.y, data };
}

function cleanWires(wires: unknown, nodeIds: Set<string>): MoodWire[] {
  if (!Array.isArray(wires) || wires.length > MAX_WIRES) throw new Error("Invalid wires");
  return wires.map((w: MoodWire) => {
    if (!w || !isId(w.id) || !isId(w.from) || !isId(w.to)) throw new Error("Invalid wire");
    return { id: w.id, from: w.from, to: w.to };
  // A wire to a missing node would render nowhere; drop it rather than reject the save.
  }).filter((w) => nodeIds.has(w.from) && nodeIds.has(w.to));
}

/* ---------- Actions ---------- */

export type SavedMoodboard = Moodboard & { updatedAt: number };

export async function getMoodboardForEntry(entryId: string): Promise<SavedMoodboard | null> {
  const id = await requireOwnedEntry(entryId);
  const [row] = await db.select().from(moodboards).where(eq(moodboards.entryId, id));
  return row ? { nodes: row.nodes, wires: row.wires, updatedAt: row.updatedAt.getTime() } : null;
}

export async function saveMoodboard(entryId: string, nodes: MoodNode[], wires: MoodWire[]): Promise<{ updatedAt: number }> {
  const id = await requireOwnedEntry(entryId);
  if (!Array.isArray(nodes) || nodes.length > MAX_NODES) throw new Error("Invalid nodes");
  const [stored] = await db.select({ nodes: moodboards.nodes }).from(moodboards).where(eq(moodboards.entryId, id));
  const legacy = new Set((stored?.nodes ?? []).flatMap((n) => Object.values(n.data ?? {}).filter(isDataImage)));
  const cleanNodes = nodes.map((n) => cleanNode(n, legacy));
  const cleanW = cleanWires(wires, new Set(cleanNodes.map((n) => n.id)));

  const now = new Date();
  await db.insert(moodboards)
    .values({ entryId: id, nodes: cleanNodes, wires: cleanW, updatedAt: now })
    .onConflictDoUpdate({ target: moodboards.entryId, set: { nodes: cleanNodes, wires: cleanW, updatedAt: now } });
  return { updatedAt: now.getTime() };
}
