"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import AuthorLink from "@/app/_components/AuthorLink";
import BoardPreview from "@/app/_components/BoardPreview";
import PinButton from "@/app/_components/PinButton";
import ShareButton from "@/app/_components/ShareButton";
import ThemedSelect from "@/app/_components/ThemedSelect";
import TimeAgo from "@/app/_components/TimeAgo";
import { createReply, deletePost, editPost, reportPost, togglePinThread } from "@/app/actions/forum";
import {
  FORUM_CATEGORY_LABEL, REPLY_VISUAL_DEPTH, REPORT_REASONS, THREAD_TITLE_MAX, buildReplyTree,
  type ForumAuthor, type ForumPostView, type ForumViewer, type ReplyNode, type ReportReason, type ThreadView,
} from "@/lib/forum-shared";
import { Markdown } from "@/lib/markdown";
import Composer from "./Composer";
import VoteButtons from "./VoteButtons";

type Mode = null | "edit" | "delete" | "report" | "reported";
const FAILED = { ok: false as const, error: "That didn't go through. Check your connection and try again." };

// Thread-wide state shared by every post: which post has the (single) open reply form, and which
// reply was just posted so it can be scrolled to and focused once the refreshed tree shows it.
type ThreadState = {
  thread: ThreadView; viewer: ForumViewer; opId: string | null;
  replyingTo: string | null; setReplyingTo: (postId: string | null) => void;
  justPosted: string | null; posted: (postId: string) => void;
};
const ThreadContext = createContext<ThreadState | null>(null);
const useThread = () => useContext(ThreadContext)!;

