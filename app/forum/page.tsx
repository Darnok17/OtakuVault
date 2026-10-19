"use client";

import { useState, useRef } from "react";

const PINNED = [
  { tag:"ANNOUNCEMENT", title:"Welcome to the OtakuVault Forum — Read First", snippet:"The ground rules, how categories work, how to format spoilers properly, and what gets you perma-banned.", replies:412,  views:"18.4k", author:"ModTeam" },
  { tag:"MEGATHREAD",   title:"Fall 2026 Season — Weekly Episode Discussion Hub", snippet:"Every airing title in one place. Each week's episodes get their own child thread.",                 replies:2847, views:"94.2k", author:"SeasonalBot" },
  { tag:"STICKY",       title:"Recommend Me Something: The Monthly Rec Thread", snippet:"Looking for your next read or watch? Drop what you loved and what you want next.",                         replies:1263, views:"42.7k", author:"RecMaster" },
];

const TRENDING = [
  { cat:"theory",     catLabel:"Theory",     title:"The real reason Sukuna chose that body in JJK",    replies:384, hot:true  },
  { cat:"discussion", catLabel:"Discussion", title:"Frieren's approach to time vs. Elfen Lied's",       replies:217, hot:true  },
  { cat:"news",       catLabel:"News",       title:"Chainsaw Man Part 3 confirmed — October 2027",      replies:942, hot:true  },
  { cat:"reviews",    catLabel:"Reviews",    title:"Delicious in Dungeon finale — a quiet masterpiece", replies:156, hot:false },
  { cat:"fanart",     catLabel:"Fan Art",    title:"Weekly fan art showcase · Week of 10/06",           replies:88,  hot:false },
  { cat:"theory",     catLabel:"Theory",     title:"Berserk's cosmology maps onto Buddhist samsara",    replies:273, hot:true  },
  { cat:"help",       catLabel:"Help",       title:"Where to start with Monogatari in 2026?",           replies:142, hot:false },
  { cat:"discussion", catLabel:"Discussion", title:"Dandadan S2 pacing — too fast or just right?",      replies:198, hot:true  },
];

const THREADS = [
  { cat:"discussion", catLabel:"Discussion", title:"What's the best anime finale of the last 5 years?",   series:"General",      replies:487,  views:"12.4k", activityTime:"2m ago",  activityUser:"kurogane_42", author:"yuki_sora",     online:true,  hot:true,  answered:false },
  { cat:"news",       catLabel:"News",       title:"Vinland Saga S3 production confirmed — key staff list", series:"Vinland Saga", replies:1218, views:"38.9k", activityTime:"6m ago",  activityUser:"thorfinn88",  author:"news_bot",      online:true,  hot:true,  answered:false },
  { cat:"theory",     catLabel:"Theory",     title:"Why Frieren is secretly about grief, not time",        series:"Frieren",      replies:342,  views:"9.1k",  activityTime:"12m ago", activityUser:"elf_scholar", author:"frieren_fan",   online:true,  hot:true,  answered:false },
  { cat:"reviews",    catLabel:"Reviews",    title:"My deep-dive review of Oshi no Ko manga ending",       series:"Oshi no Ko",   replies:289,  views:"7.8k",  activityTime:"22m ago", activityUser:"star_critic", author:"star_critic",   online:false, hot:false, answered:false },
  { cat:"help",       catLabel:"Help",       title:"Where to start with Monogatari in 2026?",             series:"Monogatari",   replies:142,  views:"4.2k",  activityTime:"38m ago", activityUser:"senjougahara", author:"new_otaku",    online:false, hot:false, answered:true  },
  { cat:"fanart",     catLabel:"Fan Art",    title:"[OC] Painted Guts in watercolor — 4 months of work",   series:"Berserk",      replies:518,  views:"22.1k", activityTime:"45m ago", activityUser:"brand_mark",  author:"inked_dreams",  online:true,  hot:true,  answered:false },
  { cat:"discussion", catLabel:"Discussion", title:"Underrated 90s OVAs worth hunting down",              series:"General",      replies:94,   views:"2.8k",  activityTime:"1h ago",  activityUser:"retro_otaku", author:"vhs_guy",       online:false, hot:false, answered:false },
  { cat:"theory",     catLabel:"Theory",     title:"Hunter x Hunter: the real reason Gon aged up",         series:"Hunter x Hunter",replies:267, views:"8.4k",  activityTime:"1h ago",  activityUser:"nen_user",    author:"chimera_fan",   online:true,  hot:true,  answered:false },
  { cat:"news",       catLabel:"News",       title:"Dandadan S2 cour 2 PV just dropped — thoughts?",       series:"Dandadan",     replies:423,  views:"14.7k", activityTime:"2h ago",  activityUser:"momo_fan",    author:"news_bot",      online:true,  hot:true,  answered:false },
  { cat:"reviews",    catLabel:"Reviews",    title:"Lord of Mysteries — my 100-chapter mark review",       series:"Lord of Mysteries",replies:78,views:"1.9k",  activityTime:"3h ago",  activityUser:"klein_moretti",author:"arcane_reader", online:false, hot:false, answered:false },
  { cat:"discussion", catLabel:"Discussion", title:"Is Chainsaw Man Part 2 better than Part 1?",           series:"Chainsaw Man", replies:812,  views:"28.3k", activityTime:"5h ago",  activityUser:"denji_fan",   author:"devil_hunter",  online:true,  hot:true,  answered:false },
  { cat:"theory",     catLabel:"Theory",     title:"Attack on Titan: Eren's plan from the start, really?", series:"Attack on Titan",replies:731,views:"24.1k", activityTime:"6h ago",  activityUser:"yeager_01",   author:"wall_watcher",  online:false, hot:true,  answered:false },
  { cat:"fanart",     catLabel:"Fan Art",    title:"[OC] 1/7 scale Thorfinn — my 2-year sculpt project",  series:"Vinland Saga", replies:294,  views:"9.8k",  activityTime:"11h ago", activityUser:"clay_hands",  author:"clay_hands",    online:true,  hot:false, answered:false },
  { cat:"news",       catLabel:"News",       title:"Jujutsu Kaisen manga is now officially complete",      series:"Jujutsu Kaisen",replies:1842,views:"52.7k", activityTime:"15h ago", activityUser:"curse_user",  author:"news_bot",      online:true,  hot:true,  answered:false },
];

