"use client";

import { create } from "zustand";
import type { Insets } from "@/lib/title-graph-layout";

// Hover is per-frame UI state shared by the 3D nodes and the DOM node list; keeping it out of React
// props means hovering one node re-renders that node, not the whole scene. Focus (which hub / node
// is open) lives in the URL instead — see TitleWorld.
type WorldHover = { hovered: string | null; setHovered: (id: string | null) => void };

export const useWorldHover = create<WorldHover>((set) => ({
  hovered: null,
  setHovered: (hovered) => set({ hovered }),
}));

// How far the DOM overlays (HUD, focus panel) reach into the canvas, measured by TitleWorld, so the
// camera frames each web in the part of the screen that's actually free.
type WorldInsets = { insets: Insets | null; setInsets: (insets: Insets) => void };

export const useWorldInsets = create<WorldInsets>((set, get) => ({
  insets: null,
  setInsets: (insets) => {
    const was = get().insets;
    if (!was || (Object.keys(insets) as (keyof Insets)[]).some((k) => Math.abs(was[k] - insets[k]) > 4)) set({ insets });
  },
}));
