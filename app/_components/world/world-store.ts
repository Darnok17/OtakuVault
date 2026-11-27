"use client";

import { create } from "zustand";

// Hover is per-frame UI state shared by the 3D nodes and the DOM node list; keeping it out of React
// props means hovering one node re-renders that node, not the whole scene. Focus (which hub / node
// is open) lives in the URL instead — see TitleWorld.
type WorldHover = { hovered: string | null; setHovered: (id: string | null) => void };

export const useWorldHover = create<WorldHover>((set) => ({
  hovered: null,
  setHovered: (hovered) => set({ hovered }),
}));
