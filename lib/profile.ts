import { and, asc, desc, eq, inArray, isNull, sql } from "drizzle-orm";
import { db, entries, forumPosts, forumThreads, moodboards, products, profilePins, users } from "@/lib/db";
import { toEntry } from "@/lib/entries-db";
import { titleHref } from "@/lib/anilist-shared";
import { publicFieldsOf, type Entry, type Moodboard, type PinKind, type PublicFields } from "@/lib/types";
import { avatarOf } from "@/lib/users-db";

// Server-only reads behind the profile pages. Privacy is decided here, once: callers pass the
// viewer and get back only what that viewer may see.

export type ProfileUser = {
  id: string; username: string; displayName: string; avatar: string | null;
  pronouns: string | null; bio: string | null; isProfilePublic: boolean; publicFields: PublicFields;
  isAdmin: boolean; joined: Date;
};

export async function getProfileUser(username: string): Promise<ProfileUser | null> {
  if (!/^[a-z0-9_]{3,20}$/.test(username)) return null;
  const [u] = await db.select().from(users).where(eq(users.username, username)).limit(1);
  if (!u || !u.username) return null;
  return {
    id: u.id, username: u.username, displayName: u.displayName, avatar: avatarOf(u), pronouns: u.pronouns, bio: u.bio,
    isProfilePublic: u.isProfilePublic, publicFields: publicFieldsOf(u.publicFields), isAdmin: u.isAdmin, joined: u.createdAt,
  };
}

// What `viewerId` may see of `user`: everything for the owner, nothing of a private profile,
// otherwise the sections the owner left visible.
export function visibility(user: ProfileUser, viewerId: string | null) {
  const owner = viewerId === user.id;
  const open = owner || user.isProfilePublic;
  const can = (field: keyof PublicFields) => owner || (user.isProfilePublic && user.publicFields[field]);
  return { owner, open, can };
}

export async function getProfileEntries(userId: string): Promise<Entry[]> {
  const rows = await db.select().from(entries).where(eq(entries.userId, userId)).orderBy(desc(entries.rating), desc(entries.updatedAt));
  return rows.map(toEntry);
}

export const entryHref = (e: Pick<Entry, "type" | "anilistId">) => (e.anilistId != null ? titleHref(e.type, e.anilistId) : null);

export type ProfileBoard = { entryId: string; title: string; type: Entry["type"]; cover: string; board: Moodboard; updatedAt: Date };

// The user's moodboards that have something on them, newest first.
export async function getProfileBoards(userId: string): Promise<ProfileBoard[]> {
  const rows = await db
    .select({ entryId: entries.id, title: entries.title, type: entries.type, cover: entries.imageUrl, nodes: moodboards.nodes, wires: moodboards.wires, updatedAt: moodboards.updatedAt })
    .from(moodboards).innerJoin(entries, eq(moodboards.entryId, entries.id))
    .where(and(eq(entries.userId, userId), sql`jsonb_array_length(${moodboards.nodes}) > 0`))
    .orderBy(desc(moodboards.updatedAt));
  return rows.map(({ nodes, wires, ...r }) => ({ ...r, board: { nodes, wires } }));
}

export type ProfileForumItem = {
  postId: string; threadId: string; threadTitle: string; cat: string; isThread: boolean;
  body: string; score: number; replyCount: number; createdAt: Date;
};

// The user's recent threads and replies (deleted ones left out).
export async function getProfileForum(userId: string, limit = 30): Promise<ProfileForumItem[]> {
  return db
    .select({
      postId: forumPosts.id, threadId: forumThreads.id, threadTitle: forumThreads.title, cat: forumThreads.cat,
      isThread: sql<boolean>`${forumPosts.depth} = 0`, body: forumPosts.body, score: forumPosts.score,
      replyCount: forumThreads.replyCount, createdAt: forumPosts.createdAt,
    })
    .from(forumPosts).innerJoin(forumThreads, eq(forumPosts.threadId, forumThreads.id))
    .where(and(eq(forumPosts.userId, userId), isNull(forumPosts.deletedAt), isNull(forumThreads.deletedAt)))
    .orderBy(desc(forumPosts.createdAt)).limit(limit);
}

