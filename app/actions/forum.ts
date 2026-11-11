"use server";

import { headers } from "next/headers";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db, entries, forumPosts, forumReports, forumThreads, forumVotes, moodboards, users } from "@/lib/db";
import { listThreads } from "@/lib/forum";
import {
  POST_BODY_MAX, POST_IMAGES_MAX, THREAD_TITLE_MAX, isForumCategory, isForumSort, isReportReason, type ThreadPage,
} from "@/lib/forum-shared";
import { deleteImage, isOwnedUpload } from "@/lib/storage";

// Forum writes. Every action re-reads the session and, for moderation, the caller's admin flag
// from the database. They return result objects so the UI can show a readable message.

export type ForumResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const SIGN_IN = "Log in to do that.";
const FLOOD_MS = 8_000;

async function viewer() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const [u] = await db.select({ id: users.id, isAdmin: users.isAdmin }).from(users).where(eq(users.id, session.user.id));
  return u ?? null;
}

const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 100;
const cleanBody = (v: unknown) => (typeof v === "string" ? v.replace(/\r\n?/g, "\n").trim() : "");

function bodyProblem(body: string) {
  if (!body) return "Write something first.";
  if (body.length > POST_BODY_MAX) return `Posts can be at most ${POST_BODY_MAX.toLocaleString("en-US")} characters.`;
  return null;
}

function cleanImages(v: unknown, userId: string): string[] | null {
  if (v == null) return [];
  if (!Array.isArray(v) || v.length > POST_IMAGES_MAX) return null;
  if (!v.every((u) => typeof u === "string" && isOwnedUpload(u, userId))) return null;
  return [...new Set(v as string[])];
}

async function tooFast(userId: string) {
  const [last] = await db.select({ at: forumPosts.createdAt }).from(forumPosts).where(eq(forumPosts.userId, userId)).orderBy(desc(forumPosts.createdAt)).limit(1);
  return !!last && Date.now() - last.at.getTime() < FLOOD_MS;
}

/* ---------- Reading (for "Load more" and the new-thread form) ---------- */

export async function loadThreads(cat: string | null, sort: string, page: number): Promise<ThreadPage | null> {
  if ((cat !== null && !isForumCategory(cat)) || !isForumSort(sort) || !Number.isInteger(page) || page < 1 || page > 500) return null;
  const me = await viewer();
  return listThreads({ cat: cat ?? undefined, sort, page, viewerId: me?.id ?? null });
}

export type Attachable = { id: string; title: string; type: string; hasBoard: boolean };

// The caller's collection entries, for the "attach" pickers.
export async function getAttachables(): Promise<Attachable[]> {
  const me = await viewer();
  if (!me) return [];
  return db
    .select({ id: entries.id, title: entries.title, type: entries.type, hasBoard: sql<boolean>`coalesce(jsonb_array_length(${moodboards.nodes}) > 0, false)` })
    .from(entries).leftJoin(moodboards, eq(moodboards.entryId, entries.id))
    .where(eq(entries.userId, me.id)).orderBy(entries.title);
}

/* ---------- Threads and replies ---------- */

export type NewThreadInput = {
  title: string; body: string; cat: string; images?: string[];
  attachedEntryId?: string | null; attachedMoodboardEntryId?: string | null;
};

