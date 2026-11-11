"use client";

import { useState } from "react";
import { loadBrowsePage } from "@/app/actions/browse";
import { uniqueBy, type Title, type TitlePage } from "@/lib/anilist-shared";
import { BROWSE_MAX_PAGE, type BrowseSectionId } from "@/lib/browse-sections";
import { PosterCard } from "./posters";

// The poster grid of a "See more" page: page 1 arrives with the page, "Load more" appends the
// next 24.
export default function BrowseGrid({ section, param, first }: { section: BrowseSectionId; param?: string; first: TitlePage }) {
  const [items, setItems] = useState<Title[]>(first.items);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(first.hasNext);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  const more = async () => {
    if (busy) return;
    setBusy(true); setFailed(false);
    const next = await loadBrowsePage(section, page + 1, param).catch(() => null);
    setBusy(false);
    if (!next) return setFailed(true);
    // Trending lists shift between requests; drop anything already shown.
    setItems((prev) => uniqueBy([...prev, ...next.items], (t) => t.anilistId));
    setPage(page + 1);
    setHasNext(next.hasNext && page + 1 < BROWSE_MAX_PAGE);
  };

  if (!items.length) return <div className="ov-empty"><strong>Nothing here yet</strong>AniList has no titles for this list right now.</div>;

  return (
    <>
      <div className="ov-grid">
        {items.map((t) => <PosterCard key={t.anilistId} t={t} />)}
      </div>
      <div className="browse-more">
        <span className="ov-meta">Showing {items.length.toLocaleString()}{first.total > items.length ? ` of ${first.total.toLocaleString()}` : ""} · Page {page}</span>
        {hasNext && <button type="button" className="btn btn-ghost" onClick={more} disabled={busy}>{busy ? "Loading…" : "Load more"}</button>}
        {failed && <span className="ov-error" role="alert">Couldn&apos;t load the next page. AniList may be busy — try again.</span>}
      </div>
    </>
  );
}
