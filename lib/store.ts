import { useEffect } from "react";
import { create } from "zustand";
import {
  addEntryAction, deleteEntryAction, getEntriesForUser, reorderEntriesAction,
  restoreEntryAction, updateEntryAction,
} from "@/app/actions/entries";
import { getMoodboardForEntry, saveMoodboard } from "@/app/actions/moodboards";
import { authClient } from "./auth-client";
import { debounceSave, type SaveStatus } from "./debounce-save";
import type { Entry, MoodNode, MoodWire, Moodboard } from "./types";

type EntriesState = {
  entries: Entry[];
  // True until the first load from the DB finishes (drives the Collection skeleton).
  loading: boolean;
  // Whose entries are loaded; null until the first successful load.
  hydratedFor: string | null;
  // Message for the sync-failed toast; set when a server write fails and gets reverted.
  syncError: string | null;
  clearSyncError: () => void;
  loadEntries: (userId: string) => Promise<void>;
  addEntry: (entry: Entry) => void;
  updateEntry: (id: string, patch: Partial<Entry>) => void;
  deleteEntry: (id: string) => void;
  restoreEntry: (entry: Entry, index: number) => void;
  // Local-only re-insert shared by undo and delete rollback; false if the id is already present.
  restoreEntryLocal: (entry: Entry, index: number) => boolean;
  reorderTier: (orderedIds: string[]) => void;
  setEntries: (entries: Entry[]) => void;

  moodboards: Record<string, Moodboard>;
  // Per entry: whether its board has been loaded from the DB.
  boardLoad: Record<string, "loading" | "ready" | "error">;
  // Per entry: state of the debounced save, plus a counter that bumps on each successful save.
  boardSave: Record<string, { status: SaveStatus; savedCount: number }>;
  loadMoodboard: (entryId: string) => Promise<void>;
  addNode: (entryId: string, node: MoodNode) => void;
  updateNodeData: (entryId: string, nodeId: string, patch: Record<string, string>) => void;
  patchNodes: (entryId: string, patches: Record<string, Partial<Omit<MoodNode, "id">>>) => void;
  deleteNodes: (entryId: string, nodeIds: string[]) => void;
  addWire: (entryId: string, wire: MoodWire) => void;
  deleteWires: (entryId: string, wireIds: string[]) => void;
  setBoard: (entryId: string, board: Moodboard) => void;
  deleteMoodboard: (entryId: string) => void;
};

export const EMPTY_BOARD: Moodboard = { nodes: [], wires: [] };

// Applies fn to one entry's board, creating the board if it doesn't exist yet.
const patchBoard = (
  boards: Record<string, Moodboard>,
  entryId: string,
  fn: (b: Moodboard) => Moodboard
) => ({ moodboards: { ...boards, [entryId]: fn(boards[entryId] ?? EMPTY_BOARD) } });

/* ---------- Server sync ----------
   Entry writes update the store first, then run the matching Server Action. Writes run
   one at a time, in order, so a quick add → edit → delete reaches the DB in that order.
   A failed write is reverted locally and surfaced through syncError. */

const SYNC_FAILED = "Couldn't save — change reverted";
let writeQueue: Promise<void> = Promise.resolve();

function sync(write: () => Promise<unknown>, revert: () => void) {
  writeQueue = writeQueue.then(write).then(
    () => {},
    (err) => {
      console.error("Entry sync failed:", err);
      revert();
      useEntriesStore.setState({ syncError: SYNC_FAILED });
    }
  );
}

// New entries get a client id first; once the insert returns, the server id replaces it.
// Writes queued before that resolve the temp id through this map.
const serverIds = new Map<string, string>();
const serverId = (id: string) => serverIds.get(id) ?? id;

let loadingFor: string | null = null;

/* ---------- Moodboard sync ----------
   Boards load from the DB per entry. Every board change schedules a save; edits within
   BOARD_SAVE_MS of each other collapse into one write of the whole board. Undo history
   stays in memory (useBoardHistory) and is never saved. */

const BOARD_SAVE_MS = 800;
// Moodboards used to persist here; boards still found under this key are imported once.
const LEGACY_KEY = "otakuvault.v1";

const boardSaver = debounceSave<string>(
  async (entryId) => {
    const { moodboards } = useEntriesStore.getState();
    const board = moodboards[entryId] ?? moodboards[serverId(entryId)];
    if (!board) return;
    await saveMoodboard(serverId(entryId), board.nodes, board.wires);
    dropLegacyBoard(entryId);
  },
  {
    delay: BOARD_SAVE_MS,
    onStatus: (entryId, status) => useEntriesStore.setState((s) => {
      const prev = s.boardSave[entryId];
      const savedCount = (prev?.savedCount ?? 0) + (status === "saved" ? 1 : 0);
      return { boardSave: { ...s.boardSave, [entryId]: { status, savedCount } } };
    }),
  }
);

