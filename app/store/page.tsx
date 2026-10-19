"use client";

import { useState, useRef, useEffect } from "react";

const POOL = [
  { title:"Thorfinn 1/7 Scale Figure",   brand:"Max Factory",   series:"Vinland Saga",         price:189.99, hue:"crimson", glyph:"剣", badge:"ltd",  cat:"figures" },
  { title:"Frieren Nendoroid",           brand:"Good Smile Co.",series:"Frieren",              price:62.99,  hue:"teal",    glyph:"葬", badge:"new",  cat:"figures" },
  { title:"JJK: Gojo Satoru Figma",      brand:"Max Factory",   series:"Jujutsu Kaisen",       price:89.99,  hue:"crimson", glyph:"呪", badge:null,   cat:"figures" },
  { title:"Dandadan Momo Figure",        brand:"Alter",         series:"Dandadan",             price:159.99, hue:"violet",  glyph:"壇", badge:"new",  cat:"figures" },
  { title:"Berserk Art Book Deluxe",     brand:"Dark Horse",    series:"Berserk",              price:49.99,  hue:"crimson", glyph:"剣", badge:null,   cat:"artbooks" },
  { title:"Vinland Saga Deluxe Vol 1",   brand:"Kodansha",      series:"Vinland Saga",         price:34.99,  hue:"crimson", glyph:"海", badge:null,   cat:"manga" },
  { title:"Dungeon Meshi Full Set",      brand:"Yen Press",     series:"Delicious in Dungeon", price:189.99, hue:"gold",    glyph:"食", badge:"sale", cat:"manga" },
  { title:"Chainsaw Man Hoodie",         brand:"GSC Apparel",   series:"Chainsaw Man",         price:69.99,  hue:"crimson", glyph:"鋸", badge:"new",  cat:"apparel" },
  { title:"Monogatari Series Poster Set",brand:"BanPresto",     series:"Monogatari",           price:24.99,  hue:"violet",  glyph:"物", badge:null,   cat:"posters" },
  { title:"Mob Psycho 100 Keychain",     brand:"ChibiCraft",    series:"Mob Psycho 100",       price:12.99,  hue:"teal",    glyph:"霊", badge:null,   cat:"keychains" },
  { title:"Attack on Titan Plushie",     brand:"Sanshee",       series:"Attack on Titan",      price:34.99,  hue:"crimson", glyph:"進", badge:"sale", cat:"plushies" },
  { title:"Oshi no Ko Vinyl Figure",     brand:"Good Smile Co.",series:"Oshi no Ko",           price:79.99,  hue:"violet",  glyph:"推", badge:"new",  cat:"figures" },
  { title:"Delicious in Dungeon Cookbook",brand:"Yen Press",    series:"Delicious in Dungeon", price:28.99,  hue:"gold",    glyph:"迷", badge:null,   cat:"artbooks" },
  { title:"Hunter x Hunter T-Shirt",     brand:"HxH Store",     series:"Hunter x Hunter",      price:29.99,  hue:"teal",    glyph:"狩", badge:null,   cat:"apparel" },
  { title:"Steins;Gate Mug",             brand:"BanPresto",     series:"Steins;Gate",          price:18.99,  hue:"violet",  glyph:"鋼", badge:null,   cat:"keychains" },
  { title:"Spice & Wolf LN Vol 1-6",     brand:"Yen Press",     series:"Spice & Wolf",         price:84.99,  hue:"orange",  glyph:"狼", badge:null,   cat:"manga" },
  { title:"Vagabond Collector's Box",    brand:"Viz Media",     series:"Vagabond",             price:349.99, hue:"violet",  glyph:"武", badge:"ltd",  cat:"manga" },
  { title:"Blue Lock Isagi Figure",      brand:"Kotobukiya",    series:"Blue Lock",            price:109.99, hue:"teal",    glyph:"蒼", badge:"new",  cat:"figures" },
];

const fmtPrice = (p: number) => `$${p.toFixed(2)}`;

