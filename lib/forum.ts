import { and, asc, desc, eq, inArray, isNull, sql, type SQL } from "drizzle-orm";
import { db, entries, forumPosts, forumThreads, forumVotes, moodboards, users } from "@/lib/db";
import { titleHref } from "@/lib/anilist-shared";
import { excerpt } from "@/lib/markdown";
import { avatarOf } from "@/lib/users-db";
import {
  THREADS_PER_PAGE, type AttachedBoard, type AttachedEntry, type ForumAuthor, type ForumCategoryId, type ForumPostView,
  type ForumSort, type ThreadPage, type ThreadView,
} from "@/lib/forum-shared";

// Server-only reads behind the forum pages.

type UserRow = typeof users.$inferSelect;
export const toAuthor = (u: Pick<UserRow, "id" | "displayName" | "username" | "avatar" | "avatarUrl" | "isAdmin">): ForumAuthor =>
  ({ id: u.id, name: u.displayName, username: u.username, avatar: avatarOf(u), isAdmin: u.isAdmin });

// Reddit's "hot": votes count logarithmically, and every 12.5 hours of age costs one order of
// magnitude of score, so new threads with a few votes outrank old ones with many.
const HOT: SQL = sql`(sign(${forumThreads.score}) * log(greatest(abs(${forumThreads.score}), 1)::numeric) + extract(epoch from ${forumThreads.createdAt}) / 45000)`;

const ORDER: Record<ForumSort, SQL[]> = {
  hot: [desc(HOT)],
  new: [desc(forumThreads.createdAt)],
  top: [desc(forumThreads.score), desc(forumThreads.createdAt)],
};

async function votesBy(viewerId: string | null, postIds: string[]) {
  if (!viewerId || !postIds.length) return new Map<string, number>();
  const rows = await db.select({ postId: forumVotes.postId, value: forumVotes.value }).from(forumVotes)
    .where(and(eq(forumVotes.userId, viewerId), inArray(forumVotes.postId, postIds)));
  return new Map(rows.map((r) => [r.postId, r.value]));
}

export async function listThreads({ cat, sort, page, viewerId }: { cat?: ForumCategoryId; sort: ForumSort; page: number; viewerId: string | null }): Promise<ThreadPage> {
  const where = and(isNull(forumThreads.deletedAt), cat ? eq(forumThreads.cat, cat) : undefined);
  const [rows, [{ total }]] = await Promise.all([
    db.select({ t: forumThreads, u: users, rootId: forumPosts.id, images: forumPosts.images })
      .from(forumThreads)
      .innerJoin(users, eq(forumThreads.userId, users.id))
      .innerJoin(forumPosts, and(eq(forumPosts.threadId, forumThreads.id), eq(forumPosts.depth, 0)))
      .where(where)
      // Threads pinned by a moderator stay on top, newest pin first.
      .orderBy(desc(forumThreads.isPinned), sql`${forumThreads.pinnedAt} desc nulls last`, ...ORDER[sort], asc(forumThreads.id))
      .limit(THREADS_PER_PAGE + 1).offset((page - 1) * THREADS_PER_PAGE),
    db.select({ total: sql<number>`count(*)::int` }).from(forumThreads).where(where),
  ]);
  const shown = rows.slice(0, THREADS_PER_PAGE);
  const votes = await votesBy(viewerId, shown.map((r) => r.rootId));
  return {
    total, hasNext: rows.length > THREADS_PER_PAGE,
    items: shown.map(({ t, u, rootId, images }) => ({
      id: t.id, rootPostId: rootId, cat: t.cat, title: t.title, excerpt: excerpt(t.body, 180),
      score: t.score, myVote: votes.get(rootId) ?? 0, replyCount: t.replyCount, viewCount: t.viewCount, imageCount: images.length,
      isPinned: t.isPinned, createdAt: t.createdAt.toISOString(), lastActivityAt: t.lastActivityAt.toISOString(), author: toAuthor(u),
    })),
  };
}