export async function createThread(input: NewThreadInput): Promise<ForumResult<{ threadId: string }>> {
  const me = await viewer();
  if (!me) return { ok: false, error: SIGN_IN };
  const title = typeof input?.title === "string" ? input.title.replace(/\s+/g, " ").trim() : "";
  const body = cleanBody(input?.body);
  if (!title) return { ok: false, error: "Give the thread a title." };
  if (title.length > THREAD_TITLE_MAX) return { ok: false, error: `Titles can be at most ${THREAD_TITLE_MAX} characters.` };
  const problem = bodyProblem(body);
  if (problem) return { ok: false, error: problem };
  if (!isForumCategory(input.cat)) return { ok: false, error: "Pick a category." };
  const images = cleanImages(input.images, me.id);
  if (!images) return { ok: false, error: `Attach up to ${POST_IMAGES_MAX} images you uploaded here.` };

  // Attachments must be the author's own entries; a shared moodboard needs something on it.
  let attachedEntryId: string | null = null, attachedMoodboardEntryId: string | null = null;
  if (input.attachedEntryId) {
    if (!isId(input.attachedEntryId)) return { ok: false, error: "That title can't be attached." };
    const [e] = await db.select({ id: entries.id }).from(entries).where(and(eq(entries.id, input.attachedEntryId), eq(entries.userId, me.id)));
    if (!e) return { ok: false, error: "That title isn't in your collection." };
    attachedEntryId = e.id;
  }
  if (input.attachedMoodboardEntryId) {
    if (!isId(input.attachedMoodboardEntryId)) return { ok: false, error: "That moodboard can't be attached." };
    const [b] = await db.select({ id: entries.id, nodes: moodboards.nodes }).from(entries).innerJoin(moodboards, eq(moodboards.entryId, entries.id))
      .where(and(eq(entries.id, input.attachedMoodboardEntryId), eq(entries.userId, me.id)));
    if (!b || !b.nodes.length) return { ok: false, error: "That moodboard is empty. Add something to it first." };
    attachedMoodboardEntryId = b.id;
  }
  if (await tooFast(me.id)) return { ok: false, error: "You're posting very quickly. Wait a few seconds and try again." };

  const threadId = await db.transaction(async (tx) => {
    const [t] = await tx.insert(forumThreads).values({ userId: me.id, cat: input.cat, title, body }).returning({ id: forumThreads.id });
    await tx.insert(forumPosts).values({ threadId: t.id, userId: me.id, body, depth: 0, images, attachedEntryId, attachedMoodboardEntryId });
    return t.id;
  });
  return { ok: true, threadId };
}

export async function createReply(input: { threadId: string; parentId?: string | null; body: string; images?: string[] }): Promise<ForumResult<{ postId: string }>> {
  const me = await viewer();
  if (!me) return { ok: false, error: SIGN_IN };
  if (!isId(input?.threadId)) return { ok: false, error: "Thread not found." };
  const body = cleanBody(input.body);
  const problem = bodyProblem(body);
  if (problem) return { ok: false, error: problem };
  const images = cleanImages(input.images, me.id);
  if (!images) return { ok: false, error: `Attach up to ${POST_IMAGES_MAX} images you uploaded here.` };

  const [thread] = await db.select({ id: forumThreads.id, deletedAt: forumThreads.deletedAt }).from(forumThreads).where(eq(forumThreads.id, input.threadId));
  if (!thread) return { ok: false, error: "Thread not found." };
  if (thread.deletedAt) return { ok: false, error: "This thread was deleted and can't take new replies." };

  // Replies nest two deep: a reply to a reply-of-a-reply joins its parent's level.
  let depth = 1, parentId: string | null = null;
  if (input.parentId) {
    if (!isId(input.parentId)) return { ok: false, error: "That post can't be replied to." };
    const [parent] = await db.select({ id: forumPosts.id, depth: forumPosts.depth, parentId: forumPosts.parentId, deletedAt: forumPosts.deletedAt })
      .from(forumPosts).where(and(eq(forumPosts.id, input.parentId), eq(forumPosts.threadId, thread.id)));
    if (!parent) return { ok: false, error: "That post can't be replied to." };
    if (parent.depth === 1) { depth = 2; parentId = parent.id; }
    else if (parent.depth === 2) { depth = 2; parentId = parent.parentId; }
  }
  if (await tooFast(me.id)) return { ok: false, error: "You're posting very quickly. Wait a few seconds and try again." };

  const postId = await db.transaction(async (tx) => {
    const [p] = await tx.insert(forumPosts).values({ threadId: thread.id, userId: me.id, body, depth, parentId, images }).returning({ id: forumPosts.id });
    await tx.update(forumThreads).set({ replyCount: sql`${forumThreads.replyCount} + 1`, lastActivityAt: new Date() }).where(eq(forumThreads.id, thread.id));
    return p.id;
  });
  return { ok: true, postId };
}

