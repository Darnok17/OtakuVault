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
  shell: "plexus" | "ink"; // the core's geodesic: glowing wireframe or ink outline
};

export type SceneTheme = {
  id: ThemeId;
  dark: boolean;
  fx: boolean; // the "effects" switch in Settings
  bg: Color;
  fg: Color;
  dim: Color;
  faint: Color;
  tones: Record<Tone, Color>;
  style: SceneStyle;
};

const STYLES: Record<ThemeId, SceneStyle> = {
  terminal: { glow: true, lineOpacity: 0.32, dustOpacity: 0.7, shell: "plexus" },
  retro: { glow: true, lineOpacity: 0.38, dustOpacity: 0.8, shell: "plexus" },
  rustic: { glow: false, lineOpacity: 0.45, dustOpacity: 0.45, shell: "ink" },
  minimal: { glow: false, lineOpacity: 0.3, dustOpacity: 0.25, shell: "ink" },
  "comic-strip": { glow: false, lineOpacity: 0.6, dustOpacity: 0.4, shell: "ink" },
  manga: { glow: false, lineOpacity: 0.55, dustOpacity: 0.35, shell: "ink" },
};

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
  return {
    id,
    dark: THEMES.find((t) => t.id === id)!.mode === "dark",
    fx: root.getAttribute("data-fx") !== "off",
    bg: color("bg", "#0a0a0f"),
    fg: color("fg", "#e8e8f0"),
    dim: color("fg-dim", "#7a7a9a"),
    faint: color("fg-faint", "#5a5a7a"),
    tones: Object.fromEntries(TONES.map((t) => [t, color(t, "#00d4aa")])) as Record<Tone, Color>,
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
  try { return base.lerp(new Color(showColor), theme.dark ? 0.65 : 0.4); } catch { return base; }
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
