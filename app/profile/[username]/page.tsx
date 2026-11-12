import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import Avatar from "@/app/_components/Avatar";
import ShareButton from "@/app/_components/ShareButton";
import TimeAgo from "@/app/_components/TimeAgo";
import { BoardCard, EntryPoster, PinCard } from "@/app/profile/_components/cards";
import { FORUM_CATEGORY_LABEL } from "@/lib/forum-shared";
import { Markdown, excerpt } from "@/lib/markdown";
import { getProfileBoards, getProfileEntries, getProfileForum, getProfileUser, getResolvedPins, visibility, type ProfileUser } from "@/lib/profile";
import type { Entry, EntryType } from "@/lib/types";

export const metadata: Metadata = { title: "Profile · OtakuVault" };

const TABS = [["main", "Main"], ["collection", "Collection"], ["moodboards", "Moodboards"], ["forum", "Forum"]] as const;
type Tab = (typeof TABS)[number][0];
const isTab = (v: unknown): v is Tab => TABS.some(([id]) => id === v);

const TYPE_HEADINGS: [EntryType, string][] = [["anime", "Anime"], ["manga", "Manga"], ["webtoon", "Webtoons"], ["novel", "Novels"]];
const JOINED = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric", timeZone: "UTC" });

function Hidden({ what, owner }: { what: string; owner: string }) {
  return <div className="ov-empty"><strong>Hidden</strong>{owner} keeps their {what} private.</div>;
}

function Section({ title, latin, kanji, meta, children }: { title: string; kanji: string; latin: string; meta?: string; children: React.ReactNode }) {
  return (
    <section className="pf-section">
      <div className="ov-section-head">
        <h2 className="ov-title">{title} <span className="ov-kanji inline" data-latin={latin}>{kanji}</span></h2>
        {meta && <span className="ov-meta">{meta}</span>}
      </div>
      {children}
    </section>
  );
}

async function MainTab({ user, viewerId }: { user: ProfileUser; viewerId: string | null }) {
  const { owner, can } = visibility(user, viewerId);
  const showCollection = can("collection");
  const [entries, pins] = await Promise.all([
    showCollection ? getProfileEntries(user.id) : Promise.resolve<Entry[]>([]),
    getResolvedPins(user.id, { entries: showCollection, moodboards: can("moodboards") }),
  ]);
  const engaging = entries.filter((e) => e.status === "watching").slice(0, 6);
  const favorites = entries.filter((e) => e.rating >= 4).slice(0, 6);
  const who = owner ? "You" : user.displayName;
  return (
    <>
      <Section title="Currently Engaging With" kanji="進行中" latin="In progress" meta={showCollection ? `${engaging.length} in progress` : undefined}>
        {!showCollection ? <Hidden what="collection" owner={user.displayName} />
          : engaging.length ? <div className="ov-grid pf-grid">{engaging.map((e) => <EntryPoster key={e.id} entry={e} progress />)}</div>
          : <div className="ov-empty"><strong>Nothing in progress</strong>{who} {owner ? "aren't" : "isn't"} watching or reading anything right now.</div>}
      </Section>
      <Section title="Pinned" kanji="固定" latin="Pinned" meta={pins.length ? `${pins.length} pinned` : undefined}>
        {pins.length ? <div className="pf-pins">{pins.map((p) => <PinCard key={p.id} pin={p} />)}</div>
          : <div className="ov-empty"><strong>No pins yet</strong>{owner
            ? <>Use the pin button on a collection card, a moodboard, a forum thread or a store product to show it here.</>
            : <>{user.displayName} hasn&apos;t pinned anything.</>}</div>}
      </Section>
      <Section title="Favorites" kanji="お気に入り" latin="Favourites" meta={showCollection && favorites.length ? "Rated 4 stars and up" : undefined}>
        {!showCollection ? <Hidden what="collection" owner={user.displayName} />
          : favorites.length ? <div className="ov-grid pf-grid">{favorites.map((e) => <EntryPoster key={e.id} entry={e} />)}</div>
          : <div className="ov-empty"><strong>No favorites yet</strong>Titles rated 4 stars or higher show up here.</div>}
      </Section>
    </>
  );
}

async function CollectionTab({ user, viewerId }: { user: ProfileUser; viewerId: string | null }) {
  const { owner, can } = visibility(user, viewerId);
  if (!can("collection")) return <Hidden what="collection" owner={user.displayName} />;
  // Planned titles are the owner's watchlist, not their collection (same rule as /collection).
  const entries = (await getProfileEntries(user.id)).filter((e) => e.status !== "plan-to");
  if (!entries.length) return <div className="ov-empty"><strong>Empty collection</strong>{owner ? "Add your first title from the Index." : `${user.displayName} hasn't added anything yet.`}</div>;
  return (
    <>
      {owner && <p className="ov-sub pf-note">This is how visitors see your collection. To add, rate or reorder, open <Link className="ov-link" href="/collection">Your Collection</Link>.</p>}
      {TYPE_HEADINGS.map(([type, label]) => {
        const list = entries.filter((e) => e.type === type);
        if (!list.length) return null;
        return (
          <section className="pf-section" key={type}>
            <div className="ov-section-head"><h2 className="ov-title">{label}</h2><span className="ov-meta">{list.length} title{list.length === 1 ? "" : "s"}</span></div>
            <div className="ov-grid pf-grid">{list.map((e) => <EntryPoster key={e.id} entry={e} />)}</div>
          </section>
        );
      })}
    </>
  );
}

