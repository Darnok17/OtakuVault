"use client";

import { useState } from "react";
import Link from "next/link";
import AuthorLink from "@/app/_components/AuthorLink";
import TimeAgo from "@/app/_components/TimeAgo";
import { loadThreads } from "@/app/actions/forum";
import { FORUM_CATEGORY_COLOR, FORUM_CATEGORY_LABEL, type ForumSort, type ThreadPage } from "@/lib/forum-shared";
import VoteButtons from "./VoteButtons";

export default function ThreadList({ initial, cat, sort }: { initial: ThreadPage; cat: string | null; sort: ForumSort }) {
  const [items, setItems] = useState(initial.items);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(initial.hasNext);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const more = async () => {
    setLoading(true); setError(null);
    const res = await loadThreads(cat, sort, page + 1).catch(() => null);
    setLoading(false);
    if (!res) return setError("Couldn't load more threads. Try again.");
    const seen = new Set(items.map((t) => t.id));
    setItems([...items, ...res.items.filter((t) => !seen.has(t.id))]);
    setPage(page + 1); setHasNext(res.hasNext);
  };

  if (!items.length) {
    return (
      <div className="ov-empty">
        <strong>No threads here yet</strong>
        Be the first: <Link className="ov-link" href={cat ? `/forum/new?cat=${cat}` : "/forum/new"}>start a thread</Link>.
      </div>
    );
  }

  return (
    <>
      <div className="forum-threads ft-list">
        {items.map((t) => (
          <article key={t.id} className={`forum-thread ft-row${t.isPinned ? " pinned" : ""}`} data-cat={t.cat} style={{ "--t-c": `var(--${FORUM_CATEGORY_COLOR[t.cat] ?? "azure"})` } as React.CSSProperties}>
            <VoteButtons postId={t.rootPostId} score={t.score} myVote={t.myVote} />
            <div className="forum-thread-main">
              <div className="forum-thread-tags">
                <Link className="forum-thread-cat" href={`/forum?cat=${t.cat}`}>{FORUM_CATEGORY_LABEL[t.cat] ?? t.cat}</Link>
                {t.isPinned && <span className="forum-thread-indicator answered">Pinned</span>}
                {t.imageCount > 0 && <span className="forum-thread-series">{t.imageCount} image{t.imageCount === 1 ? "" : "s"}</span>}
              </div>
              <h3 className="forum-thread-title"><Link href={`/forum/${t.id}`}>{t.title}</Link></h3>
              {t.excerpt && <p className="ft-excerpt">{t.excerpt}</p>}
              <div className="forum-thread-byline ft-by"><AuthorLink author={t.author} /><TimeAgo date={t.createdAt} /></div>
            </div>
            <div className="forum-thread-stats">
              <div><span className="count-num">{t.replyCount.toLocaleString("en-US")}</span><span className="count-label">{t.replyCount === 1 ? "reply" : "replies"}</span></div>
              <div><span className="count-num">{t.viewCount.toLocaleString("en-US")}</span><span className="count-label">{t.viewCount === 1 ? "view" : "views"}</span></div>
            </div>
            <div className="forum-thread-activity">
              <div className="activity-time"><TimeAgo date={t.lastActivityAt} /></div>
              <div className="activity-user">last activity</div>
            </div>
          </article>
        ))}
      </div>
      {error && <div className="ov-error" role="alert" style={{ marginTop: "1rem" }}>{error}</div>}
      {hasNext && (
        <div className="forum-load-more-wrap">
          <button className="forum-load-more" type="button" disabled={loading} onClick={more}>{loading ? "Loading…" : "Load more threads"}</button>
        </div>
      )}
    </>
  );
}
