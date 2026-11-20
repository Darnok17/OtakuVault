"use client";

import { useEffect } from "react";
import { useThemeStore } from "./ThemeProvider";

const MAX_LIVE = 24;
const MIN_GAP_PX = 22;
const COLORS = ["var(--pop)", "var(--acc-1)", "var(--acc-2)"];

// Half-width katakana, digits and a few symbols: the rain's alphabet.
const RAIN_GLYPHS = "ｦｱｳｴｵｶｷｹｺｻｼｽｾｿﾀﾂﾃﾅﾆﾇﾈﾊﾋﾎﾏﾐﾑﾒﾓﾔﾕﾗﾘﾜ0123456789Z:.=*+-<>¦";
const RAIN_CELL = 18;      // px per glyph
const RAIN_FPS = 18;       // the rain steps, it doesn't glide

// Effects that belong to one theme: Comic Strip's sparkle trail (small stars shed by the cursor)
// and Matrix's code rain (a canvas of falling glyphs behind the page). Both run only with screen
// effects switched on in Settings, and never for people who asked their system for reduced motion.
export default function ThemeFx() {
  const theme = useThemeStore((s) => s.theme);
  const fx = useThemeStore((s) => s.fx);
  const ready = useThemeStore((s) => s.ready);

  useEffect(() => {
    if (!ready || theme !== "matrix" || !fx) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const canvas = document.createElement("canvas");
    canvas.className = "mx-rain";
    canvas.setAttribute("aria-hidden", "true");
    // insertBefore, not prepend: cloudflare-env.d.ts merges HTMLRewriter's Element.prepend into the DOM types.
    document.body.insertBefore(canvas, document.body.firstChild);
    const ctx = canvas.getContext("2d");
    if (!ctx) { canvas.remove(); return; }

    // The kanji face is loaded by next/font under a generated family name; read it from the token.
    const family = getComputedStyle(document.documentElement).getPropertyValue("--font-jp").trim() || "monospace";
    let drops: number[] = [];
    let w = 0, h = 0;

    // Drawn at CSS pixels, not device pixels: it sits at low opacity behind the content, and a
    // quarter of the pixels keeps it cheap on high-density screens.
    const resize = () => {
      w = canvas.width = window.innerWidth;
      h = canvas.height = window.innerHeight;
      const cols = Math.ceil(w / RAIN_CELL);
      drops = Array.from({ length: cols }, (_, i) => drops[i] ?? -Math.floor(Math.random() * (h / RAIN_CELL)));
      ctx.font = `${RAIN_CELL - 4}px ${family}`;
      ctx.textBaseline = "top";
    };
    resize();

    let raf = 0, last = 0;
    const step = (t: number) => {
      raf = requestAnimationFrame(step);
      if (t - last < 1000 / RAIN_FPS) return;
      last = t;
      // Fade what is there towards transparent, so the page shows through the trails.
      ctx.globalCompositeOperation = "destination-out";
      ctx.fillStyle = "rgba(0,0,0,.09)";
      ctx.fillRect(0, 0, w, h);
      ctx.globalCompositeOperation = "source-over";
      for (let i = 0; i < drops.length; i++) {
        const y = drops[i] * RAIN_CELL;
        if (y >= 0) {
          const ch = RAIN_GLYPHS[(Math.random() * RAIN_GLYPHS.length) | 0];
          // The head of each stream is near-white, the trail it leaves the theme green.
          ctx.clearRect(i * RAIN_CELL, y - RAIN_CELL, RAIN_CELL, RAIN_CELL);
          ctx.fillStyle = "#00ff41";
          ctx.fillText(RAIN_GLYPHS[(Math.random() * RAIN_GLYPHS.length) | 0], i * RAIN_CELL, y - RAIN_CELL);
          ctx.fillStyle = "#d8ffe0";
          ctx.fillText(ch, i * RAIN_CELL, y);
        }
        if (y > h && Math.random() > .975) drops[i] = -Math.floor(Math.random() * 20);
        else drops[i]++;
      }
    };
    raf = requestAnimationFrame(step);
    window.addEventListener("resize", resize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", resize); canvas.remove(); };
  }, [theme, fx, ready]);

  useEffect(() => {
    if (!ready || theme !== "comic-strip" || !fx) return;
    if (!window.matchMedia("(pointer: fine)").matches || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const layer = document.createElement("div");
    layer.className = "fx-layer";
    layer.setAttribute("aria-hidden", "true");
    document.body.appendChild(layer);
    let lastX = -999, lastY = -999, n = 0;

    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse") return;
      if (Math.hypot(e.clientX - lastX, e.clientY - lastY) < MIN_GAP_PX || layer.childElementCount >= MAX_LIVE) return;
      lastX = e.clientX; lastY = e.clientY;
      const spark = document.createElement("span");
      spark.className = "fx-spark";
      const size = 8 + ((n * 7) % 9);
      spark.style.cssText = `left:${e.clientX}px;top:${e.clientY}px;width:${size}px;height:${size}px;background:${COLORS[n % COLORS.length]};--dx:${((n * 37) % 30) - 15}px;--rot:${(n * 53) % 180}deg;`;
      n++;
      spark.addEventListener("animationend", () => spark.remove(), { once: true });
      layer.appendChild(spark);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    return () => { window.removeEventListener("pointermove", onMove); layer.remove(); };
  }, [theme, fx, ready]);

  return null;
}