const focusHref = (threadId: string, postId: string) => `/forum/${threadId}?comment=${encodeURIComponent(postId)}`;
const handle = (a: ForumAuthor | null) => (a ? `@${a.username ?? a.name}` : "[deleted]");
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function ReplyForm({ formId, parentId, replyTo, onDone, onCancel, autoFocus = false }: {
  formId: string; parentId: string | null; replyTo?: ForumAuthor | null; onDone: (postId: string) => void; onCancel?: () => void; autoFocus?: boolean;
}) {
  const { thread } = useThread();
  const [body, setBody] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return setError("Write something first.");
    setBusy(true); setError(null);
    const res = await createReply({ threadId: thread.id, parentId, body, images }).catch(() => FAILED);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setBody(""); setImages([]);
    onDone(res.postId);
  };
  return (
    <form className="fp-form" onSubmit={submit}>
      {replyTo !== undefined && <p className="fp-replying">Replying to <strong>{handle(replyTo)}</strong></p>}
      <Composer id={`reply-${formId}`} label={onCancel ? "Your reply" : "Add a reply"} value={body} onChange={setBody} images={images} onImages={setImages} rows={onCancel ? 4 : 6} placeholder="Markdown works." autoFocus={autoFocus} />
      {error && <div className="ov-error" role="alert">{error}</div>}
      <div className="ov-row">
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Posting…" : "Post reply"}</button>
        {onCancel && <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}

// One post. Replies (with a `node`) can be folded down to their byline with the [–] toggle; the
// opening post can't. The inline reply form for a reply is drawn by <Comment>, one level deeper.
function Post({ post, node, collapsed = false, onToggle }: { post: ForumPostView; node?: ReplyNode; collapsed?: boolean; onToggle?: () => void }) {
  const router = useRouter();
  const { thread, viewer, opId, replyingTo, setReplyingTo, justPosted, posted } = useThread();
  const ref = useRef<HTMLElement>(null);
  const [mode, setMode] = useState<Mode>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState(post.body ?? "");
  const [title, setTitle] = useState(thread.title);
  const [reason, setReason] = useState<ReportReason>("spam");
  const [details, setDetails] = useState("");
  const isRoot = post.depth === 0;
  const canDelete = !post.deleted && (post.mine || !!viewer?.isAdmin);
  const open = (m: Mode) => { setError(null); setMode(mode === m ? null : m); };
  const replying = replyingTo === post.id;
  const who = post.author?.name ?? "[deleted]";

  // A reply this viewer just posted: bring it into view and put focus on it, since the form the
  // focus was in has closed.
  const isNew = justPosted === post.id;
  useEffect(() => {
    if (!isNew || !ref.current) return;
    ref.current.focus({ preventScroll: true });
    ref.current.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [isNew]);

  const run = async (fn: () => Promise<{ ok: true } | { ok: false; error: string }>, then: () => void) => {
    setBusy(true); setError(null);
    const res = await fn().catch(() => FAILED);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    then();
  };
  const saveEdit = (e: React.FormEvent) => {
    e.preventDefault();
    void run(() => editPost({ postId: post.id, body: draft, ...(isRoot ? { title } : {}) }), () => { setMode(null); router.refresh(); });
  };
  const remove = () => run(() => deletePost(post.id), () => { setMode(null); router.refresh(); });
  const report = (e: React.FormEvent) => {
    e.preventDefault();
    void run(() => reportPost({ postId: post.id, reason, details }), () => setMode("reported"));
  };

  return (
    <article
      ref={ref} tabIndex={isNew ? -1 : undefined}
      className={`fp${isRoot ? " fp-root" : ""}${post.deleted ? " fp-gone" : ""}${collapsed ? " fp-folded" : ""}${isNew ? " fp-new" : ""} ov-panel`}
      id={`post-${post.id}`} data-depth={post.depth} aria-label={isRoot ? undefined : `Reply by ${who}`}
    >
      <VoteButtons postId={post.id} score={post.score} myVote={post.myVote} disabled={post.deleted} />
      <div className="fp-main">
        <div className="fp-by">
          {node && onToggle && (
            <button type="button" className="fp-toggle" aria-expanded={!collapsed} aria-controls={`fold-${post.id}`} aria-label={`${collapsed ? "Expand" : "Collapse"} reply by ${who}`} onClick={onToggle}>
              <span aria-hidden="true">{collapsed ? "[+]" : "[–]"}</span>
            </button>
          )}
          {post.author ? <AuthorLink author={post.author} /> : <span className="au au-gone">[deleted]</span>}
          {post.author && !isRoot && post.author.id === opId && <span className="fp-flag">OP</span>}
          {post.author?.isAdmin && <span className="fp-flag mod">Mod</span>}
          <TimeAgo className="fp-time" date={post.createdAt} />
          {post.editedAt && <span className="fp-time">edited <TimeAgo date={post.editedAt} /></span>}
          {collapsed && node && <span className="fp-hidden">{node.descendants ? `${plural(node.descendants, "reply", "replies")} hidden` : "collapsed"}</span>}
        </div>

        {/* Kept mounted while folded so a half-written edit or report survives collapsing. */}
        <div className="fp-fold" id={`fold-${post.id}`} hidden={collapsed}>

          {mode === "edit" ? (
            <form className="fp-form" onSubmit={saveEdit}>
              {isRoot && (
                <div className="ov-field">
                  <label className="ov-label" htmlFor={`title-${post.id}`}>Title</label>
                  <input id={`title-${post.id}`} className="ov-input" value={title} maxLength={THREAD_TITLE_MAX} onChange={(e) => setTitle(e.target.value)} />
                </div>
              )}
              <Composer id={`edit-${post.id}`} label="Edit post" value={draft} onChange={setDraft} rows={isRoot ? 8 : 4} autoFocus />
              {error && <div className="ov-error" role="alert">{error}</div>}
              <div className="ov-row">
                <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Saving…" : "Save changes"}</button>
                <button type="button" className="btn btn-ghost" onClick={() => { setDraft(post.body ?? ""); setTitle(thread.title); setMode(null); }}>Cancel</button>
              </div>
            </form>
          ) : post.deleted ? (
            <p className="fp-deleted">[deleted]</p>
          ) : (
            <>
              <Markdown text={post.body ?? ""} className="fp-body" />
              {post.images.length > 0 && (
                <div className="fp-images" data-count={post.images.length}>
                  {post.images.map((url) => (
                    // eslint-disable-next-line @next/next/no-img-element -- user uploads; sizes unknown
                    <a key={url} href={url} target="_blank" rel="noopener"><img src={url} alt="Image attached to this post" loading="lazy" /></a>
                  ))}
                </div>
              )}
              {post.entry && (() => {
                const e = post.entry;
                const card = (
                  <>
                    <span className="fp-entry-art" style={e.image ? { backgroundImage: `url(${JSON.stringify(e.image)})` } : undefined} aria-hidden="true">{e.image ? "" : e.title.charAt(0)}</span>
                    <span className="fp-entry-text"><span className="fp-entry-kind">{e.type} · from {post.author?.name}&apos;s collection</span><span className="fp-entry-title">{e.title}</span></span>
                  </>
                );
                return e.href ? <Link className="fp-entry" href={e.href}>{card}</Link> : <div className="fp-entry">{card}</div>;
              })()}
              {post.board && (
                <figure className="fp-board">
                  <Link href={`/boards/${post.board.entryId}`} aria-label={`Open the ${post.board.title} moodboard`}><BoardPreview board={post.board} /></Link>
                  <figcaption>
                    <span><strong>{post.board.title}</strong> moodboard by <AuthorLink author={post.board.owner} handle={false} /></span>
                    <Link className="ov-link" href={`/boards/${post.board.entryId}`}>Open full board</Link>
                  </figcaption>
                </figure>
              )}
            </>
          )}

          {!post.deleted && mode !== "edit" && (
            <div className="fp-actions">
              {!thread.deleted && (viewer
                ? <button type="button" className="fp-act" aria-expanded={replying} onClick={() => setReplyingTo(replying ? null : post.id)}>Reply</button>
                : <Link className="fp-act" href={`/login?redirect=/forum/${thread.id}`}>Log in to reply</Link>)}
              {post.mine && <button type="button" className="fp-act" onClick={() => open("edit")}>Edit</button>}
              {canDelete && <button type="button" className="fp-act danger" aria-expanded={mode === "delete"} onClick={() => open("delete")}>Delete</button>}
              {viewer && !post.mine && <button type="button" className="fp-act" aria-expanded={mode === "report"} onClick={() => open("report")}>{mode === "reported" ? "Reported" : "Report"}</button>}
            </div>
          )}

          {isRoot && replying && (
            <ReplyForm formId="root" parentId={null} replyTo={post.author} autoFocus onCancel={() => setReplyingTo(null)}
              onDone={(id) => { setReplyingTo(null); posted(id); router.refresh(); }} />
          )}
          {mode === "delete" && (
            <div className="fp-confirm" role="alertdialog" aria-label="Delete post">
              <p>{isRoot ? "Delete this thread? It leaves the forum list, and your post shows as “[deleted]” above the replies." : "Delete this post? It will show as “[deleted]” so the replies under it still make sense."}{!post.mine && " You are deleting it as a moderator."}</p>
              {error && <div className="ov-error" role="alert">{error}</div>}
              <div className="ov-row">
                <button type="button" className="btn btn-primary" disabled={busy} onClick={remove}>{busy ? "Deleting…" : isRoot ? "Delete thread" : "Delete post"}</button>
                <button type="button" className="btn btn-ghost" onClick={() => setMode(null)}>Keep it</button>
              </div>
            </div>
          )}
          {mode === "report" && (
            <form className="fp-confirm" onSubmit={report}>
              <div className="ov-field">
                <span className="ov-label" id={`why-${post.id}`}>Why are you reporting this?</span>
                <ThemedSelect variant="field" value={reason} onChange={setReason} options={REPORT_REASONS} aria-labelledby={`why-${post.id}`} />
              </div>
              <div className="ov-field">
                <label className="ov-label" htmlFor={`more-${post.id}`}>Anything the moderators should know (optional)</label>
                <textarea id={`more-${post.id}`} className="ov-input" rows={2} maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)} />
              </div>
              {error && <div className="ov-error" role="alert">{error}</div>}
              <div className="ov-row">
                <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Sending…" : "Send report"}</button>
                <button type="button" className="btn btn-ghost" onClick={() => setMode(null)}>Cancel</button>
              </div>
            </form>
          )}
          {mode === "reported" && <div className="ov-ok" role="status">Reported. The moderators will take a look; the author isn&apos;t told who reported them.</div>}
        </div>
      </div>
    </article>
  );
}