export async function editPost(input: { postId: string; body: string; title?: string }): Promise<ForumResult> {
  const me = await viewer();
  if (!me) return { ok: false, error: SIGN_IN };
  if (!isId(input?.postId)) return { ok: false, error: "Post not found." };
  const body = cleanBody(input.body);
  const problem = bodyProblem(body);
  if (problem) return { ok: false, error: problem };
  const [post] = await db.select().from(forumPosts).where(eq(forumPosts.id, input.postId));
  if (!post || post.deletedAt) return { ok: false, error: "Post not found." };
  if (post.userId !== me.id) return { ok: false, error: "You can only edit your own posts." };
  let title: string | undefined;
  if (post.depth === 0 && input.title !== undefined) {
    title = typeof input.title === "string" ? input.title.replace(/\s+/g, " ").trim() : "";
    if (!title) return { ok: false, error: "Give the thread a title." };
    if (title.length > THREAD_TITLE_MAX) return { ok: false, error: `Titles can be at most ${THREAD_TITLE_MAX} characters.` };
  }
  await db.transaction(async (tx) => {
    await tx.update(forumPosts).set({ body, editedAt: new Date() }).where(eq(forumPosts.id, post.id));
    if (post.depth === 0) await tx.update(forumThreads).set({ body, ...(title ? { title } : {}) }).where(eq(forumThreads.id, post.threadId));
  });
  return { ok: true };
}

// Soft delete: the row stays so replies keep their place, the text shows as "[deleted]" and the
// post's uploaded pictures are removed for good. Authors delete their own; moderators, any.
async function softDelete(postId: string, by: { id: string; isAdmin: boolean }): Promise<ForumResult> {
  const [post] = await db.select().from(forumPosts).where(eq(forumPosts.id, postId));
  if (!post || post.deletedAt) return { ok: false, error: "Post not found." };
  if (post.userId !== by.id && !by.isAdmin) return { ok: false, error: "You can only delete your own posts." };
  const now = new Date();
  await db.transaction(async (tx) => {
    await tx.update(forumPosts).set({ deletedAt: now, deletedBy: by.id, images: [], attachedEntryId: null, attachedMoodboardEntryId: null }).where(eq(forumPosts.id, post.id));
    if (post.depth === 0) await tx.update(forumThreads).set({ deletedAt: now, isPinned: false, pinnedAt: null }).where(eq(forumThreads.id, post.threadId));
    await tx.update(forumReports).set({ status: "actioned", resolvedBy: by.id, resolvedAt: now }).where(and(eq(forumReports.postId, post.id), eq(forumReports.status, "open")));
  });
  for (const url of post.images) {
    if (isOwnedUpload(url, post.userId)) await deleteImage(url).catch((err) => console.error("Couldn't delete a forum image:", err));
  }
  return { ok: true };
}

export async function deletePost(postId: string): Promise<ForumResult> {
  const me = await viewer();
  if (!me) return { ok: false, error: SIGN_IN };
  if (!isId(postId)) return { ok: false, error: "Post not found." };
  return softDelete(postId, me);
}

/* ---------- Votes ---------- */