function ProductCard({ p }: { p: typeof POOL[number] }) {
  const [saved, setSaved] = useState(false);
  const [added, setAdded] = useState(false);
  const hueVar =
    p.hue === "teal"    ? "accent3" :
    p.hue === "crimson" ? "accent"  :
    p.hue === "violet"  ? "accent2" :
    p.hue === "gold"    ? "gold"    : "novel";
  return (
    <div className="product" style={{ "--prod-accent": `var(--${hueVar})` } as React.CSSProperties} role="button" tabIndex={0}>
      <div className="product-img">
        <div className="product-glyph">{p.glyph}</div>
        {p.badge && <div className={`product-badge ${p.badge}`}>{p.badge.toUpperCase()}</div>}
        <button
          className={`product-wishlist ${saved ? "saved" : ""}`}
          type="button"
          aria-label="Add to wishlist"
          onClick={(e) => { e.stopPropagation(); setSaved(!saved); }}
        />
      </div>
      <div className="product-info">
        <div className="product-brand">{p.brand}</div>
        <div className="product-name">{p.title}</div>
        <div className="product-series">{p.series}</div>
        <div className="product-footer">
          <span className="product-price">{fmtPrice(p.price)}</span>
          <button
            className="product-cart"
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setAdded(true);
              setTimeout(() => setAdded(false), 1200);
            }}
          >
            {added ? "✓ Added" : "+ Cart"}
          </button>
        </div>
      </div>
    </div>
  );
}

function ProductRow({ items }: { items: typeof POOL }) {
  const ref = useRef<HTMLDivElement>(null);
  const by = () => Math.round((ref.current?.clientWidth || 600) * 0.75);
  return (
    <div className="store-row-track">
      <button className="store-row-nav store-row-nav-prev" aria-label="Scroll left" onClick={() => ref.current?.scrollBy({ left: -by(), behavior: "smooth" })}>‹</button>
      <div className="store-row-scroll" ref={ref}>
        {items.map((p, i) => <ProductCard key={i} p={p} />)}
      </div>
      <button className="store-row-nav store-row-nav-next" aria-label="Scroll right" onClick={() => ref.current?.scrollBy({ left: by(), behavior: "smooth" })}>›</button>
    </div>
  );
}