// A reply and its subtree, Reddit style: the replies (and this reply's open reply form) sit one
// level deeper behind a thin thread line that folds the whole subtree when clicked. Past
// REPLY_VISUAL_DEPTH levels (counted from `base`, the level this view starts at) the subtree is
// left to a "Continue this thread" page focused on it.
function Comment({ node, base }: { node: ReplyNode; base: number }) {
  const router = useRouter();
  const { thread, replyingTo, setReplyingTo, posted } = useThread();
  const [collapsed, setCollapsed] = useState(false);
  const { post, children } = node;
  const toggle = () => setCollapsed((c) => !c);
  const replying = replyingTo === post.id;
  const atCap = node.level - base >= REPLY_VISUAL_DEPTH - 1;
  const kidsId = `kids-${post.id}`;
  const continueHref = focusHref(thread.id, post.id);

  return (
    <div className="fp-node" data-level={node.level - base}>
      <Post post={post} node={node} collapsed={collapsed} onToggle={toggle} />
      {(children.length > 0 || replying) && (
        <div className="fp-children" id={kidsId} hidden={collapsed}>
          {/* The thread line. Mouse users click it; keyboard users have the [–] toggle above. */}
          <button type="button" className="fp-line" tabIndex={-1} aria-expanded={!collapsed} aria-controls={kidsId}
            aria-label={`Collapse reply by ${post.author?.name ?? "[deleted]"}`} onClick={toggle} />
          {replying && (
            <ReplyForm formId={post.id} parentId={post.id} replyTo={post.author} autoFocus onCancel={() => setReplyingTo(null)}
              onDone={(id) => {
                setReplyingTo(null); posted(id);
                // At the deepest drawn level the new reply wouldn't show here, so open its subtree page.
                if (atCap) router.push(`${continueHref}#post-${id}`);
                else router.refresh();
              }} />
          )}
          {children.length > 0 && (atCap
            ? <Link className="fp-continue" href={continueHref}>Continue this thread <span aria-hidden="true">→</span> <span className="fp-hidden">({plural(node.descendants, "more reply", "more replies")})</span></Link>
            : children.map((c) => <Comment key={c.post.id} node={c} base={base} />))}
        </div>
      )}
    </div>
  );
}