export default function ForumPage() {
  const [activeCat, setActiveCat] = useState("all");
  const [threadList, setThreadList] = useState(THREADS);
  const trendRef = useRef<HTMLDivElement>(null);
  const by = () => Math.round((trendRef.current?.clientWidth || 600) * 0.75);
  const filtered = activeCat === "all" ? threadList : threadList.filter((t) => t.cat === activeCat);

  return (
    <section className="site-page active" id="page-forum" data-page="forum">
      <div className="forum-hero">
        <div className="forum-hero-inner">
          <div className="forum-eyebrow">◆ Community ◆</div>
          <div className="forum-title">The <span className="accent">Forum</span></div>
          <div className="forum-kanji">掲示板</div>
          <div className="forum-stats-row">
            <div className="forum-stat"><strong>12,847</strong>members</div>
            <div className="forum-stat"><strong>3,219</strong>threads</div>
            <div className="forum-stat"><strong>86,431</strong>posts</div>
            <div className="forum-stat"><strong>142</strong>online now</div>
          </div>
          <div className="forum-search-wrap">
            <span className="forum-search-icon" aria-hidden="true">
              <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/></svg>
            </span>
            <input type="text" placeholder="Search threads, users, series…" />
          </div>
          <div className="forum-cat-chips">
            {[["all","All"],["discussion","Discussion"],["news","News"],["reviews","Reviews"],["theory","Theory"],["fanart","Fan Art"],["help","Help"]].map(([k,label]) => (
              <button key={k} className={`forum-cat-chip ${activeCat === k ? "active" : ""}`} data-cat={k} onClick={() => setActiveCat(k)}>
                <span className="cat-dot"></span>{label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Pinned */}
      <div className="forum-section" data-accent="azure">
        <div className="forum-section-header">
          <div className="forum-section-title">Pinned Threads <span className="forum-section-kanji">固定</span></div>
          <div className="forum-section-meta">MUST READ · UPDATED WEEKLY</div>
        </div>
        <div className="forum-pinned">
          {PINNED.map((p, i) => (
            <div key={i} className="forum-pinned-card" role="button" tabIndex={0}>
              <div className="forum-pinned-tag">{p.tag}</div>
              <div className="forum-pinned-title">{p.title}</div>
              <div className="forum-pinned-snippet">{p.snippet}</div>
              <div className="forum-pinned-meta">
                <span>by <strong>{p.author}</strong></span>
                <span className="pinned-replies">{p.replies.toLocaleString()} replies</span>
                <span>{p.views} views</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Trending */}
      <div className="forum-section" data-accent="crimson">
        <div className="forum-section-header">
          <div className="forum-section-title">Trending Discussions <span className="forum-section-kanji">話題</span></div>
          <div className="forum-section-meta">HOTTEST IN 24H</div>
        </div>
        <div className="forum-row-track">
          <button className="forum-row-nav forum-row-nav-prev" aria-label="Scroll left" onClick={() => trendRef.current?.scrollBy({ left: -by(), behavior: "smooth" })}>‹</button>
          <div className="forum-row-scroll" ref={trendRef}>
            {TRENDING.map((t, i) => (
              <div key={i} className="forum-trend-card" data-cat={t.cat} role="button" tabIndex={0}>
                <div className="forum-trend-cat">{t.catLabel}</div>
                <div className="forum-trend-title">{t.title}</div>
                <div className="forum-trend-footer">
                  <span>{t.replies.toLocaleString()} replies</span>
                  {t.hot && <span className="hot">Hot</span>}
                </div>
              </div>
            ))}
          </div>
          <button className="forum-row-nav forum-row-nav-next" aria-label="Scroll right" onClick={() => trendRef.current?.scrollBy({ left: by(), behavior: "smooth" })}>›</button>
        </div>
      </div>

      {/* Browse */}
      <div className="forum-browse">
        <aside className="forum-filters">
          <div className="forum-filters-head">
            <div className="forum-filters-head-title">Filters</div>
            <button className="forum-filters-clear" type="button">Clear</button>
          </div>
          <div className="forum-filter-group">
            <div className="forum-filter-label">Category</div>
            {[
              ["Discussion","1,284","accent3"],["News","612","anime"],["Reviews","438","gold"],
              ["Theory","327","accent2"],["Fan Art","291","#ec7bb4"],["Help & Recs","267","novel"],
            ].map(([label, count, color]) => (
              <label key={label} className="forum-check">
                <input type="checkbox" defaultChecked />
                <span className="forum-check-box"></span>
                <span className="cat-dot" style={{ "--chip-c": color.startsWith("#") ? color : `var(--${color})` } as React.CSSProperties}></span>
                <span className="forum-check-text">{label}</span>
                <span className="forum-check-count">{count}</span>
              </label>
            ))}
          </div>
          <div className="forum-filter-group">
            <div className="forum-filter-label">Status</div>
            {["🔥 Hot","✓ Answered","Unanswered","No replies yet"].map((s) => (
              <label key={s} className="forum-check"><input type="checkbox" /><span className="forum-check-box"></span><span className="forum-check-text">{s}</span></label>
            ))}
          </div>
          <div className="forum-filter-group">
            <div className="forum-filter-label">Posted</div>
            {["Today","This week","This month","All time"].map((s) => (
              <label key={s} className="forum-check"><input type="checkbox" /><span className="forum-check-box"></span><span className="forum-check-text">{s}</span></label>
            ))}
          </div>
        </aside>

        <div className="forum-browse-main">
          <div className="forum-browse-toolbar">
            <div className="forum-browse-left">
              <div className="forum-result-count"><strong>{filtered.length.toLocaleString()}</strong> threads</div>
              <button className="forum-new-thread" type="button">New Thread</button>
            </div>
            <div className="forum-sort-wrap">
              <span className="forum-sort-label">Sort</span>
              <select><option>Latest activity</option><option>Newest first</option><option>Hottest</option><option>Most replies</option></select>
            </div>
          </div>
          <div className="forum-threads">
            {filtered.map((t, i) => (
              <div key={i} className="forum-thread" data-cat={t.cat} role="button" tabIndex={0}>
                <div className={`forum-thread-avatar ${t.online ? "online" : ""}`}>{t.author.charAt(0).toUpperCase()}</div>
                <div className="forum-thread-main">
                  <div className="forum-thread-tags">
                    <span className="forum-thread-cat">{t.catLabel}</span>
                    <span className="forum-thread-series">{t.series}</span>
                    {t.hot && <span className="forum-thread-indicator hot">Hot</span>}
                    {t.answered && <span className="forum-thread-indicator answered">Answered</span>}
                  </div>
                  <div className="forum-thread-title">{t.title}</div>
                  <div className="forum-thread-byline">by <span className="forum-user">{t.author}</span></div>
                </div>
                <div className="forum-thread-stats">
                  <div><span className="count-num">{t.replies.toLocaleString()}</span><span className="count-label">replies</span></div>
                  <div><span className="count-num">{t.views}</span><span className="count-label">views</span></div>
                </div>
                <div className="forum-thread-activity">
                  <div className="activity-time">{t.activityTime}</div>
                  <div className="activity-user">by {t.activityUser}</div>
                </div>
              </div>
            ))}
          </div>
          <div className="forum-load-more-wrap">
            <button className="forum-load-more" type="button" onClick={() => setThreadList([...threadList, ...THREADS])}>Load More Threads</button>
          </div>
        </div>
      </div>
    </section>
  );
}