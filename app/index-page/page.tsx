"use client";

import { useState, useRef, useEffect } from "react";

const SEASONAL = [
  { title:"Dandadan Season 2",       sub:"Fall 2026 · 12 eps",  badge:"Anime",  hue:"violet",  glyph:"壇" },
  { title:"Re:Zero Season 3 Part 2", sub:"Fall 2026 · 13 eps",  badge:"Anime",  hue:"gold",    glyph:"零" },
  { title:"Blue Lock Season 2",      sub:"Fall 2026 · 14 eps",  badge:"Anime",  hue:"teal",    glyph:"蒼" },
  { title:"Chainsaw Man Part 2",     sub:"Fall 2026 · ongoing", badge:"Manga",  hue:"crimson", glyph:"鋸" },
  { title:"Spy x Family Season 3",   sub:"Fall 2026 · 12 eps",  badge:"Anime",  hue:"crimson", glyph:"諜" },
  { title:"The Elusive Samurai S2",  sub:"Fall 2026 · 11 eps",  badge:"Anime",  hue:"orange",  glyph:"逃" },
];

const POOL = [
  { title:"Frieren: Beyond Journey's End", badge:"Anime",   rating:"4.9", hue:"teal",    glyph:"葬" },
  { title:"Jujutsu Kaisen S2",             badge:"Anime",   rating:"4.8", hue:"crimson", glyph:"呪" },
  { title:"Dandadan",                      badge:"Manga",   rating:"4.7", hue:"violet",  glyph:"壇" },
  { title:"Solo Leveling: Ragnarok",       badge:"Webtoon", rating:"4.7", hue:"teal",    glyph:"覚" },
  { title:"Chainsaw Man Part 2",           badge:"Manga",   rating:"4.6", hue:"crimson", glyph:"鋸" },
  { title:"Delicious in Dungeon",          badge:"Anime",   rating:"4.6", hue:"gold",    glyph:"迷" },
  { title:"Oshi no Ko",                    badge:"Anime",   rating:"4.8", hue:"violet",  glyph:"推" },
  { title:"The Apothecary Diaries",        badge:"Anime",   rating:"4.8", hue:"crimson", glyph:"薬" },
  { title:"Kaiju No. 8",                   badge:"Manga",   rating:"4.5", hue:"orange",  glyph:"怪" },
  { title:"Alya Sometimes Hides",          badge:"Anime",   rating:"4.4", hue:"crimson", glyph:"露" },
  { title:"Vagabond",                      badge:"Manga",   rating:"4.9", hue:"violet",  glyph:"武" },
  { title:"Spice & Wolf",                  badge:"Novel",   rating:"4.7", hue:"orange",  glyph:"狼" },
  { title:"Monster",                       badge:"Anime",   rating:"4.9", hue:"crimson", glyph:"怪" },
  { title:"Hunter x Hunter",               badge:"Anime",   rating:"5.0", hue:"teal",    glyph:"狩" },
  { title:"Steins;Gate",                   badge:"Anime",   rating:"4.9", hue:"violet",  glyph:"鋼" },
  { title:"Dungeon Meshi",                 badge:"Manga",   rating:"4.8", hue:"gold",    glyph:"食" },
  { title:"Mushishi",                      badge:"Anime",   rating:"4.8", hue:"teal",    glyph:"蟲" },
  { title:"Vinland Saga Deluxe",           badge:"Manga",   rating:"5.0", hue:"crimson", glyph:"海" },
  { title:"Lord of Mysteries",             badge:"Novel",   rating:"4.6", hue:"orange",  glyph:"詭" },
  { title:"Berserk",                       badge:"Manga",   rating:"5.0", hue:"crimson", glyph:"剣" },
  { title:"Girls' Last Tour",              badge:"Anime",   rating:"4.6", hue:"gold",    glyph:"終" },
  { title:"Sonny Boy",                     badge:"Anime",   rating:"4.4", hue:"teal",    glyph:"漂" },
  { title:"Houseki no Kuni",               badge:"Manga",   rating:"4.7", hue:"violet",  glyph:"宝" },
  { title:"Mushoku Tensei",                badge:"Novel",   rating:"4.8", hue:"orange",  glyph:"転" },
];

