import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { and, eq, isNull } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db, entries, forumPosts, moodboards, users } from "@/lib/db";
import Avatar from "@/app/_components/Avatar";
import BoardPreview from "@/app/_components/BoardPreview";
import PinButton from "@/app/_components/PinButton";
import ShareButton from "@/app/_components/ShareButton";
import { titleHref } from "@/lib/anilist-shared";
import { publicFieldsOf } from "@/lib/types";
import { avatarOf } from "@/lib/users-db";

export const metadata: Metadata = { title: "Moodboard · OtakuVault" };

// Read-only view of someone's moodboard. Visible to its owner, to anyone when the owner's
// profile shows moodboards, and to anyone once the owner has shared the board in a forum post.
async function Board({ params }: PageProps<"/boards/[entryId]">) {
  const [{ entryId }, session] = await Promise.all([params, auth.api.getSession({ headers: await headers() })]);
  if (entryId.length > 100) notFound();
  const [row] = await db
    .select({ entry: entries, nodes: moodboards.nodes, wires: moodboards.wires, owner: users })
    .from(entries).innerJoin(users, eq(entries.userId, users.id)).leftJoin(moodboards, eq(moodboards.entryId, entries.id))
    .where(eq(entries.id, entryId)).limit(1);
  if (!row) notFound();
  const { entry, owner } = row;
  const isOwner = session?.user.id === owner.id;
  if (!isOwner && !(owner.isProfilePublic && publicFieldsOf(owner.publicFields).moodboards)) {
    const [shared] = await db.select({ id: forumPosts.id }).from(forumPosts)
      .where(and(eq(forumPosts.attachedMoodboardEntryId, entry.id), isNull(forumPosts.deletedAt), eq(forumPosts.userId, owner.id))).limit(1);
    if (!shared) notFound();
  }
  const board = { nodes: row.nodes ?? [], wires: row.wires ?? [] };
  const profile = owner.username && owner.isProfilePublic ? `/profile/${owner.username}` : null;
  const by = <><Avatar src={avatarOf(owner)} name={owner.displayName} size="sm" /><span>{owner.displayName}</span></>;
  return (
    <>
      <div className="ov-page-head">
        <nav className="ov-crumbs" aria-label="Breadcrumb">
          {profile ? <Link href={`${profile}?tab=moodboards`}>{owner.displayName}&apos;s moodboards</Link> : <span>Moodboards</span>}
          <span aria-hidden="true">/</span><span aria-current="page">{entry.title}</span>
        </nav>
        <h1 className="ov-masthead">{entry.title}</h1>
        <div className="ov-kanji" data-latin="Moodboard">ムードボード</div>
        <div className="ov-row between" style={{ marginTop: "1rem" }}>
          <div className="ov-row bd-owner">
            {profile ? <Link className="bd-by" href={profile}>{by}</Link> : <span className="bd-by">{by}</span>}
            <span className="ov-meta">{board.nodes.length} node{board.nodes.length === 1 ? "" : "s"} · {board.wires.length} connection{board.wires.length === 1 ? "" : "s"}</span>
          </div>
          <div className="ov-row">
            {isOwner && <PinButton kind="moodboard" targetId={entry.id} label={`the ${entry.title} moodboard`} className="btn btn-ghost" withText />}
            {entry.anilistId != null && <Link className="btn btn-ghost" href={titleHref(entry.type, entry.anilistId)}>About this title</Link>}
            {isOwner && <Link className="btn btn-primary" href={`/collection/${entry.id}/moodboard`}>Open editor</Link>}
            <ShareButton />
          </div>
        </div>
      </div>
      {board.nodes.length
        ? <div className="bd-stage"><BoardPreview board={board} className="bd-full" /></div>
        : <div className="ov-empty"><strong>Nothing on this board yet</strong>{isOwner ? "Open the editor to add the first node." : "Check back later."}</div>}
    </>
  );
}

export default function BoardPage(props: PageProps<"/boards/[entryId]">) {
  return (
    <main className="ov-page wide">
      <Suspense fallback={<div className="ov-panel" aria-busy="true"><p className="ov-sub">Loading moodboard…</p></div>}>
        <Board {...props} />
      </Suspense>
    </main>
  );
}
