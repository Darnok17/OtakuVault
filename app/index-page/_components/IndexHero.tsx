"use client";

import { useIndex } from "./IndexProvider";

export default function IndexHero() {
  const { query, setQuery, chip, setChip } = useIndex();

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
            // Results land in the browse grid further down; Enter jumps there.
            onKeyDown={(e) => { if (e.key === "Enter") document.getElementById("idx-browse")?.scrollIntoView({ behavior: "smooth" }); }}
          />
        </div>
        <div className="idx-type-chips">
          {(["all", "anime", "manga", "webtoon", "novel"] as const).map((t) => (
            <button key={t} className={`idx-chip ${chip === t ? "active" : ""}`} onClick={() => setChip(t)}>
              {t === "all" ? "All" : t === "novel" ? "Novels" : t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
