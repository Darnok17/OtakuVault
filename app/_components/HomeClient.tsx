"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Module-level flag survives Strict Mode's double-mount and Fast Refresh.
let bootStarted = false;

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

export default function HomeClient() {
  const router = useRouter();

  useEffect(() => {
    // ─── Strict Mode guard (silent no-op) ───────────────────────
    if (bootStarted) {
      return;
    }

    // ─── Prior-session guard ────────────────────────────────────
    if (sessionStorage.getItem("booted")) {
      document.body.classList.remove("booting");
      document.body.classList.add("boot-complete", "post-boot");
      return;
    }

    bootStarted = true;
    document.body.classList.add("booting");

    // ─── Build the overlay in plain DOM (outside React's tree) ──
    document.getElementById("bootOverlay")?.remove();

    const overlay = document.createElement("div");
    overlay.id = "bootOverlay";
    overlay.className = "boot-overlay";
    overlay.setAttribute("aria-hidden", "true");
    overlay.innerHTML = `
      <div class="boot-backdrop"></div>
      <div class="boot-scan" id="bootScan"></div>
      <div class="boot-stack">
        <div class="boot-term" id="bootTerm">
          <div class="boot-chrome-bar">
            <span class="boot-chrome-powerline"></span>
            <span class="boot-chrome-title">user@otaku ~ /otakuvault</span>
            <span class="boot-chrome-tty">tty1</span>
          </div>
          <div class="boot-screen">
            <div class="boot-lines" id="bootLines"></div>
          </div>
        </div>
        <div class="boot-logo-wrap" id="bootLogoWrap">
          <div class="boot-logo-letters" id="bootLetters">
            <span>O</span><span>t</span><span>a</span><span>k</span><span>u</span><span>V</span><span>a</span><span>u</span><span>l</span><span>t</span>
          </div>
          <div class="boot-logo-solid logo-main" id="bootLogo">OtakuVault</div>
        </div>
      </div>
      <div class="boot-hint" id="bootHint"></div>
      <div class="boot-progress" id="bootProgress">
        <div class="boot-progress-fill" id="bootProgressFill"></div>
      </div>
    `;
    document.body.appendChild(overlay);

    const lines    = overlay.querySelector("#bootLines")        as HTMLElement;
    const letters  = overlay.querySelector("#bootLetters")      as HTMLElement;
    const wrap     = overlay.querySelector("#bootLogoWrap")     as HTMLElement;
    const hint     = overlay.querySelector("#bootHint")         as HTMLElement;
    const progFill = overlay.querySelector("#bootProgressFill") as HTMLElement;

    let readyForEnter = false;
    let finished = false;

    // ─── Fake Hyprland boot output ──────────────────────────────
    type Line =
      | { kind: "prompt"; text: string }
      | { kind: "spacer" }
      | { kind: "task"; text: string; ok: boolean }
      | { kind: "done"; text: string };

    const BOOT_LINES: Line[] = [
      { kind: "prompt", text: "otakuvault --init" },
      { kind: "spacer" },
      { kind: "task",   text: "resolving dependencies",       ok: true },
      { kind: "task",   text: "mounting vault at /mnt/otaku", ok: true },
      { kind: "task",   text: "loading 348 entries",          ok: true },
      { kind: "task",   text: "initializing render engine",   ok: true },
      { kind: "spacer" },
      { kind: "done",   text: "boot sequence complete (0.42s)" },
    ];

    // ─── Line builders ──────────────────────────────────────────
    function addPromptLine() {
      const el = document.createElement("div");
      el.className = "boot-line";
      el.innerHTML = `
        <span class="boot-line-left">
          <span class="prompt-cmd"><span class="user">user@otaku</span>:<span class="path">~</span>$ <span class="cmd typed"></span></span><span class="caret"></span>
        </span>`;
      lines.appendChild(el);
      return {
        target: el.querySelector(".cmd.typed") as HTMLElement,
        caret:  el.querySelector(".caret")      as HTMLElement,
      };
    }
    function addTaskLine(hasOk: boolean) {
      const el = document.createElement("div");
      el.className = "boot-line";
      el.innerHTML = `
        <span class="boot-line-left"><span class="pp">::</span><span class="typed"></span><span class="caret"></span></span>
        ${hasOk ? '<span class="boot-line-right"><span class="ok" style="opacity:0">  OK  </span></span>' : ""}`;
      lines.appendChild(el);
      return {
        target: el.querySelector(".typed") as HTMLElement,
        caret:  el.querySelector(".caret") as HTMLElement,
        ok:     el.querySelector(".ok")    as HTMLElement | null,
      };
    }
    function addDoneLine() {
      const el = document.createElement("div");
      el.className = "boot-line";
      el.innerHTML = `<span class="boot-line-left"><span class="pp">::</span><span class="success typed"></span></span>`;
      lines.appendChild(el);
      return { target: el.querySelector(".typed") as HTMLElement };
    }
    function addSpacer() {
      const el = document.createElement("div");
      el.className = "boot-line";
      el.innerHTML = "&nbsp;";
      lines.appendChild(el);
    }

    // ─── Core typing animation ──────────────────────────────────
    function typeInto(target: HTMLElement, caret: HTMLElement | null, text: string, perChar: number) {
      return new Promise<void>((resolve) => {
        let i = 0;
        const tick = () => {
          if (i < text.length) {
            target.textContent += text[i++];
            setTimeout(tick, perChar + Math.random() * 6);
          } else {
            if (caret && caret.parentNode) caret.parentNode.removeChild(caret);
            resolve();
          }
        };
        tick();
      });
    }
    function wait(ms: number) {
      return new Promise<void>((r) => setTimeout(r, ms));
    }

    // ─── Main boot sequence ─────────────────────────────────────
    async function runBoot() {
      await wait(220);
      let step = 0;
      const totalSteps = BOOT_LINES.length;
      for (const line of BOOT_LINES) {
        if (line.kind === "spacer") {
          addSpacer();
        } else if (line.kind === "prompt") {
          const { target, caret } = addPromptLine();
          await typeInto(target, caret, line.text, 22);
          await wait(140);
        } else if (line.kind === "task") {
          const { target, caret, ok } = addTaskLine(line.ok);
          target.textContent = " ";
          await typeInto(target, caret, " " + line.text, 12);
          if (ok) {
            await wait(60 + Math.random() * 80);
            ok.style.transition = "opacity .2s ease-out";
            ok.style.opacity = "1";
          }
          await wait(40);
        } else if (line.kind === "done") {
          const { target } = addDoneLine();
          await typeInto(target, null, " " + line.text, 14);
        }
        step++;
        progFill.style.width = Math.round((step / totalSteps) * 100) + "%";
      }
      await wait(260);

      letters.classList.add("revealing");
      await wait(650);

      await wait(140);
      hint.textContent = "press any key or click to enter";
      hint.classList.add("visible");
      overlay.style.cursor = "pointer";
      readyForEnter = true;
      armEnterListener();
    }

    // ─── User can enter now ─────────────────────────────────────
    function armEnterListener() {
      const onEnter = (e: Event) => {
        if (!readyForEnter || finished) return;
        e.preventDefault?.();
        cleanup();
        morphToLayout();
      };
      const onKey = (e: KeyboardEvent) => {
        if (!readyForEnter || finished) return;
        e.preventDefault();
        cleanup();
        morphToLayout();
      };
      function cleanup() {
        overlay.removeEventListener("click", onEnter);
        document.removeEventListener("keydown", onKey);
      }
      overlay.addEventListener("click", onEnter);
      document.addEventListener("keydown", onKey);
    }

    // ─── The flight: boot logo → nav logo ──────────────────────
    function morphToLayout() {
      if (finished) return;
      finished = true;
      sessionStorage.setItem("booted", "1");

      const fontsReady =
        document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();

      fontsReady.then(() => {
        requestAnimationFrame(() => {
          const target = document.querySelector(".site-nav .logo-main") as HTMLElement | null;
          if (!target) {
            skip();
            return;
          }

          hint.classList.remove("visible");

          const srcRect = wrap.getBoundingClientRect();
          const dstRect = target.getBoundingClientRect();
          const srcCX = srcRect.left + srcRect.width / 2;
          const srcCY = srcRect.top + srcRect.height / 2;
          const dstCX = dstRect.left + dstRect.width / 2;
          const dstCY = dstRect.top + dstRect.height / 2;
          const dx = dstCX - srcCX;
          const dy = dstCY - srcCY;

          const targetFontPx = parseFloat(getComputedStyle(target).fontSize);
          const bootLetters  = wrap.querySelector(".boot-logo-letters") as HTMLElement;
          const bootFontPx   = parseFloat(getComputedStyle(bootLetters).fontSize);
          const landScale    = targetFontPx / bootFontPx;

          document.body.classList.add("morphing");
          overlay.classList.add("morphing");
          overlay.classList.add("scanning");
          document.body.classList.remove("booting");
          document.body.classList.add("boot-complete");

          wrap.classList.add("flying");
          wrap.style.transform = `translate(${dx}px, ${dy}px) scale(${landScale})`;

          setTimeout(() => {
            wrap.style.transition = "none";
            wrap.style.opacity = "0";
            document.body.classList.remove("morphing");
          }, 950);
          setTimeout(() => {
            overlay.classList.add("done");
            setTimeout(() => overlay.remove(), 400);
          }, 1250);
          setTimeout(() => {
            document.body.classList.add("post-boot");
          }, 2600);
        });
      });
    }

    // ─── Safety fallback ────────────────────────────────────────
    function skip() {
      if (finished) return;
      finished = true;
      sessionStorage.setItem("booted", "1");
      document.body.classList.remove("booting");
      document.body.classList.add("boot-complete", "post-boot");
      overlay.classList.add("done");
      setTimeout(() => overlay.remove(), 400);
    }

    // ─── Dev shortcut: Alt+B replays the boot ───────────────────
    const devReset = (e: KeyboardEvent) => {
      if (e.altKey && e.key.toLowerCase() === "b") {
        e.preventDefault();
        sessionStorage.clear();
        location.reload();
      }
    };
    document.addEventListener("keydown", devReset);

    // Give fonts + layout a frame to settle, then kick off the boot
    requestAnimationFrame(() => requestAnimationFrame(runBoot));
  }, []);

  // Scroll reveal + stat counters, wired on every mount. Kept out of the boot
  // effect: its bootStarted guard skips everything when Home remounts with
  // fresh DOM (e.g. after the router evicts the cached page), which left the
  // feature sections permanently hidden until a reload. Waits for body.post-boot
  // so nothing reveals behind the boot overlay on tall screens.
  useEffect(() => {
    let observers: (IntersectionObserver | null)[] = [];
    const start = () => { observers = [setupScrollReveal(), setupStatCounters()]; };

    const body = document.body;
    if (body.classList.contains("post-boot")) {
      start();
      return () => observers.forEach((io) => io?.disconnect());
    }
    const bootWatch = new MutationObserver(() => {
      if (!body.classList.contains("post-boot")) return;
      bootWatch.disconnect();
      start();
    });
    bootWatch.observe(body, { attributes: true, attributeFilter: ["class"] });
    return () => {
      bootWatch.disconnect();
      observers.forEach((io) => io?.disconnect());
    };
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
            Your personal hub for everything anime, manga, webtoon, and light novel. Track what you've watched, discover what's next, and build the ultimate collection.
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
                <div className="home-tile-kanji">収蔵庫</div>
              </div>
              <div className="home-tile-desc">Everything you've watched or read, ranked and organized. Full tracker with search, filters, moodboards, and connection wires.</div>
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
                <div className="home-tile-kanji">索引</div>
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
                <div className="home-tile-kanji">商店</div>
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
              <div className="feat-kicker">収蔵</div>
              <h2 className="feat-title">Collection as a Craft</h2>
              <p className="feat-body">
                Every anime, manga, webtoon, and light novel you've ever cared about — ranked within rating tiers, rated to half a star, tagged with your own notes. The whole vault lives in one place and remembers everything you've touched.
              </p>
              <ul className="feat-points">
                <li>Half-star ratings with drag-reorder inside each tier</li>
                <li>FLIP animations on every move, delete, and restore</li>
                <li>Watchlist auto-separates plan-to-watch entries</li>
                <li>Grid or list view · search · filter · sort</li>
              </ul>
            </div>
            <div className="feat-visual">
              <div className="demo-grid">
                <div className="demo-card" style={{ "--c": "var(--anime)" } as React.CSSProperties}><div className="demo-cover">呪</div><div className="demo-rank">#1</div><div className="demo-stars"><span></span><span></span><span></span><span></span><span></span></div></div>
                <div className="demo-card" style={{ "--c": "var(--manga)" } as React.CSSProperties}><div className="demo-cover">海</div><div className="demo-rank">#2</div><div className="demo-stars"><span></span><span></span><span></span><span></span><span></span></div></div>
                <div className="demo-card" style={{ "--c": "var(--webtoon)" } as React.CSSProperties}><div className="demo-cover">覚</div><div className="demo-rank">#3</div><div className="demo-stars"><span></span><span></span><span></span><span></span><span></span></div></div>
                <div className="demo-card" style={{ "--c": "var(--gold)" } as React.CSSProperties}><div className="demo-cover">鋼</div><div className="demo-rank">#4</div><div className="demo-stars"><span></span><span></span><span></span><span></span><span></span></div></div>
                <div className="demo-card" style={{ "--c": "var(--novel)" } as React.CSSProperties}><div className="demo-cover">零</div><div className="demo-rank">#5</div><div className="demo-stars"><span></span><span></span><span></span><span></span><span></span></div></div>
                <div className="demo-card" style={{ "--c": "var(--accent2)" } as React.CSSProperties}><div className="demo-cover">薬</div><div className="demo-rank">#6</div><div className="demo-stars"><span></span><span></span><span></span><span></span><span></span></div></div>
              </div>
            </div>
          </section>

          {/* F2: MOODBOARD */}
          <section className="feat" data-accent="teal" data-align="left">
            <div className="feat-visual">
              <div className="demo-board">
                <svg className="demo-board-wires" viewBox="0 0 300 220" preserveAspectRatio="none">
                  <defs>
                    <linearGradient id="demoWire1" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0%" stopColor="#e94560"/>
                      <stop offset="100%" stopColor="#5aa9e6"/>
                    </linearGradient>
                    <linearGradient id="demoWire2" x1="0" y1="0" x2="1" y2="0">
                      <stop offset="0%" stopColor="#5aa9e6"/>
                      <stop offset="100%" stopColor="#f5c842"/>
                    </linearGradient>
                    <linearGradient id="demoWire3" x1="0" y1="1" x2="1" y2="0">
                      <stop offset="0%" stopColor="#f5c842"/>
                      <stop offset="100%" stopColor="#e94560"/>
                    </linearGradient>
                  </defs>
                  <path className="demo-wire" d="M80,55 C110,80 160,100 180,120" stroke="url(#demoWire1)"/>
                  <path className="demo-wire" d="M180,120 C210,130 230,150 240,160" stroke="url(#demoWire2)"/>
                  <path className="demo-wire" d="M240,160 C180,180 120,180 90,170" stroke="url(#demoWire3)"/>
                </svg>
                <div className="demo-node demo-node-img"    style={{ "--c": "var(--anime)",   top: "12%", left: "12%" } as React.CSSProperties}><span className="demo-node-label">IMG</span>画</div>
                <div className="demo-node demo-node-char"   style={{ "--c": "#5aa9e6",        top: "48%", left: "52%" } as React.CSSProperties}><span className="demo-node-label">CHAR</span>人</div>
                <div className="demo-node demo-node-quote"  style={{ "--c": "var(--gold)",    top: "68%", left: "76%" } as React.CSSProperties}><span className="demo-node-label">QUOTE</span>言</div>
                <div className="demo-node demo-node-note"   style={{ "--c": "var(--accent3)", top: "72%", left: "18%" } as React.CSSProperties}><span className="demo-node-label">NOTE</span>記</div>
              </div>
            </div>
            <div className="feat-content">
              <div className="feat-eyebrow">02 · Moodboard</div>
              <div className="feat-kicker">趣境</div>
              <h2 className="feat-title">Visual Story Webs</h2>
              <p className="feat-body">
                Open any entry's moodboard and build a canvas of your reactions. Pin character cards, quotes, episode highlights, images, and custom nodes. Drag connections between them with gradient wires that take on each node's color.
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
              <div className="feat-kicker">発掘</div>
              <h2 className="feat-title">Find Your Next Obsession</h2>
              <p className="feat-body">
                12,000+ titles across every medium, filtered the way you want. Seasonal lineups, trending now, hidden gems, and recommendations tuned to the top-rated picks in your own collection.
              </p>
              <ul className="feat-points">
                <li>Seasonal "Fall 2026" lineup banners</li>
                <li>Multi-select genre, year, rating, and status filters</li>
                <li>"Because you liked…" powered by your collection</li>
                <li>AniList + Jikan database integration</li>
              </ul>
            </div>
            <div className="feat-visual">
              <div className="demo-fan">
                <div className="demo-fan-card" style={{ "--c": "var(--manga)" } as React.CSSProperties}><span>剣</span></div>
                <div className="demo-fan-card" style={{ "--c": "var(--anime)" } as React.CSSProperties}><span>推</span></div>
                <div className="demo-fan-card" style={{ "--c": "var(--accent3)" } as React.CSSProperties}><span>葬</span></div>
                <div className="demo-fan-card" style={{ "--c": "var(--gold)" } as React.CSSProperties}><span>食</span></div>
                <div className="demo-fan-card" style={{ "--c": "var(--novel)" } as React.CSSProperties}><span>転</span></div>
              </div>
            </div>
          </section>

          {/* F4: DESIGN */}
          <section className="feat" data-accent="gold" data-align="left">
            <div className="feat-visual">
              <div className="demo-term">
                <div className="demo-term-chrome">
                  <span className="demo-term-tag">OTAKU</span>
                  <span className="demo-term-title">user@otaku ~ /otakuvault</span>
                  <span className="demo-term-tty">TTY1</span>
                </div>
                <div className="demo-term-body">
                  <div className="demo-term-line"><span className="pp">::</span> initializing vault<span className="demo-dots"></span><span className="ok">[  OK  ]</span></div>
                  <div className="demo-term-line"><span className="pp">::</span> loading database<span className="demo-dots"></span><span className="ok">[  OK  ]</span></div>
                  <div className="demo-term-line"><span className="pp">::</span> render engine ready<span className="demo-dots"></span><span className="ok">[  OK  ]</span></div>
                  <div className="demo-term-line demo-term-done"><span className="pp">::</span> boot complete (0.42s)<span className="caret"></span></div>
                </div>
              </div>
            </div>
            <div className="feat-content">
              <div className="feat-eyebrow">04 · Design</div>
              <div className="feat-kicker">意匠</div>
              <h2 className="feat-title">Built for the Terminal Lover</h2>
              <p className="feat-body">
                A dark Hyprland-inspired aesthetic from the boot screen on down. CRT scanlines, powerline chrome, kanji accents, color-coded sections — every pixel earns its place. Keyboard shortcuts throughout.
              </p>
              <ul className="feat-points">
                <li>Terminal boot animation with "press to enter"</li>
                <li>Keyboard shortcuts: ⌃Z undo · B bubble · G snap grid</li>
                <li>Scroll-snap views · GPU-accelerated FLIP · 60fps drag</li>
                <li>Zero backend. Pure HTML. Save as .html and it works.</li>
              </ul>
            </div>
          </section>

          {/* Stats band */}
          <section className="feat-stats">
            <div className="stat-cell"><div className="stat-big" data-count="12000">0</div><div className="stat-lbl">titles indexed</div></div>
            <div className="stat-divider"></div>
            <div className="stat-cell"><div className="stat-big" data-count="8">0</div><div className="stat-lbl">node types</div></div>
            <div className="stat-divider"></div>
            <div className="stat-cell"><div className="stat-big" data-count="4">0</div><div className="stat-lbl">media types</div></div>
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