async function MoodboardsTab({ user, viewerId }: { user: ProfileUser; viewerId: string | null }) {
  const { owner, can } = visibility(user, viewerId);
  if (!can("moodboards")) return <Hidden what="moodboards" owner={user.displayName} />;
  const boards = await getProfileBoards(user.id);
  if (!boards.length) return <div className="ov-empty"><strong>No moodboards yet</strong>{owner ? "Open any title in Your Collection to start one." : `${user.displayName} hasn't built a moodboard yet.`}</div>;
  return <div className="pf-boards">{boards.map((b) => <BoardCard key={b.entryId} b={b} />)}</div>;
}

async function ForumTab({ user, viewerId }: { user: ProfileUser; viewerId: string | null }) {
  const { owner, can } = visibility(user, viewerId);
  if (!can("forumPosts")) return <Hidden what="forum activity" owner={user.displayName} />;
  const items = await getProfileForum(user.id);
  if (!items.length) return <div className="ov-empty"><strong>No posts yet</strong>{owner ? <>Start a thread in the <Link className="ov-link" href="/forum">Forum</Link>.</> : `${user.displayName} hasn't posted in the forum.`}</div>;
  return (
    <div className="pf-posts">
      {items.map((p) => (
        <Link key={p.postId} className="pf-post ov-panel" href={p.isThread ? `/forum/${p.threadId}` : `/forum/${p.threadId}#post-${p.postId}`}>
          <span className="ov-meta">{p.isThread ? "Started a thread" : "Replied"} in {FORUM_CATEGORY_LABEL[p.cat] ?? p.cat} · <TimeAgo date={p.createdAt} /></span>
          <span className="pf-post-title">{p.threadTitle}</span>
          <span className="pf-post-body">{excerpt(p.body, 220)}</span>
          <span className="ov-meta">{p.score} point{p.score === 1 ? "" : "s"}{p.isThread ? ` · ${p.replyCount} repl${p.replyCount === 1 ? "y" : "ies"}` : ""}</span>
        </Link>
      ))}
    </div>
  );
}

async function Profile({ params, searchParams }: PageProps<"/profile/[username]">) {
  const [{ username }, query, session] = await Promise.all([params, searchParams, auth.api.getSession({ headers: await headers() })]);
  const user = await getProfileUser(username.toLowerCase());
  if (!user) notFound();
  const viewerId = session?.user.id ?? null;
  const { owner, open, can } = visibility(user, viewerId);

  if (!open) {
    return (
      <div className="ov-empty pf-private">
        <strong>This profile is private</strong>
        @{user.username} has chosen not to share their profile.
      </div>
    );
  }

  const tab: Tab = isTab(query.tab) ? query.tab : "main";
  const base = `/profile/${user.username}`;
  return (
    <>
      <div className="pf-head ov-panel">
        <Avatar src={user.avatar} name={user.displayName} size="xl" />
        <div className="pf-head-text">
          <h1 className="pf-name">{user.displayName}</h1>
          <p className="pf-handle">
            <span>@{user.username}</span>
            {can("pronouns") && user.pronouns && <span className="pf-pronouns">{user.pronouns}</span>}
            {user.isAdmin && <span className="ov-chip static pf-badge">Moderator</span>}
            {owner && !user.isProfilePublic && <span className="ov-chip static pf-badge">Private · only you can see this</span>}
          </p>
          {can("bio") && user.bio
            ? <Markdown text={user.bio} className="pf-bio" />
            : owner && <p className="ov-sub">No bio yet. <Link className="ov-link" href="/profile/edit">Write one</Link>.</p>}
          <p className="ov-meta">Joined {JOINED.format(user.joined)}</p>
        </div>
        <div className="pf-actions">
          {owner && <Link className="btn btn-primary" href="/profile/edit">Edit</Link>}
          <ShareButton path={base} />
        </div>
      </div>

      <nav className="ov-tabs" aria-label="Profile sections">
        {TABS.map(([id, label]) => (
          <Link key={id} className={`ov-tab${tab === id ? " active" : ""}`} href={id === "main" ? base : `${base}?tab=${id}`} aria-current={tab === id ? "page" : undefined} scroll={false}>{label}</Link>
        ))}
      </nav>

      {tab === "main" && <MainTab user={user} viewerId={viewerId} />}
      {tab === "collection" && <CollectionTab user={user} viewerId={viewerId} />}
      {tab === "moodboards" && <MoodboardsTab user={user} viewerId={viewerId} />}
      {tab === "forum" && <ForumTab user={user} viewerId={viewerId} />}
    </>
  );
}

export default function ProfilePage(props: PageProps<"/profile/[username]">) {
  return (
    <main className="ov-page">
      <Suspense fallback={<div className="pf-head ov-panel" aria-busy="true"><span className="ov-avatar xl" /><div className="pf-head-text"><p className="ov-sub">Loading profile…</p></div></div>}>
        <Profile {...props} />
      </Suspense>
    </main>
  );
}