// value: 1 upvote, -1 downvote, 0 clears the caller's vote. One vote per user per post.
export async function votePost(postId: string, value: number): Promise<ForumResult<{ score: number; myVote: number }>> {
  const me = await viewer();
  if (!me) return { ok: false, error: "Log in to vote." };
  if (!isId(postId) || ![1, 0, -1].includes(value)) return { ok: false, error: "That vote didn't register." };
  const [post] = await db.select({ id: forumPosts.id, depth: forumPosts.depth, threadId: forumPosts.threadId, deletedAt: forumPosts.deletedAt }).from(forumPosts).where(eq(forumPosts.id, postId));
  if (!post || post.deletedAt) return { ok: false, error: "Post not found." };
  const score = await db.transaction(async (tx) => {
    if (value === 0) await tx.delete(forumVotes).where(and(eq(forumVotes.postId, postId), eq(forumVotes.userId, me.id)));
    else await tx.insert(forumVotes).values({ postId, userId: me.id, value }).onConflictDoUpdate({ target: [forumVotes.postId, forumVotes.userId], set: { value } });
    // Recount instead of adding a delta, so the score can never drift from the votes.
    const [{ total }] = await tx.select({ total: sql<number>`coalesce(sum(${forumVotes.value}), 0)::int` }).from(forumVotes).where(eq(forumVotes.postId, postId));
    await tx.update(forumPosts).set({ score: total }).where(eq(forumPosts.id, postId));
    if (post.depth === 0) await tx.update(forumThreads).set({ score: total }).where(eq(forumThreads.id, post.threadId));
    return total;
  });
  return { ok: true, score, myVote: value };
}

/* ---------- Moderation ---------- */

export async function togglePinThread(threadId: string): Promise<ForumResult<{ isPinned: boolean }>> {
  const me = await viewer();
  if (!me?.isAdmin) return { ok: false, error: "Only moderators can pin threads." };
  if (!isId(threadId)) return { ok: false, error: "Thread not found." };
  const [t] = await db.select({ isPinned: forumThreads.isPinned }).from(forumThreads).where(and(eq(forumThreads.id, threadId), isNull(forumThreads.deletedAt)));
  if (!t) return { ok: false, error: "Thread not found." };
  await db.update(forumThreads).set({ isPinned: !t.isPinned, pinnedAt: t.isPinned ? null : new Date() }).where(eq(forumThreads.id, threadId));
  return { ok: true, isPinned: !t.isPinned };
}

export async function reportPost(input: { postId: string; reason: string; details?: string }): Promise<ForumResult> {
  const me = await viewer();
  if (!me) return { ok: false, error: "Log in to report a post." };
  if (!isId(input?.postId) || !isReportReason(input.reason)) return { ok: false, error: "Pick a reason." };
  const details = typeof input.details === "string" ? input.details.trim().slice(0, 1000) : "";
  const [post] = await db.select({ userId: forumPosts.userId, deletedAt: forumPosts.deletedAt }).from(forumPosts).where(eq(forumPosts.id, input.postId));
  if (!post || post.deletedAt) return { ok: false, error: "Post not found." };
  if (post.userId === me.id) return { ok: false, error: "That's your own post. You can edit or delete it instead." };
  // One report per person per post; reporting again is a no-op rather than an error.
  await db.insert(forumReports).values({ postId: input.postId, reporterId: me.id, reason: input.reason, details }).onConflictDoNothing();
  return { ok: true };
}

export async function resolveReport(reportId: string, action: "dismiss" | "delete"): Promise<ForumResult> {
  const me = await viewer();
  if (!me?.isAdmin) return { ok: false, error: "Only moderators can review reports." };
  if (!isId(reportId) || (action !== "dismiss" && action !== "delete")) return { ok: false, error: "Report not found." };
  const [report] = await db.select().from(forumReports).where(eq(forumReports.id, reportId));
  if (!report) return { ok: false, error: "Report not found." };
  if (action === "delete") {
    const res = await softDelete(report.postId, me);
    // Already deleted by someone else: still close the report.
    if (!res.ok && res.error !== "Post not found.") return res;
  }
  await db.update(forumReports).set({ status: action === "delete" ? "actioned" : "dismissed", resolvedBy: me.id, resolvedAt: new Date() })
    .where(and(eq(forumReports.id, reportId), eq(forumReports.status, "open")));
  return { ok: true };
}