export default function StorePage() {
  const [activeCat, setActiveCat] = useState("all");
  const [grid, setGrid] = useState(POOL);
  const [trending, setTrending] = useState(POOL.slice(0, 12));

  // Shuffle after mount — Math.random can't run during Next.js 16 prerender
  useEffect(() => {
    setTrending([...POOL].sort(() => Math.random() - 0.5).slice(0, 12));
  }, []);

  const chips = [
    ["all","All"],["figures","Figures"],["artbooks","Art Books"],["posters","Posters"],
    ["apparel","Apparel"],["plushies","Plushies"],["keychains","Keychains"],["manga","Manga Vols"],
  ];

  const picked = POOL.filter((p) => ["figures","manga","artbooks"].includes(p.cat)).slice(0, 12);
  const newArr = [...POOL].sort((a,b) => (a.badge === "new" ? 0 : 1) - (b.badge === "new" ? 0 : 1)).slice(0, 12);

  return (
    <section className="site-page active" id="page-store" data-page="store">
      <div className="store-hero">
        <div className="store-hero-inner">
          <div className="store-eyebrow">◆ Merch ◆</div>
          <div className="store-title">The <span className="accent">Store</span></div>
          <div className="store-kanji">商店</div>
          <div className="store-search-wrap">
            <span className="store-search-icon" aria-hidden="true">
              <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/></svg>
            </span>
            <input type="text" placeholder="Search figures, art books, posters, apparel…" />
          </div>
          <div className="store-cat-chips">
            {chips.map(([k, label]) => (
              <button key={k} className={`store-cat-chip ${activeCat === k ? "active" : ""}`} data-cat={k} onClick={() => setActiveCat(k)}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Picked for you */}
      <div className="store-section" data-accent="crimson">
        <div className="store-section-header">
          <div className="store-section-title">Picked for You <span className="store-section-kanji">あなた向け</span></div>
          <div className="store-section-meta">BASED ON YOUR TOP-RATED</div>
        </div>
        <div className="store-rec-note">
          Because you rated <span className="series-pill">Vinland Saga</span> highly — here's a hand-picked lineup of merch for the series you love.
        </div>
        <ProductRow items={picked} />
      </div>

      {/* Featured banner */}
      <div className="store-featured">
        <div className="store-featured-card">
          <div className="store-featured-info">
            <span className="store-featured-tag">◆ Limited drop ◆</span>
            <div className="store-featured-title">Fall 2026 Figure Collection</div>
            <div className="store-featured-sub">
              Hand-sculpted scale figures from the season's biggest shows. Pre-orders ship December — reserve yours before stock closes.
            </div>
            <button className="store-featured-cta" type="button">
              <span>Browse Collection</span><span>❯</span>
            </button>
          </div>
          <div className="store-featured-visual">
            <div className="store-featured-glyph">秋</div>
          </div>
        </div>
      </div>

      {/* New arrivals */}
      <div className="store-section" data-accent="teal">
        <div className="store-section-header">
          <div className="store-section-title">New Arrivals <span className="store-section-kanji">新着</span></div>
          <div className="store-section-meta">THIS WEEK · 24 ITEMS</div>
        </div>
        <ProductRow items={newArr} />
      </div>

      {/* Browse */}
      <div className="store-browse">
        <aside className="store-filters">
          <div className="store-filters-head">
            <div className="store-filters-head-title">Filters</div>
            <button className="store-filters-clear" type="button">Clear</button>
          </div>
          <div className="store-filter-group">
            <div className="store-filter-label">Category</div>
            {[["Figures","1,284"],["Art Books","342"],["Posters","918"],["Apparel","612"],["Plushies","287"],["Keychains","1,420"],["Manga Volumes","3,842"]].map(([t,c]) => (
              <label key={t} className="store-check"><input type="checkbox" defaultChecked /><span className="store-check-box"></span><span className="store-check-text">{t}</span><span className="store-check-count">{c}</span></label>
            ))}
          </div>
          <div className="store-filter-group">
            <div className="store-filter-label">Price</div>
            <div className="store-price-range">
              <span className="currency">$</span>
              <input type="number" placeholder="0" min={0} />
              <span>→</span>
              <input type="number" placeholder="500" min={0} />
            </div>
          </div>
          <div className="store-filter-group">
            <div className="store-filter-label">Availability</div>
            {["In Stock Only","Pre-Order","On Sale"].map((s) => (
              <label key={s} className="store-check"><input type="checkbox" /><span className="store-check-box"></span><span className="store-check-text">{s}</span></label>
            ))}
          </div>
          <div className="store-filter-group">
            <div className="store-filter-label">Brand</div>
            {["Good Smile Co.","Bandai","Kotobukiya","Max Factory","Alter","Prime 1 Studio"].map((s) => (
              <label key={s} className="store-check"><input type="checkbox" /><span className="store-check-box"></span><span className="store-check-text">{s}</span></label>
            ))}
          </div>
        </aside>

        <div className="store-browse-main">
          <div className="store-browse-toolbar">
            <div className="store-result-count"><strong>8,705</strong> products</div>
            <div className="store-sort-wrap">
              <span className="store-sort-label">Sort</span>
              <select><option>Featured</option><option>Newest</option><option>Price ↑</option><option>Price ↓</option></select>
            </div>
          </div>
          <div className="store-grid">
            {grid.map((p, i) => <ProductCard key={i} p={p} />)}
          </div>
          <div className="store-load-more-wrap">
            <button
              className="store-load-more"
              type="button"
              onClick={() => {
                const shuffled = [...POOL].sort(() => Math.random() - 0.5);
                setGrid([...grid, ...shuffled]);
              }}
            >
              Load More
            </button>
          </div>
        </div>
      </div>

      {/* Trending bottom row */}
      <div className="store-section" data-accent="gold">
        <div className="store-section-header">
          <div className="store-section-title">Trending <span className="store-section-kanji">人気</span></div>
          <div className="store-section-meta">BEST SELLERS THIS WEEK</div>
        </div>
        <ProductRow items={trending} />
      </div>
    </section>
  );
}