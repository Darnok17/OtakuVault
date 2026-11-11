import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";
import { auth } from "@/lib/auth";
import { db, forumPosts, forumReports, forumThreads, users } from "@/lib/db";
import AuthorLink from "@/app/_components/AuthorLink";
import TimeAgo from "@/app/_components/TimeAgo";
import { toAuthor } from "@/lib/forum";
import { REPORT_REASONS } from "@/lib/forum-shared";
import { excerpt } from "@/lib/markdown";
import ReportActions from "./ReportActions";

export const metadata: Metadata = { title: "Reports · OtakuVault", robots: { index: false } };

const REASON: Record<string, string> = Object.fromEntries(REPORT_REASONS.map((r) => [r.value, r.label]));

// Moderators only. Everyone else gets a 404 rather than a hint that the page exists.
async function Reports() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login?redirect=/admin/reports");
  const [me] = await db.select({ isAdmin: users.isAdmin }).from(users).where(eq(users.id, session.user.id));
  if (!me?.isAdmin) notFound();

  const reporter = alias(users, "reporter");
  const rows = await db
    .select({ r: forumReports, post: forumPosts, threadTitle: forumThreads.title, author: users, reporter })
    .from(forumReports)
    .innerJoin(forumPosts, eq(forumReports.postId, forumPosts.id))
    .innerJoin(forumThreads, eq(forumPosts.threadId, forumThreads.id))
    .innerJoin(users, eq(forumPosts.userId, users.id))
    .innerJoin(reporter, eq(forumReports.reporterId, reporter.id))
    .where(eq(forumReports.status, "open"))
    .orderBy(asc(forumReports.createdAt)).limit(100);

  if (!rows.length) return <div className="ov-empty"><strong>Nothing to review</strong>There are no open reports.</div>;
  return (
    <div className="ov-stack">
      <p className="ov-meta">{rows.length} open report{rows.length === 1 ? "" : "s"}, oldest first</p>
      {rows.map(({ r, post, threadTitle, author, reporter: by }) => (
        <section key={r.id} className="ov-panel rp">
          <div className="ov-row between">
            <span className="ov-chip static">{REASON[r.reason] ?? r.reason}</span>
            <span className="ov-meta">reported <TimeAgo date={r.createdAt} /> by @{by.username ?? by.displayName}</span>
          </div>
          {r.details && <p className="rp-details">“{r.details}”</p>}
          <div className="rp-post">
            <div className="fp-by"><AuthorLink author={toAuthor(author)} /><TimeAgo className="fp-time" date={post.createdAt} /></div>
            <p>{post.deletedAt ? "[already deleted]" : excerpt(post.body, 600)}</p>
            {!post.deletedAt && post.images.length > 0 && <p className="ov-meta">{post.images.length} image{post.images.length === 1 ? "" : "s"} attached</p>}
            <Link className="ov-link" href={`/forum/${post.threadId}#post-${post.id}`}>{post.depth === 0 ? "Opening post of" : "Reply in"} “{threadTitle}”</Link>
          </div>
          <ReportActions reportId={r.id} postGone={!!post.deletedAt} />
        </section>
      ))}
    </div>
  );
}

export default function ReportsPage() {
  return (
    <main className="ov-page narrow">
      <div className="ov-page-head">
        <nav className="ov-crumbs" aria-label="Breadcrumb"><Link href="/forum">Forum</Link><span aria-hidden="true">/</span><span aria-current="page">Reports</span></nav>
        <h1 className="ov-masthead">Reports</h1>
        <div className="ov-kanji" data-latin="Moderation">通報</div>
      </div>
      <Suspense fallback={<div className="ov-panel" aria-busy="true"><p className="ov-sub">Loading reports…</p></div>}>
        <Reports />
      </Suspense>
    </main>
  );
}
