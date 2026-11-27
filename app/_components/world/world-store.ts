"use client";

import { create } from "zustand";
import { getPersonWorksAction } from "@/app/actions/anilist";
import type { PersonWorks } from "@/lib/anilist-shared";
import type { Insets } from "@/lib/title-graph-layout";
import type { ListMark } from "@/lib/types";

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

// Person webs, loaded the first time one is opened (from a click or a shared ?person= link) and
// kept for the rest of the visit. The marks are the signed-in user's own and live only here.
export type PersonState =
  | { status: "loading" }
  | { status: "error" }
  | { status: "ready"; person: PersonWorks | null; marks: Record<number, ListMark> | null };

type WorldPeople = { people: Record<number, PersonState>; load: (id: number) => void };

export const useWorldPeople = create<WorldPeople>((set, get) => ({
  people: {},
  // Idempotent while loading or loaded; after an error, calling it again retries.
  load: (id) => {
    const was = get().people[id];
    if (was && was.status !== "error") return;
    const put = (state: PersonState) => set((s) => ({ people: { ...s.people, [id]: state } }));
    put({ status: "loading" });
    getPersonWorksAction(id).then((r) => put({ status: "ready", ...r }), () => put({ status: "error" }));
  },
}));
