"use client";

import { Suspense } from "react";
import { useIndex } from "./IndexProvider";
import IndexTabs, { TabBar } from "./IndexTabs";

export default function IndexHero() {
  const { query, setQuery } = useIndex();

  return (
    <div className="idx-hero">
      <div className="idx-hero-inner">
        <div className="idx-eyebrow">◆ Database ◆</div>
        <div className="idx-title">The <span className="accent">Index</span></div>
        <div className="idx-kanji">索引</div>
        <div className="idx-search-wrap">
          <span className="idx-search-icon" aria-hidden="true">
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/></svg>
          </span>
          <input
            type="text"
            placeholder="Search 12,000+ titles — anime, manga, webtoons, novels…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            // Results land in the browse grid further down; Enter jumps there. Tabs visited
            // earlier stay in the DOM, hidden, so look for the one on screen.
            onKeyDown={(e) => {
              if (e.key !== "Enter") return;
              [...document.querySelectorAll(".idx-browse")].find((el) => el.checkVisibility())?.scrollIntoView({ behavior: "smooth" });
            }}
          />
        </div>
        <div className="idx-type-chips">
          <Suspense fallback={<TabBar />}>
            <IndexTabs />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