export async function forumCounts() {
  const [[t], [p], [m]] = await Promise.all([
    db.select({ n: sql<number>`count(*)::int` }).from(forumThreads).where(isNull(forumThreads.deletedAt)),
    db.select({ n: sql<number>`count(*)::int` }).from(forumPosts).where(isNull(forumPosts.deletedAt)),
    db.select({ n: sql<number>`count(distinct ${forumPosts.userId})::int` }).from(forumPosts).where(isNull(forumPosts.deletedAt)),
  ]);
  return { threads: t.n, posts: p.n, posters: m.n };
}

// A thread with every post in it, oldest first. Deleted posts keep their place but lose their
// text, pictures, attachments and author.
export async function getThread(threadId: string, viewerId: string | null): Promise<ThreadView | null> {
  if (!threadId || threadId.length > 100) return null;
  const [thread] = await db.select().from(forumThreads).where(eq(forumThreads.id, threadId)).limit(1);
  if (!thread) return null;
  const rows = await db.select({ p: forumPosts, u: users }).from(forumPosts).innerJoin(users, eq(forumPosts.userId, users.id))
    .where(eq(forumPosts.threadId, threadId)).orderBy(asc(forumPosts.createdAt), asc(forumPosts.id));
  const live = rows.filter((r) => !r.p.deletedAt);

  const entryIds = [...new Set(live.flatMap((r) => (r.p.attachedEntryId ? [r.p.attachedEntryId] : [])))];
  const boardIds = [...new Set(live.flatMap((r) => (r.p.attachedMoodboardEntryId ? [r.p.attachedMoodboardEntryId] : [])))];
  const [entryRows, boardRows, votes] = await Promise.all([
    entryIds.length ? db.select().from(entries).where(inArray(entries.id, entryIds)) : [],
    boardIds.length
      ? db.select({ entryId: entries.id, title: entries.title, nodes: moodboards.nodes, wires: moodboards.wires, owner: users })
          .from(moodboards).innerJoin(entries, eq(moodboards.entryId, entries.id)).innerJoin(users, eq(entries.userId, users.id))
          .where(inArray(moodboards.entryId, boardIds))
      : [],
    votesBy(viewerId, live.map((r) => r.p.id)),
  ]);
  const entryBy = new Map(entryRows.map((e): [string, AttachedEntry] => [e.id, {
    id: e.id, title: e.title, type: e.type, image: e.imageUrl, href: e.anilistId != null ? titleHref(e.type, e.anilistId) : null,
  }]));
  const boardBy = new Map(boardRows.map((b): [string, AttachedBoard] => [b.entryId, { entryId: b.entryId, title: b.title, owner: toAuthor(b.owner), nodes: b.nodes, wires: b.wires }]));

  const posts: ForumPostView[] = rows.map(({ p, u }) => {
    const deleted = !!p.deletedAt;
    return {
      id: p.id, depth: p.depth, parentId: p.parentId, deleted,
      body: deleted ? null : p.body, author: deleted ? null : toAuthor(u), images: deleted ? [] : p.images,
      score: p.score, myVote: votes.get(p.id) ?? 0, createdAt: p.createdAt.toISOString(), editedAt: deleted ? null : p.editedAt?.toISOString() ?? null,
      entry: (!deleted && p.attachedEntryId && entryBy.get(p.attachedEntryId)) || null,
      board: (!deleted && p.attachedMoodboardEntryId && boardBy.get(p.attachedMoodboardEntryId)) || null,
      mine: !deleted && viewerId === p.userId,
    };
  });
  const deleted = !!thread.deletedAt;
  return {
    id: thread.id, cat: thread.cat, title: deleted ? "[deleted]" : thread.title, deleted, isPinned: thread.isPinned,
    replyCount: thread.replyCount, viewCount: thread.viewCount, createdAt: thread.createdAt.toISOString(), posts,
  };
}

export async function countView(threadId: string) {
  await db.update(forumThreads).set({ viewCount: sql`${forumThreads.viewCount} + 1` }).where(eq(forumThreads.id, threadId));
}