const hueToVar = (hue: string) =>
  hue === "teal"    ? "accent3" :
  hue === "crimson" ? "accent"  :
  hue === "violet"  ? "accent2" :
  hue === "gold"    ? "gold"    : "novel";

type Poster = { title: string; badge: string; rating: string; hue: string; glyph: string };

function PosterCard({ p, rank }: { p: Poster; rank?: number }) {
  return (
    <div className="rec-poster" style={{ "--poster-accent": `var(--${hueToVar(p.hue)})` } as React.CSSProperties} role="button" tabIndex={0}>
      <div className="rec-poster-cover"><div className="rec-poster-glyph">{p.glyph}</div></div>
      {rank && rank <= 3 && <div className="rec-poster-rank">#{rank}</div>}
      <div className="rec-poster-info">
        <div className="rec-poster-title">{p.title}</div>
        <div className="rec-poster-meta">
          <span className="rec-poster-badge">{p.badge}</span>
          <span className="rec-poster-rating">{p.rating}</span>
        </div>
      </div>
    </div>
  );
}

function RecRow({ items, accent }: { items: Poster[]; accent: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const by = () => Math.round((ref.current?.clientWidth || 600) * 0.75);
  return (
    <div className="rec-row" data-accent={accent}>
      <div className="rec-row-track">
        <button className="rec-row-nav rec-row-nav-prev" aria-label="Scroll left" onClick={() => ref.current?.scrollBy({ left: -by(), behavior: "smooth" })}>‹</button>
        <div className="rec-row-scroll" ref={ref}>
          {items.map((p, i) => <PosterCard key={i} p={p} rank={i + 1} />)}
        </div>
        <button className="rec-row-nav rec-row-nav-next" aria-label="Scroll right" onClick={() => ref.current?.scrollBy({ left: by(), behavior: "smooth" })}>›</button>
      </div>
    </div>
  );
}

export default function IndexPage() {
  const [activeType, setActiveType] = useState("all");
  const [stars, setStars] = useState(0);
  const [gridItems, setGridItems] = useState(POOL);

  const shuffle = () => [...POOL].sort(() => Math.random() - 0.5);

  return (
    <section className="site-page active" id="page-index" data-page="index">
      <div className="idx-hero">
        <div className="idx-hero-inner">
          <div className="idx-eyebrow">◆ Database ◆</div>
          <div className="idx-title">The <span className="accent">Index</span></div>
          <div className="idx-kanji">索引</div>
          <div className="idx-search-wrap">
            <span className="idx-search-icon" aria-hidden="true">
              <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/></svg>
            </span>
            <input type="text" placeholder="Search 12,000+ titles — anime, manga, webtoons, novels…" />
          </div>
          <div className="idx-type-chips">
            {["all", "anime", "manga", "webtoon", "novel"].map((t) => (
              <button key={t} className={`idx-chip ${activeType === t ? "active" : ""}`} onClick={() => setActiveType(t)}>
                {t === "all" ? "All" : t === "novel" ? "Novels" : t.charAt(0).toUpperCase() + t.slice(1)}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Seasonal lineup */}
      <div className="idx-section" data-accent="violet">
        <div className="idx-section-header">
          <div className="idx-section-title">Fall 2026 Season <span className="idx-section-kanji">秋アニメ</span></div>
          <div className="idx-section-meta">OCT–DEC 2026 · 42 TITLES</div>
        </div>
        <div className="idx-seasonal-track">
          {SEASONAL.map((s, i) => (
            <div key={i} className="idx-seasonal-card" style={{ "--card-accent": `var(--${hueToVar(s.hue)})` } as React.CSSProperties} role="button" tabIndex={0}>
              <div className="idx-seasonal-glyph">{s.glyph}</div>
              <div className="idx-seasonal-info">
                <span className="idx-seasonal-badge">{s.badge}</span>
                <div className="idx-seasonal-title">{s.title}</div>
                <div className="idx-seasonal-sub">{s.sub}</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Trending */}
      <div className="idx-section" data-accent="crimson">
        <div className="idx-section-header">
          <div className="idx-section-title">Trending Now <span className="idx-section-kanji">話題</span></div>
          <div className="idx-section-meta">UPDATED HOURLY</div>
        </div>
        <RecRow items={POOL.slice(0, 12)} accent="crimson" />
      </div>

      {/* Browse: filters + grid */}
      <div className="idx-browse">
        <aside className="idx-filters">
          <div className="idx-filters-head">
            <div className="idx-filters-head-title">Filters</div>
            <button className="idx-filters-clear" type="button" onClick={() => setStars(0)}>Clear</button>
          </div>
          <div className="idx-filter-group">
            <div className="idx-filter-label">Type</div>
            {[["Anime","8,241"],["Manga","2,983"],["Webtoon","612"],["Light / Web Novel","447"]].map(([t,c]) => (
              <label key={t} className="idx-check"><input type="checkbox" defaultChecked /><span className="idx-check-box"></span><span className="idx-check-text">{t}</span><span className="idx-check-count">{c}</span></label>
            ))}
          </div>
          <div className="idx-filter-group">
            <div className="idx-filter-label">Status</div>
            {["Airing / Ongoing", "Completed / Finished", "Not Yet Released", "Hiatus"].map((s) => (
              <label key={s} className="idx-check"><input type="checkbox" /><span className="idx-check-box"></span><span className="idx-check-text">{s}</span></label>
            ))}
          </div>
          <div className="idx-filter-group">
            <div className="idx-filter-label">Genre</div>
            <div className="idx-genre-chips">
              {["Action","Adventure","Comedy","Drama","Fantasy","Horror","Isekai","Mecha","Mystery","Romance","Sci-Fi","Seinen","Shonen","Slice of Life","Sports","Supernatural","Thriller"].map((g) => (
                <button key={g} className="idx-genre-chip" type="button" onClick={(e) => e.currentTarget.classList.toggle("active")}>{g}</button>
              ))}
            </div>
          </div>
          <div className="idx-filter-group">
            <div className="idx-filter-label">Year</div>
            <div className="idx-year-range">
              <input type="number" placeholder="1980" min={1950} max={2030} />
              <span>→</span>
              <input type="number" placeholder="2026" min={1950} max={2030} />
            </div>
          </div>
          <div className="idx-filter-group">
            <div className="idx-filter-label">Min Rating</div>
            <div className={`idx-stars rating-${stars}`}>
              {[1,2,3,4,5].map((v) => (
                <button key={v} type="button" onClick={() => setStars(stars === v ? 0 : v)}>★</button>
              ))}
            </div>
          </div>
        </aside>

        <div className="idx-browse-main">
          <div className="idx-browse-toolbar">
            <div className="idx-result-count"><strong>12,283</strong> titles</div>
            <div className="idx-sort-wrap">
              <span className="idx-sort-label">Sort</span>
              <select><option>Popularity</option><option>Rating ↓</option><option>Rating ↑</option><option>Newest</option><option>Oldest</option></select>
            </div>
          </div>
          <div className="idx-grid">
            {gridItems.map((p, i) => <PosterCard key={i} p={p} />)}
          </div>
          <div className="idx-load-more-wrap">
            <button className="idx-load-more" type="button" onClick={() => setGridItems([...gridItems, ...shuffle()])}>Load More</button>
          </div>
        </div>
      </div>

      {/* Because you liked */}
      <div className="idx-section" data-accent="crimson">
        <div className="idx-section-header">
          <div className="idx-section-title">Because You Liked... <span className="idx-section-kanji">類似作品</span></div>
          <div className="idx-section-meta">BASED ON YOUR COLLECTION</div>
        </div>
        <div className="idx-similar-note">
          Recommendations drawn from your <strong>top-rated titles</strong>. Add more entries to Your Collection to sharpen the match.
        </div>
        <RecRow items={POOL.slice(12, 24)} accent="crimson" />
      </div>
    </section>
  );
}