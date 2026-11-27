"use client";

import { useEffect, useState } from "react";
import { Color } from "three";
import { THEMES, toThemeId, DEFAULT_THEME, type ThemeId } from "@/lib/themes";
import type { Tone } from "@/lib/title-graph";

// The 3D scene's look, derived from the active theme's CSS tokens so the web restyles with every
// theme (and live when the theme changes). Each theme also gets a scene "style": glowing additive
// light on dark themes, flat ink on the paper ones.

export type SceneStyle = {
  glow: boolean; // additive halos and blending; off on light themes, where they wash out
  lineOpacity: number;
  dustOpacity: number;
  lineWidth: number; // CSS px; ink themes draw real strokes
  tint: number; // how far the core leans toward the show's own AniList colour
};

export type SceneTheme = {
  id: ThemeId;
  dark: boolean;
  fx: boolean; // the "effects" switch in Settings
  bg: Color;
  fg: Color;
  dim: Color;
  faint: Color;
  ink: Color; // outlines on the paper themes
  tones: Record<Tone, Color>;
  style: SceneStyle;
};

const STYLES: Record<ThemeId, SceneStyle> = {
  matrix: { glow: true, lineOpacity: 0.32, dustOpacity: 0.7, lineWidth: 1, tint: 0.65 },
  retro: { glow: true, lineOpacity: 0.38, dustOpacity: 0.8, lineWidth: 1, tint: 0.65 },
  rustic: { glow: false, lineOpacity: 0.62, dustOpacity: 0.45, lineWidth: 1.6, tint: 0.3 },
  // One red line: the show's colour barely registers, the ink stays black.
  minimal: { glow: false, lineOpacity: 0.5, dustOpacity: 0.25, lineWidth: 1.3, tint: 0.1 },
  "comic-strip": { glow: false, lineOpacity: 0.8, dustOpacity: 0.4, lineWidth: 2.2, tint: 0.4 },
  manga: { glow: false, lineOpacity: 0.7, dustOpacity: 0.35, lineWidth: 1.8, tint: 0.15 },
};

// WCAG contrast between two colours (three.js keeps them linear, which is what the formula wants).
const luminance = (c: Color) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;
function contrast(a: Color, b: Color) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}
// Pulls a colour toward the text colour until it stands out from the background: the paper
// themes' golds and pinks are made for fills, not for 1-2px strokes on cream.
function legible(c: Color, bg: Color, fg: Color, min = 3) {
  const out = c.clone();
  for (let i = 0; i < 12 && contrast(out, bg) < min; i++) out.lerp(fg, 0.15);
  return out;
}

const TONES: Tone[] = ["acc-1", "acc-2", "acc-3", "gold", "azure", "violet", "rose", "orange"];

function read(): SceneTheme {
  const root = document.documentElement;
  const css = getComputedStyle(root);
  const color = (name: string, fallback: string) => {
    const c = new Color();
    // Tokens are hex in every theme file; anything Color can't parse falls back quietly.
    try { c.setStyle(css.getPropertyValue(`--${name}`).trim() || fallback); } catch { c.setStyle(fallback); }
    return c;
  };
  const id = toThemeId(root.getAttribute("data-theme")) ?? DEFAULT_THEME;
  const bg = color("bg", "#0a0a0f"), fg = color("fg", "#e8e8f0");
  return {
    id,
    dark: THEMES.find((t) => t.id === id)!.mode === "dark",
    fx: root.getAttribute("data-fx") !== "off",
    bg,
    fg,
    dim: legible(color("fg-dim", "#7a7a9a"), bg, fg, 2.5),
    faint: color("fg-faint", "#5a5a7a"),
    ink: fg.clone().lerp(bg, 0.12),
    tones: Object.fromEntries(TONES.map((t) => [t, legible(color(t, "#00d4aa"), bg, fg)])) as Record<Tone, Color>,
    style: STYLES[id],
  };
}

export function useSceneTheme(): SceneTheme | null {
  const [theme, setTheme] = useState<SceneTheme | null>(null);
  useEffect(() => {
    const update = () => setTheme(read());
    update();
    // Settings and the theme picker change these attributes in place; follow them live.
    const obs = new MutationObserver(update);
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme", "data-fx"] });
    return () => obs.disconnect();
  }, []);
  return theme;
}

// The core's colour: the show's own AniList colour, pulled toward the theme's interface accent so
// it never clashes with the theme (and stays readable on paper themes).
export function coreColor(theme: SceneTheme, showColor: string | null): Color {
  const base = theme.tones["acc-3"].clone();
  if (!showColor) return base;
  try { return legible(base.lerp(new Color(showColor), theme.style.tint), theme.bg, theme.fg); } catch { return base; }
}

export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return reduced;
}
