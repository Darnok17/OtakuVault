"use client";

import { useEffect, type ReactNode } from "react";
import { THEMES } from "@/lib/themes";
import { ThemeChips } from "./ThemePicker";
import { useRouter } from "next/navigation";

// ─── Scroll reveal for feature sections ─────────────────────
function setupScrollReveal(): IntersectionObserver | null {
  const revealTargets = document.querySelectorAll(
    ".home-features .feat, .home-features .feat-stats, .home-features .feat-cta"
  );
  if (!revealTargets.length) return null;
  const revealIO = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("in-view");
        revealIO.unobserve(entry.target);
      }
    });
  }, { threshold: 0.18, rootMargin: "0px 0px -40px 0px" });
  revealTargets.forEach((el) => revealIO.observe(el));
  return revealIO;
}

// ─── Stat counter animation ─────────────────────────────────
function setupStatCounters(): IntersectionObserver | null {
  const bigs = document.querySelectorAll<HTMLElement>(".stat-big[data-count]");
  if (!bigs.length) return null;
  const statIO = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      statIO.unobserve(entry.target);
      const el = entry.target as HTMLElement;
      const targetVal = parseInt(el.dataset.count || "0", 10);
      const DURATION = 1400;
      const start = performance.now();
      const tick = (now: number) => {
        const t = Math.min(1, (now - start) / DURATION);
        const eased = 1 - Math.pow(1 - t, 3);
        const value = Math.round(targetVal * eased);
        el.textContent = targetVal >= 1000
          ? value.toLocaleString() + (t === 1 ? "+" : "")
          : String(value);
        if (t < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    });
  }, { threshold: 0.5 });
  bigs.forEach((el) => statIO.observe(el));
  return statIO;
}

