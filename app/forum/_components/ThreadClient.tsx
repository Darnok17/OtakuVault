"use client";

import { useState } from "react";
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
  FORUM_CATEGORY_LABEL, REPORT_REASONS, THREAD_TITLE_MAX, type ForumPostView, type ForumViewer, type ReportReason, type ThreadView,
} from "@/lib/forum-shared";
import { Markdown } from "@/lib/markdown";
import Composer from "./Composer";
import VoteButtons from "./VoteButtons";

type Mode = null | "reply" | "edit" | "delete" | "report" | "reported";
const FAILED = { ok: false as const, error: "That didn't go through. Check your connection and try again." };

function ReplyForm({ threadId, parentId, onDone, onCancel, autoFocus = false }: { threadId: string; parentId: string | null; onDone: () => void; onCancel?: () => void; autoFocus?: boolean }) {
  const [body, setBody] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!body.trim()) return setError("Write something first.");
    setBusy(true); setError(null);
    const res = await createReply({ threadId, parentId, body, images }).catch(() => FAILED);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    setBody(""); setImages([]);
    onDone();
  };
  return (
    <form className="fp-form" onSubmit={submit}>
      <Composer id={`reply-${parentId ?? "thread"}`} label={parentId ? "Your reply" : "Add a reply"} value={body} onChange={setBody} images={images} onImages={setImages} rows={parentId ? 4 : 6} placeholder="Markdown works." autoFocus={autoFocus} />
      {error && <div className="ov-error" role="alert">{error}</div>}
      <div className="ov-row">
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Posting…" : "Post reply"}</button>
        {onCancel && <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}

function Post({ post, thread, viewer, opId, children }: { post: ForumPostView; thread: ThreadView; viewer: ForumViewer; opId: string | null; children?: React.ReactNode }) {
  const router = useRouter();
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
    <article className={`fp${isRoot ? " fp-root" : ""}${post.deleted ? " fp-gone" : ""} ov-panel`} id={`post-${post.id}`} data-depth={post.depth}>
      <VoteButtons postId={post.id} score={post.score} myVote={post.myVote} disabled={post.deleted} />
      <div className="fp-main">
        <div className="fp-by">
          {post.author ? <AuthorLink author={post.author} /> : <span className="au au-gone">[deleted]</span>}
          {post.author && !isRoot && post.author.id === opId && <span className="fp-flag">OP</span>}
          {post.author?.isAdmin && <span className="fp-flag mod">Mod</span>}
          <TimeAgo className="fp-time" date={post.createdAt} />
          {post.editedAt && <span className="fp-time">edited <TimeAgo date={post.editedAt} /></span>}
        </div>

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
              ? <button type="button" className="fp-act" aria-expanded={mode === "reply"} onClick={() => open("reply")}>Reply</button>
              : <Link className="fp-act" href={`/login?redirect=/forum/${thread.id}`}>Log in to reply</Link>)}
            {post.mine && <button type="button" className="fp-act" onClick={() => open("edit")}>Edit</button>}
            {canDelete && <button type="button" className="fp-act danger" aria-expanded={mode === "delete"} onClick={() => open("delete")}>Delete</button>}
            {viewer && !post.mine && <button type="button" className="fp-act" aria-expanded={mode === "report"} onClick={() => open("report")}>{mode === "reported" ? "Reported" : "Report"}</button>}
          </div>
        )}

        {mode === "reply" && <ReplyForm threadId={thread.id} parentId={isRoot ? null : post.id} autoFocus onCancel={() => setMode(null)} onDone={() => { setMode(null); router.refresh(); }} />}
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
        {children}
      </div>
    </article>
  );
}

export default function ThreadClient({ thread, viewer }: { thread: ThreadView; viewer: ForumViewer }) {
  const router = useRouter();
  const [pinned, setPinned] = useState(thread.isPinned);
  const [pinBusy, setPinBusy] = useState(false);
  const root = thread.posts.find((p) => p.depth === 0);
  const replies = thread.posts.filter((p) => p.depth === 1);
  const childrenOf = (id: string) => thread.posts.filter((p) => p.depth === 2 && p.parentId === id);
  const opId = root?.author?.id ?? null;

  const pinToTop = async () => {
    setPinBusy(true);
    const res = await togglePinThread(thread.id).catch(() => FAILED);
    setPinBusy(false);
    if (res.ok) { setPinned(res.isPinned); router.refresh(); }
  };

  return (
    <>
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

      {root && <Post post={root} thread={thread} viewer={viewer} opId={opId} />}

      <div className="ov-section-head fp-replies-head">
        <h2 className="ov-title">{replies.length ? `${thread.replyCount} repl${thread.replyCount === 1 ? "y" : "ies"}` : "No replies yet"}</h2>
      </div>
      <div className="fp-list">
        {replies.map((r) => {
          const kids = childrenOf(r.id);
          return (
            <Post key={r.id} post={r} thread={thread} viewer={viewer} opId={opId}>
              {kids.length > 0 && <div className="fp-children">{kids.map((k) => <Post key={k.id} post={k} thread={thread} viewer={viewer} opId={opId} />)}</div>}
            </Post>
          );
        })}
      </div>

      {thread.deleted ? (
        <div className="ov-empty" style={{ marginTop: "1.5rem" }}><strong>This thread was deleted</strong>It can&apos;t take new replies.</div>
      ) : viewer ? (
        <div className="ov-panel fp-compose"><ReplyForm threadId={thread.id} parentId={null} onDone={() => router.refresh()} /></div>
      ) : (
        <div className="ov-panel fp-join"><strong>Join the conversation</strong><span><Link className="ov-link" href={`/login?redirect=/forum/${thread.id}`}>Log in</Link> to reply and vote.</span></div>
      )}
    </>
  );
}