export type ResolvedPin = {
  id: string; kind: PinKind; targetId: string;
  title: string; sub: string; href: string | null;
  image: string | null; glyph: string; accent: string;
  board?: Moodboard;
};

const KIND_ACCENT: Record<Entry["type"], string> = { anime: "anime", manga: "manga", webtoon: "webtoon", novel: "novel" };
const STATUS: Record<Entry["status"], string> = { completed: "Completed", watching: "In progress", "on-hold": "On hold", "plan-to": "Planned", dropped: "Dropped" };

// The user's pins in profile order, each resolved to something drawable. Pins whose target has
// been deleted are skipped. `show` hides whole kinds from visitors (see visibility()).
export async function getResolvedPins(userId: string, show: { entries: boolean; moodboards: boolean } = { entries: true, moodboards: true }): Promise<ResolvedPin[]> {
  const pins = await db.select().from(profilePins).where(eq(profilePins.userId, userId)).orderBy(asc(profilePins.position), asc(profilePins.addedAt));
  if (!pins.length) return [];
  const ids = (kind: PinKind) => pins.filter((p) => p.kind === kind).map((p) => p.targetId);
  const entryIds = [...new Set([...ids("entry"), ...ids("moodboard")])];
  const [entryRows, boardRows, threadRows, productRows] = await Promise.all([
    entryIds.length ? db.select().from(entries).where(and(inArray(entries.id, entryIds), eq(entries.userId, userId))) : [],
    ids("moodboard").length ? db.select().from(moodboards).where(inArray(moodboards.entryId, ids("moodboard"))) : [],
    ids("forum_thread").length ? db.select().from(forumThreads).where(and(inArray(forumThreads.id, ids("forum_thread")), isNull(forumThreads.deletedAt))) : [],
    ids("product").length ? db.select().from(products).where(inArray(products.id, ids("product"))) : [],
  ]);
  const entryBy = new Map(entryRows.map((e) => [e.id, e]));
  const boardBy = new Map(boardRows.map((b) => [b.entryId, b]));
  const threadBy = new Map(threadRows.map((t) => [t.id, t]));
  const productBy = new Map(productRows.map((p) => [p.id, p]));

  return pins.flatMap((p): ResolvedPin[] => {
    const base = { id: p.id, kind: p.kind, targetId: p.targetId };
    if (p.kind === "entry") {
      const e = entryBy.get(p.targetId);
      if (!e || !show.entries) return [];
      return [{ ...base, title: e.title, sub: `${e.type} · ${STATUS[e.status]}`, href: entryHref({ type: e.type, anilistId: e.anilistId ?? undefined }), image: e.imageUrl || null, glyph: e.title.charAt(0), accent: KIND_ACCENT[e.type] }];
    }
    if (p.kind === "moodboard") {
      const e = entryBy.get(p.targetId), b = boardBy.get(p.targetId);
      if (!e || !b || !show.moodboards) return [];
      return [{ ...base, title: e.title, sub: `Moodboard · ${b.nodes.length} node${b.nodes.length === 1 ? "" : "s"}`, href: `/boards/${e.id}`, image: e.imageUrl || null, glyph: "盤", accent: "acc-3", board: { nodes: b.nodes, wires: b.wires } }];
    }
    if (p.kind === "forum_thread") {
      const t = threadBy.get(p.targetId);
      if (!t) return [];
      return [{ ...base, title: t.title, sub: `Thread · ${t.replyCount} repl${t.replyCount === 1 ? "y" : "ies"}`, href: `/forum/${t.id}`, image: null, glyph: "話", accent: "azure" }];
    }
    const pr = productBy.get(p.targetId);
    if (!pr) return [];
    return [{ ...base, title: pr.title, sub: `Store · ${pr.series}`, href: `/store/${pr.id}`, image: pr.imageUrl, glyph: pr.glyph, accent: "gold" }];
  });
}

// When a recently changed username can be changed again (ISO date), or null when it can be
// changed now.
export function usernameLockedUntil(changedAt: Date | null, lockDays: number): string | null {
  if (!changedAt) return null;
  const next = changedAt.getTime() + lockDays * 86_400_000;
  return next > Date.now() ? new Date(next).toISOString() : null;
}