export default function HomeClient({ track, board, discover }: { track: ReactNode; board: ReactNode; discover: ReactNode }) {
  const router = useRouter();
  // Scroll reveal + stat counters, wired on every mount (Home can remount with fresh DOM after
  // the router evicts the cached page).
  useEffect(() => {
    const observers = [setupScrollReveal(), setupStatCounters()];
    return () => observers.forEach((io) => io?.disconnect());
  }, []);

  // Helper for tile navigation (click + Enter/Space keyboard)
  const go = (href: string) => () => router.push(href);
  const goKey = (href: string) => (e: React.KeyboardEvent) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      router.push(href);
    }
  };

  return (
    <>
      {/* ─── Home page section ───────────────────────────────── */}
      <section className="site-page active" id="page-home" data-page="home">
        <div className="home-hero">
          <div className="home-eyebrow">◆ Welcome back ◆</div>
          <div className="home-title">OtakuVault</div>
          <div className="home-subtitle">
            Your personal hub for everything anime, manga, webtoon, and light novel. Track what you&apos;ve watched, discover what&apos;s next, and build the ultimate collection.
          </div>
          <div className="home-tiles">
            {/* Your Collection */}
            <div
              className="home-tile"
              role="button"
              tabIndex={0}
              onClick={go("/collection")}
              onKeyDown={goKey("/collection")}
            >
              <span className="home-tile-corner tl"></span>
              <span className="home-tile-corner tr"></span>
              <span className="home-tile-corner bl"></span>
              <span className="home-tile-corner br"></span>
              <div className="home-tile-icon"><svg viewBox="0 0 24 24"><rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/></svg></div>
              <div className="home-tile-header">
                <div className="home-tile-title">Your Collection</div>
                <div className="home-tile-kanji" data-latin="Vault">収蔵庫</div>
              </div>
              <div className="home-tile-desc">Everything you&apos;ve watched or read, ranked and organized. Full tracker with search, filters, moodboards, and connection wires.</div>
              <div className="home-tile-stats" id="tileStatsCollection">
                <span className="stat-chip"><strong>—</strong> entries</span>
                <span className="stat-chip"><strong>—</strong> rated</span>
              </div>
              <div className="home-tile-enter">Enter</div>
            </div>
            {/* Index */}
            <div
              className="home-tile"
              role="button"
              tabIndex={0}
              onClick={go("/index-page")}
              onKeyDown={goKey("/index-page")}
            >
              <span className="home-tile-corner tl"></span>
              <span className="home-tile-corner tr"></span>
              <span className="home-tile-corner bl"></span>
              <span className="home-tile-corner br"></span>
              <div className="home-tile-icon"><svg viewBox="0 0 24 24"><path d="M3 5 L21 5"/><path d="M3 12 L21 12"/><path d="M3 19 L21 19"/><circle cx="7" cy="5" r="1" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1" fill="currentColor" stroke="none"/><circle cx="17" cy="19" r="1" fill="currentColor" stroke="none"/></svg></div>
              <div className="home-tile-header">
                <div className="home-tile-title">Index</div>
                <div className="home-tile-kanji" data-latin="Index">索引</div>
              </div>
              <div className="home-tile-desc">Browse the full database — anime, manga, webtoons, and novels. Discover new titles curated by community rating and genre.</div>
              <div className="home-tile-stats">
                <span className="stat-chip"><strong>12k+</strong> titles</span>
                <span className="stat-chip"><strong>Updated</strong> daily</span>
              </div>
              <div className="home-tile-enter">Browse</div>
            </div>
            {/* Store */}
            <div
              className="home-tile"
              role="button"
              tabIndex={0}
              onClick={go("/store")}
              onKeyDown={goKey("/store")}
            >
              <span className="home-tile-corner tl"></span>
              <span className="home-tile-corner tr"></span>
              <span className="home-tile-corner bl"></span>
              <span className="home-tile-corner br"></span>
              <div className="home-tile-icon"><svg viewBox="0 0 24 24"><path d="M4 7 L20 7 L18.5 20 L5.5 20 Z"/><path d="M8 7 L8 4 Q8 3 9 3 L15 3 Q16 3 16 4 L16 7"/><circle cx="9" cy="13" r="1" fill="currentColor" stroke="none"/><circle cx="15" cy="13" r="1" fill="currentColor" stroke="none"/></svg></div>
              <div className="home-tile-header">
                <div className="home-tile-title">Store</div>
                <div className="home-tile-kanji" data-latin="Wares">商店</div>
              </div>
              <div className="home-tile-desc">Merch, figures, art books, and more. Shop curated collectibles tied to the series you love.</div>
              <div className="home-tile-stats">
                <span className="stat-chip"><strong>Figures</strong></span>
                <span className="stat-chip"><strong>Art books</strong></span>
                <span className="stat-chip"><strong>Apparel</strong></span>
              </div>
              <div className="home-tile-enter">Shop</div>
            </div>
          </div>
        </div>

        {/* ═══ FEATURE SECTIONS ═══ */}
        <div className="home-features">

          {/* F1: TRACK */}
          <section className="feat" data-accent="crimson" data-align="right">
            <div className="feat-content">
              <div className="feat-eyebrow">01 · Track</div>
              <div className="feat-kicker" data-latin="Collection">収蔵</div>
              <h2 className="feat-title">Collection as a Craft</h2>
              <p className="feat-body">
                Every anime, manga, webtoon, and light novel you&apos;ve ever cared about — ranked within rating tiers, rated to half a star, tagged with your own notes. The whole vault lives in one place and remembers everything you&apos;ve touched.
              </p>
              <ul className="feat-points">
                <li>Half-star ratings with drag-reorder inside each tier</li>
                <li>FLIP animations on every move, delete, and restore</li>
                <li>Watchlist auto-separates plan-to-watch entries</li>
                <li>Grid or list view · search · filter · sort</li>
              </ul>
            </div>
            <div className="feat-visual">
              {track}
            </div>
          </section>

          {/* F2: MOODBOARD */}
          <section className="feat" data-accent="teal" data-align="left">
            <div className="feat-visual">
              {board}
            </div>
            <div className="feat-content">
              <div className="feat-eyebrow">02 · Moodboard</div>
              <div className="feat-kicker" data-latin="Moodboards">趣境</div>
              <h2 className="feat-title">Visual Story Webs</h2>
              <p className="feat-body">
                Open any entry&apos;s moodboard and build a canvas of your reactions. Pin character cards, quotes, episode highlights, images, and custom nodes. Drag connections between them with gradient wires that take on each node&apos;s color. The board here is live: drag a node and the wires follow.
              </p>
              <ul className="feat-points">
                <li>8 node types · 8 color themes · fully custom nodes</li>
                <li>Flowing bezier wires or grid-snapped orthogonal routing</li>
                <li>Pan, zoom, multi-select, group drag, Ctrl+Z history</li>
                <li>Middle-click marquee · copy-paste · snap to grid</li>
              </ul>
            </div>
          </section>

          {/* F3: DISCOVER */}
          <section className="feat" data-accent="violet" data-align="right">
            <div className="feat-content">
              <div className="feat-eyebrow">03 · Discover</div>
              <div className="feat-kicker" data-latin="Discovery">発掘</div>
              <h2 className="feat-title">Find Your Next Obsession</h2>
              <p className="feat-body">
                12,000+ titles across every medium, filtered the way you want. Seasonal lineups, trending now, hidden gems, and recommendations tuned to the top-rated picks in your own collection.
              </p>
              <ul className="feat-points">
                <li>Seasonal &ldquo;Fall 2026&rdquo; lineup banners</li>
                <li>Multi-select genre, year, rating, and status filters</li>
                <li>&ldquo;Because you liked…&rdquo; powered by your collection</li>
                <li>Live AniList data on every title page</li>
              </ul>
            </div>
            <div className="feat-visual">
              {discover}
            </div>
          </section>

          {/* F4: DESIGN */}
          <section className="feat feat-design" data-accent="gold">
            <div className="feat-content">
              <div className="feat-eyebrow">04 · Design</div>
              <div className="feat-kicker" data-latin="Design">意匠</div>
              <h2 className="feat-title">{THEMES.length} Selectable Themes</h2>
              <p className="feat-body">
                From {THEMES[0].name} to {THEMES.find((t) => t.id === "anime")!.name}: the same vault as a neon terminal, a parchment codex, a paused VHS tape, a black-and-white grid, a shonen cover or a printed manga page. Each one changes the type, the shapes and the way things move, not just the colors.
              </p>
              <p className="feat-body feat-themes-hint">Pick one. It applies right away and follows your account.</p>
            </div>
            <div className="feat-themes">
              <ThemeChips />
            </div>
          </section>

          {/* Stats band */}
          <section className="feat-stats">
            <div className="stat-cell"><div className="stat-big" data-count="12000">0</div><div className="stat-lbl">titles indexed</div></div>
            <div className="stat-divider"></div>
            <div className="stat-cell"><div className="stat-big" data-count="8">0</div><div className="stat-lbl">node types</div></div>
            <div className="stat-divider"></div>
            <div className="stat-cell"><div className="stat-big" data-count={THEMES.length}>0</div><div className="stat-lbl">themes</div></div>
            <div className="stat-divider"></div>
            <div className="stat-cell"><div className="stat-big">∞</div><div className="stat-lbl">of your taste</div></div>
          </section>

          {/* Final CTA */}
          <section className="feat-cta">
            <div className="feat-cta-eyebrow">◆ Ready ◆</div>
            <h2 className="feat-cta-title">Begin Your Vault</h2>
            <p className="feat-cta-body">Everything above — tracker, moodboards, index, the whole aesthetic — is already yours. One click.</p>
            <button className="feat-cta-btn" type="button" onClick={go("/collection")}>
              <span>Enter Your Collection</span>
              <span className="feat-cta-arrow">❯</span>
            </button>
          </section>

        </div>
      </section>
    </>
  );
}