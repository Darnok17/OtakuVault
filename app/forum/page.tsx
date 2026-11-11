import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { connection } from "next/server";
import { auth } from "@/lib/auth";
import { forumCounts, listThreads } from "@/lib/forum";
import { FORUM_CATEGORIES, FORUM_SORTS, isForumCategory, isForumSort } from "@/lib/forum-shared";
import ThreadList from "./_components/ThreadList";

export const metadata: Metadata = { title: "Forum · OtakuVault", description: "Talk anime, manga, webtoons and light novels with other collectors." };

async function Stats() {
  await connection();
  const c = await forumCounts().catch(() => null);
  if (!c) return null;
  return (
    <div className="forum-stats-row">
      <div className="forum-stat"><strong>{c.threads.toLocaleString("en-US")}</strong>thread{c.threads === 1 ? "" : "s"}</div>
      <div className="forum-stat"><strong>{c.posts.toLocaleString("en-US")}</strong>post{c.posts === 1 ? "" : "s"}</div>
      <div className="forum-stat"><strong>{c.posters.toLocaleString("en-US")}</strong>{c.posters === 1 ? "person" : "people"} posting</div>
    </div>
  );
}

async function Browse({ searchParams }: Pick<PageProps<"/forum">, "searchParams">) {
  const [query, session] = await Promise.all([searchParams, auth.api.getSession({ headers: await headers() })]);
  const cat = isForumCategory(query.cat) ? query.cat : null;
  const sort = isForumSort(query.sort) ? query.sort : "hot";
  const page = await listThreads({ cat: cat ?? undefined, sort, page: 1, viewerId: session?.user.id ?? null });
  const href = (c: string | null, s: string) => {
    const q = new URLSearchParams();
    if (c) q.set("cat", c);
    if (s !== "hot") q.set("sort", s);
    const qs = q.toString();
    return qs ? `/forum?${qs}` : "/forum";
  };
  const current = FORUM_CATEGORIES.find((c) => c.id === cat);
  return (
    <div className="ft-wrap">
      <nav className="forum-cat-chips ft-cats" aria-label="Categories">
        <Link className={`forum-cat-chip${cat ? "" : " active"}`} href={href(null, sort)} style={{ "--chip-c": "var(--azure)" } as React.CSSProperties} aria-current={cat ? undefined : "page"}>
          <span className="cat-dot" />All
        </Link>
        {FORUM_CATEGORIES.map((c) => (
          <Link key={c.id} className={`forum-cat-chip${cat === c.id ? " active" : ""}`} href={href(c.id, sort)} style={{ "--chip-c": `var(--${c.color})` } as React.CSSProperties} aria-current={cat === c.id ? "page" : undefined}>
            <span className="cat-dot" />{c.label}
          </Link>
        ))}
      </nav>

      <div className="forum-browse-toolbar ft-toolbar">
        <div className="forum-browse-left">
          <div className="forum-result-count"><strong>{page.total.toLocaleString("en-US")}</strong> thread{page.total === 1 ? "" : "s"}{current ? ` in ${current.label}` : ""}</div>
          <Link className="forum-new-thread" href={cat ? `/forum/new?cat=${cat}` : "/forum/new"}>New thread</Link>
        </div>
        <nav className="ov-tabs ft-sorts" aria-label="Sort threads">
          {FORUM_SORTS.map((s) => (
            <Link key={s.value} className={`ov-tab${sort === s.value ? " active" : ""}`} href={href(cat, s.value)} aria-current={sort === s.value ? "page" : undefined} title={s.hint} scroll={false}>{s.label}</Link>
          ))}
        </nav>
      </div>
      {current && <p className="ov-sub ft-blurb">{current.blurb}.</p>}

      {/* Keyed so switching category or sort starts the list (and its "load more" state) afresh. */}
      <ThreadList key={`${cat ?? "all"}:${sort}`} initial={page} cat={cat} sort={sort} />
    </div>
  );
}

export default function ForumPage({ searchParams }: PageProps<"/forum">) {
  return (
    <section className="site-page active" id="page-forum" data-page="forum">
      <div className="forum-hero">
        <div className="forum-hero-inner">
          <h1 className="forum-title">The <span className="accent">Forum</span></h1>
          <div className="forum-kanji" data-latin="Notice board">掲示板</div>
          <Suspense fallback={<div className="forum-stats-row" aria-hidden="true"><div className="forum-stat"><strong>…</strong>threads</div></div>}>
            <Stats />
          </Suspense>
        </div>
      </div>
      <Suspense fallback={<div className="ft-wrap"><div className="ov-panel" aria-busy="true"><p className="ov-sub">Loading threads…</p></div></div>}>
        <Browse searchParams={searchParams} />
      </Suspense>
    </section>
  );
}
