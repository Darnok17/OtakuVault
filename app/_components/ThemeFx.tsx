"use client";

import { useEffect } from "react";
import { useThemeStore } from "./ThemeProvider";

const MAX_LIVE = 24;
const MIN_GAP_PX = 22;
const COLORS = ["var(--pop)", "var(--acc-1)", "var(--acc-2)"];

// Pointer effects that belong to one theme. Today that is Super Anime's sparkle trail: small
// stars shed by the cursor. It only runs with a mouse (not touch), with screen effects switched
// on in Settings, and never for people who asked their system for reduced motion.
export default function ThemeFx() {
  const theme = useThemeStore((s) => s.theme);
  const fx = useThemeStore((s) => s.fx);
  const ready = useThemeStore((s) => s.ready);

  useEffect(() => {
    if (!ready || theme !== "anime" || !fx) return;
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
