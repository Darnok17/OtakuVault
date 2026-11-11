import { create } from "zustand";
import { getMyPins, togglePin } from "@/app/actions/pins";
import type { PinKind } from "./types";

// Which things the signed-in user has pinned, so every pin button on the site knows its state.
// Loaded once per user; toggles update the set first and roll back if the server says no.

const keyOf = (kind: PinKind, targetId: string) => `${kind}:${targetId}`;

type PinsState = {
  pinned: Set<string>;
  loadedFor: string | null;
  loading: string | null;
  load: (userId: string) => Promise<void>;
  toggle: (kind: PinKind, targetId: string) => Promise<{ pinned: boolean; error?: string }>;
};

export const usePinsStore = create<PinsState>()((set, get) => ({
  pinned: new Set(),
  loadedFor: null,
  loading: null,
  load: async (userId) => {
    if (get().loadedFor === userId || get().loading === userId) return;
    set({ loading: userId });
    try {
      const pins = await getMyPins();
      set({ pinned: new Set(pins.map((p) => keyOf(p.kind, p.targetId))), loadedFor: userId, loading: null });
    } catch {
      set({ loading: null });
    }
  },
  toggle: async (kind, targetId) => {
    const key = keyOf(kind, targetId);
    const was = get().pinned.has(key);
    const apply = (on: boolean) => set((s) => {
      const next = new Set(s.pinned);
      if (on) next.add(key); else next.delete(key);
      return { pinned: next };
    });
    apply(!was);
    try {
      const res = await togglePin(kind, targetId);
      if (!res.ok) { apply(was); return { pinned: was, error: res.error }; }
      apply(res.pinned);
      return { pinned: res.pinned };
    } catch {
      apply(was);
      return { pinned: was, error: "Couldn't update the pin — try again." };
    }
  },
}));

export const isPinned = (s: PinsState, kind: PinKind, targetId: string) => s.pinned.has(keyOf(kind, targetId));