// Last-chance save when the tab is hidden or closed (best effort: the browser may cut it off).
if (typeof window !== "undefined") {
  const flush = () => void boardSaver.flushAll();
  window.addEventListener("pagehide", flush);
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "hidden") flush(); });
}

function readLegacyBoards(): Record<string, Moodboard> | null {
  try {
    return JSON.parse(localStorage.getItem(LEGACY_KEY) ?? "null")?.state?.moodboards ?? null;
  } catch {
    return null;
  }
}

function dropLegacyBoard(entryId: string) {
  try {
    const raw = JSON.parse(localStorage.getItem(LEGACY_KEY) ?? "null");
    if (!raw?.state?.moodboards?.[entryId]) return;
    delete raw.state.moodboards[entryId];
    if (Object.keys(raw.state.moodboards).length) localStorage.setItem(LEGACY_KEY, JSON.stringify(raw));
    else localStorage.removeItem(LEGACY_KEY);
  } catch { /* storage unavailable: nothing to clean up */ }
}

// Board mutations go through here so each one also schedules a save.
const boardChange = (entryId: string, change: Partial<EntriesState>) => {
  queueMicrotask(() => boardSaver.schedule(entryId));
  return change;
};

const deletedBoards = new Map<string, Moodboard | null>();

export const useEntriesStore = create<EntriesState>()(
  (set, get) => ({
    entries: [],
    loading: true,
    hydratedFor: null,
    syncError: null,
    clearSyncError: () => set({ syncError: null }),

    loadEntries: async (userId) => {
      if (loadingFor === userId) return;
      loadingFor = userId;
      set({ loading: true });
      try {
        const entries = await getEntriesForUser();
        set({ entries, hydratedFor: userId, loading: false });
      } catch (err) {
        console.error("Loading entries failed:", err);
        set({ loading: false, syncError: "Couldn't load your collection" });
      } finally {
        loadingFor = null;
      }
    },

    addEntry: (entry) => {
      set((s) => ({ entries: [entry, ...s.entries] }));
      // created is ignored server-side; the DB timestamps the insert.
      const { id: tempId, ...fields } = entry;
      sync(
        async () => {
          const saved = await addEntryAction(fields);
          serverIds.set(tempId, saved.id);
          // Keep any edits made while the insert was in flight; only adopt the server id/timestamp.
          set((s) => {
            const moodboards = { ...s.moodboards };
            if (moodboards[tempId]) {
              moodboards[saved.id] = moodboards[tempId];
              delete moodboards[tempId];
            }
            return {
              moodboards,
              entries: s.entries.map((e) => (e.id === tempId ? { ...e, id: saved.id, created: saved.created } : e)),
            };
          });
        },
        () => set((s) => ({ entries: s.entries.filter((e) => e.id !== tempId) }))
      );
    },

    updateEntry: (id, patch) => {
      const prev = get().entries.find((e) => e.id === id);
      if (!prev) return;
      const next = { ...prev, ...patch };
      set((s) => ({ entries: s.entries.map((e) => (e.id === id ? next : e)) }));
      sync(
        () => updateEntryAction({ ...next, id: serverId(id) }),
        () => set((s) => ({
          entries: s.entries.map((e) =>
            e.id === id || e.id === serverId(id) ? { ...prev, id: e.id, created: e.created } : e),
        }))
      );
    },

    deleteEntry: (id) => {
      const entries = get().entries;
      const index = entries.findIndex((e) => e.id === id);
      if (index === -1) return;
      const removed = entries[index];
      set({ entries: entries.filter((e) => e.id !== id) });
      sync(
        async () => { deletedBoards.set(serverId(id), await deleteEntryAction(serverId(id))); },
        () => get().restoreEntryLocal(removed, index)
      );
    },

    // Re-insert a deleted entry at its old position (used by undo).
    restoreEntry: (entry, index) => {
      const restored = { ...entry, id: serverId(entry.id) };
      if (!get().restoreEntryLocal(restored, index)) return;
      sync(
        // The delete cascaded the moodboard row; hand back the board it returned.
        () => restoreEntryAction(restored, deletedBoards.get(restored.id)),
        () => set((s) => ({ entries: s.entries.filter((e) => e.id !== restored.id) }))
      );
    },
    restoreEntryLocal: (entry, index) => {
      if (get().entries.some((e) => e.id === entry.id)) return false;
      set((s) => {
        const entries = [...s.entries];
        entries.splice(Math.min(index, entries.length), 0, entry);
        return { entries };
      });
      return true;
    },

    // Persist a rating tier's new order as manualOrder = position in orderedIds.
    reorderTier: (orderedIds) => {
      const before = new Map(get().entries.map((e) => [e.id, e.manualOrder]));
      const order = new Map(orderedIds.map((id, i) => [id, i]));
      set((s) => ({
        entries: s.entries.map((e) => (order.has(e.id) ? { ...e, manualOrder: order.get(e.id) } : e)),
      }));
      sync(
        () => reorderEntriesAction(orderedIds.map(serverId)),
        () => set((s) => ({
          entries: s.entries.map((e) => (order.has(e.id) ? { ...e, manualOrder: before.get(e.id) } : e)),
        }))
      );
    },
    // Local only (no server write).
    setEntries: (entries) => set({ entries }),

    moodboards: {},
    boardLoad: {},
    boardSave: {},

    // Loads an entry's board once per session; later visits reuse the in-memory copy.
    loadMoodboard: async (entryId) => {
      const status = get().boardLoad[entryId];
      if (status === "loading" || status === "ready") return;
      set((s) => ({ boardLoad: { ...s.boardLoad, [entryId]: "loading" } }));
      try {
        const saved = await getMoodboardForEntry(serverId(entryId));
        let board: Moodboard = saved ? { nodes: saved.nodes, wires: saved.wires } : EMPTY_BOARD;
        // First visit since the move to the DB: upload the board this browser kept locally.
        const legacy = saved ? null : readLegacyBoards()?.[entryId];
        if (legacy?.nodes?.length) board = { nodes: legacy.nodes, wires: legacy.wires ?? [] };
        set((s) => ({
          moodboards: { ...s.moodboards, [entryId]: board },
          boardLoad: { ...s.boardLoad, [entryId]: "ready" },
        }));
        if (legacy?.nodes?.length) boardSaver.schedule(entryId);
      } catch (err) {
        console.error("Loading moodboard failed:", err);
        set((s) => ({ boardLoad: { ...s.boardLoad, [entryId]: "error" } }));
      }
    },

    addNode: (entryId, node) =>
      set((s) => boardChange(entryId, patchBoard(s.moodboards, entryId, (b) => ({ ...b, nodes: [...b.nodes, node] })))),
    updateNodeData: (entryId, nodeId, patch) =>
      set((s) => boardChange(entryId, patchBoard(s.moodboards, entryId, (b) => ({
        ...b,
        nodes: b.nodes.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n)),
      })))),
    patchNodes: (entryId, patches) =>
      set((s) => boardChange(entryId, patchBoard(s.moodboards, entryId, (b) => ({
        ...b,
        nodes: b.nodes.map((n) => (patches[n.id] ? { ...n, ...patches[n.id] } : n)),
      })))),
    // Also drops any wires attached to the removed nodes.
    deleteNodes: (entryId, nodeIds) =>
      set((s) => {
        const gone = new Set(nodeIds);
        return boardChange(entryId, patchBoard(s.moodboards, entryId, (b) => ({
          nodes: b.nodes.filter((n) => !gone.has(n.id)),
          wires: b.wires.filter((w) => !gone.has(w.from) && !gone.has(w.to)),
        })));
      }),
    addWire: (entryId, wire) =>
      set((s) => boardChange(entryId, patchBoard(s.moodboards, entryId, (b) => ({ ...b, wires: [...b.wires, wire] })))),
    deleteWires: (entryId, wireIds) =>
      set((s) => {
        const gone = new Set(wireIds);
        return boardChange(entryId, patchBoard(s.moodboards, entryId, (b) => ({ ...b, wires: b.wires.filter((w) => !gone.has(w.id)) })));
      }),
    setBoard: (entryId, board) =>
      set((s) => boardChange(entryId, { moodboards: { ...s.moodboards, [entryId]: board } })),
    // Local only: the DB row is removed with its entry (FK cascade).
    deleteMoodboard: (entryId) => {
      boardSaver.cancel(entryId);
      set((s) => {
        const moodboards = { ...s.moodboards };
        const boardLoad = { ...s.boardLoad };
        delete moodboards[entryId];
        delete boardLoad[entryId];
        return { moodboards, boardLoad };
      });
    },
  })
);

// Loads the signed-in user's entries from the DB once; later mounts reuse the store.
export function useHydrateEntries() {
  const { data, isPending } = authClient.useSession();
  const userId = data?.user.id;

  useEffect(() => {
    if (userId) {
      const { hydratedFor, loadEntries } = useEntriesStore.getState();
      if (hydratedFor !== userId) void loadEntries(userId);
    } else if (!isPending) {
      // The proxy only checks that a session cookie exists; this catches an expired one.
      // Hard navigation so no signed-in client state survives.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination -- see above
      window.location.assign(`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`);
    }
  }, [userId, isPending]);
}

// True once the signed-in user's entries are loaded from the DB.
export const useEntriesHydrated = () => useEntriesStore((s) => s.hydratedFor !== null);

// Loads an entry's moodboard from the DB (once per session) and returns its load state.
// Unmounting saves any edit still waiting out the debounce.
export function useHydrateMoodboard(entryId: string) {
  useEffect(() => {
    void useEntriesStore.getState().loadMoodboard(entryId);
    return () => void boardSaver.flush(entryId);
  }, [entryId]);
  return useEntriesStore((s) => s.boardLoad[entryId] ?? "loading");
}