export default function ThreadClient({ thread, viewer, focusId = null }: { thread: ThreadView; viewer: ForumViewer; focusId?: string | null }) {
  const router = useRouter();
  const [pinned, setPinned] = useState(thread.isPinned);
  const [pinBusy, setPinBusy] = useState(false);
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [justPosted, setJustPosted] = useState<string | null>(null);
  // All posts arrive in one flat query; the tree is built here, in memory.
  const tree = useMemo(() => buildReplyTree(thread.posts), [thread.posts]);
  const { root } = tree;
  const opId = root?.author?.id ?? null;
  // "Continue this thread" view: one reply and its subtree, drawn as if it were top-level.
  const focus = focusId ? tree.byId.get(focusId) ?? null : null;
  const base = focus?.level ?? 0;
  const ctx = useMemo<ThreadState>(
    () => ({ thread, viewer, opId, replyingTo, setReplyingTo, justPosted, posted: setJustPosted }),
    [thread, viewer, opId, replyingTo, justPosted],
  );

  // A link to #post-<id> (a notification, a shared link) may point below the deepest drawn level.
  // Re-open the page focused a few levels above that reply so it shows with some context.
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash).replace(/^#post-/, "");
    const target = tree.byId.get(id);
    if (!target) return;
    let within = false;
    for (let n: ReplyNode | null = target; n; n = n.parent) if (!focus || n === focus) { within = true; break; }
    if (within && target.level - base < REPLY_VISUAL_DEPTH) return;
    let anchor = target;
    for (let i = 0; i < 3 && anchor.parent; i++) anchor = anchor.parent;
    router.replace(`${focusHref(thread.id, anchor.post.id)}#post-${id}`);
  }, [tree, focus, base, thread.id, router]);

  const pinToTop = async () => {
    setPinBusy(true);
    const res = await togglePinThread(thread.id).catch(() => FAILED);
    setPinBusy(false);
    if (res.ok) { setPinned(res.isPinned); router.refresh(); }
  };

  return (
    <ThreadContext value={ctx}>
      <div className="ov-page-head">
        <nav className="ov-crumbs" aria-label="Breadcrumb">
          <Link href="/forum">Forum</Link><span aria-hidden="true">/</span>
          <Link href={`/forum?cat=${thread.cat}`}>{FORUM_CATEGORY_LABEL[thread.cat] ?? thread.cat}</Link>
        </nav>
        <h1 className="ov-masthead ft-title">{thread.title}</h1>
        <div className="ov-row between" style={{ marginTop: ".9rem" }}>
          <span className="ov-meta">
            {pinned && "Pinned by a moderator · "}{thread.replyCount} repl{thread.replyCount === 1 ? "y" : "ies"} · {thread.viewCount.toLocaleString("en-US")} view{thread.viewCount === 1 ? "" : "s"}
          </span>
          {!thread.deleted && (
            <div className="ov-row">
              <PinButton kind="forum_thread" targetId={thread.id} label="this thread" className="btn btn-ghost" withText showSignedOut />
              {viewer?.isAdmin && <button type="button" className="btn btn-ghost" disabled={pinBusy} aria-pressed={pinned} onClick={pinToTop}>{pinned ? "Unpin from top" : "Pin to top"}</button>}
              <ShareButton />
            </div>
          )}
        </div>
      </div>

      {root && <Post post={root} />}

      <div className="ov-section-head fp-replies-head">
        <h2 className="ov-title">{focus ? "Single reply thread" : tree.top.length ? `${thread.replyCount} repl${thread.replyCount === 1 ? "y" : "ies"}` : "No replies yet"}</h2>
      </div>
      {focus ? (
        <>
          <nav className="fp-focus" aria-label="Thread navigation">
            <span>You&apos;re viewing one reply and the replies under it.</span>
            <Link className="ov-link" href={`/forum/${thread.id}`}>View all replies</Link>
            {focus.parent && <Link className="ov-link" href={focusHref(thread.id, focus.parent.post.id)}>Show parent reply</Link>}
          </nav>
          <div className="fp-list"><Comment node={focus} base={base} /></div>
        </>
      ) : (
        <div className="fp-list">{tree.top.map((n) => <Comment key={n.post.id} node={n} base={0} />)}</div>
      )}

      {thread.deleted ? (
        <div className="ov-empty" style={{ marginTop: "1.5rem" }}><strong>This thread was deleted</strong>It can&apos;t take new replies.</div>
      ) : viewer ? (
        <div className="ov-panel fp-compose"><ReplyForm formId="thread" parentId={null} onDone={(id) => { setJustPosted(id); router.refresh(); }} /></div>
      ) : (
        <div className="ov-panel fp-join"><strong>Join the conversation</strong><span><Link className="ov-link" href={`/login?redirect=/forum/${thread.id}`}>Log in</Link> to reply and vote.</span></div>
      )}
    </ThreadContext>
  );
}
