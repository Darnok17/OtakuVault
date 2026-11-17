// Forum constants shared by server and client. Pure — no imports.

export const FORUM_CATEGORIES = [
  { id: "general", color: "azure", label: "General", kanji: "雑談", blurb: "Anything that doesn't fit elsewhere" },
  { id: "anime", color: "anime", label: "Anime", kanji: "アニメ", blurb: "Episodes, seasons, studios" },
  { id: "manga", color: "manga", label: "Manga", kanji: "漫画", blurb: "Chapters, volumes, mangaka" },
  { id: "webtoons", color: "webtoon", label: "Webtoons", kanji: "ウェブ", blurb: "Manhwa, manhua and vertical scroll" },
  { id: "light-novels", color: "novel", label: "Light Novels", kanji: "小説", blurb: "Light and web novels" },
  { id: "recommendations", color: "gold", label: "Recommendations", kanji: "推薦", blurb: "Ask for or share what to pick up next" },
  { id: "moodboard-share", color: "acc-3", label: "Moodboard Share", kanji: "盤", blurb: "Show off a board you built" },
  { id: "store", color: "orange", label: "Store Discussion", kanji: "店", blurb: "Merch, drops and wishlists" },
  { id: "meta", color: "violet", label: "Meta", kanji: "運営", blurb: "About OtakuVault itself" },
] as const;

export type ForumCategoryId = (typeof FORUM_CATEGORIES)[number]["id"];
export const isForumCategory = (v: unknown): v is ForumCategoryId => FORUM_CATEGORIES.some((c) => c.id === v);
export const FORUM_CATEGORY_LABEL: Record<string, string> = Object.fromEntries(FORUM_CATEGORIES.map((c) => [c.id, c.label]));
export const FORUM_CATEGORY_COLOR: Record<string, string> = Object.fromEntries(FORUM_CATEGORIES.map((c) => [c.id, c.color]));

export const FORUM_SORTS = [
  { value: "hot", label: "Hot", hint: "Rising now" },
  { value: "new", label: "New", hint: "Latest first" },
  { value: "top", label: "Top", hint: "Most upvoted" },
] as const;
export type ForumSort = (typeof FORUM_SORTS)[number]["value"];
export const isForumSort = (v: unknown): v is ForumSort => FORUM_SORTS.some((s) => s.value === v);

export const THREAD_TITLE_MAX = 140;
export const POST_BODY_MAX = 10_000;
export const POST_IMAGES_MAX = 4;
export const THREADS_PER_PAGE = 20;

export const REPORT_REASONS = [
  { value: "spam", label: "Spam or advertising" },
  { value: "harassment", label: "Harassment or hate" },
  { value: "spoilers", label: "Untagged spoilers" },
  { value: "piracy", label: "Piracy links" },
  { value: "nsfw", label: "Explicit content" },
  { value: "other", label: "Something else" },
] as const;
export type ReportReason = (typeof REPORT_REASONS)[number]["value"];
export const isReportReason = (v: unknown): v is ReportReason => REPORT_REASONS.some((r) => r.value === v);

/* ---------- View models (plain data, safe to hand to client components) ---------- */

export type ForumAuthor = { id: string; name: string; username: string | null; avatar: string | null; isAdmin: boolean };

export type ThreadSummary = {
  id: string; rootPostId: string; cat: string; title: string; excerpt: string;
  score: number; myVote: number; replyCount: number; viewCount: number; imageCount: number;
  isPinned: boolean; createdAt: string; lastActivityAt: string; author: ForumAuthor;
};
export type ThreadPage = { items: ThreadSummary[]; hasNext: boolean; total: number };

export type AttachedEntry = { id: string; title: string; type: string; image: string; href: string | null };
export type AttachedBoard = {
  entryId: string; title: string; owner: ForumAuthor;
  nodes: import("./types").MoodNode[]; wires: import("./types").MoodWire[];
};

export type ForumPostView = {
  id: string; depth: number; parentId: string | null; deleted: boolean;
  // null once deleted: the text, pictures and author of a deleted post are not sent to anyone.
  body: string | null; author: ForumAuthor | null; images: string[];
  score: number; myVote: number; createdAt: string; editedAt: string | null;
  entry: AttachedEntry | null; board: AttachedBoard | null;
  mine: boolean;
};

export type ThreadView = {
  id: string; cat: string; title: string; deleted: boolean; isPinned: boolean;
  replyCount: number; viewCount: number; createdAt: string;
  posts: ForumPostView[];
};

export type ForumViewer = { id: string; isAdmin: boolean } | null;

/* ---------- Reply tree ---------- */

// How many reply levels a page draws before it links to "Continue this thread".
export const REPLY_VISUAL_DEPTH = 7;

export type ReplyNode = {
  post: ForumPostView;
  // 0 for a top-level reply, counted from the tree rather than the stored depth.
  level: number;
  parent: ReplyNode | null;
  children: ReplyNode[];
  // Every reply anywhere below this one.
  descendants: number;
};

// Turns a thread's flat, oldest-first post list into a reply tree in one pass. Replies whose
// parent is missing are shown at the top level rather than dropped. No recursion, so a very
// deep chain can't overflow the stack.
export function buildReplyTree(posts: ForumPostView[]): { root: ForumPostView | null; top: ReplyNode[]; byId: Map<string, ReplyNode> } {
  let root: ForumPostView | null = null;
  const byId = new Map<string, ReplyNode>();
  for (const post of posts) {
    if (post.depth === 0) root ??= post;
    else byId.set(post.id, { post, level: 0, parent: null, children: [], descendants: 0 });
  }
  const top: ReplyNode[] = [];
  for (const node of byId.values()) {
    const parent = node.post.parentId ? byId.get(node.post.parentId) : undefined;
    if (parent && parent !== node) { node.parent = parent; parent.children.push(node); }
    else top.push(node);
  }
  // Levels top-down in pre-order, then descendant counts bottom-up over the same order reversed.
  const order: ReplyNode[] = [];
  const stack = [...top];
  while (stack.length) {
    const node = stack.pop()!;
    order.push(node);
    for (const child of node.children) { child.level = node.level + 1; stack.push(child); }
  }
  for (let i = order.length - 1; i >= 0; i--) {
    const node = order[i];
    node.descendants = node.children.reduce((n, c) => n + 1 + c.descendants, 0);
  }
  return { root, top, byId };
}
