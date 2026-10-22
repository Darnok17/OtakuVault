import { useEffect, useSyncExternalStore } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import {
  addEntryAction, deleteEntryAction, getEntriesForUser, reorderEntriesAction,
  restoreEntryAction, updateEntryAction,
} from "@/app/actions/entries";
import { authClient } from "./auth-client";
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

export const useEntriesStore = create<EntriesState>()(
  persist(
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
          () => deleteEntryAction(serverId(id)),
          () => get().restoreEntryLocal(removed, index)
        );
      },

      // Re-insert a deleted entry at its old position (used by undo).
      restoreEntry: (entry, index) => {
        const restored = { ...entry, id: serverId(entry.id) };
        if (!get().restoreEntryLocal(restored, index)) return;
        sync(
          () => restoreEntryAction(restored),
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
      addNode: (entryId, node) =>
        set((s) => patchBoard(s.moodboards, entryId, (b) => ({ ...b, nodes: [...b.nodes, node] }))),
      updateNodeData: (entryId, nodeId, patch) =>
        set((s) => patchBoard(s.moodboards, entryId, (b) => ({
          ...b,
          nodes: b.nodes.map((n) => (n.id === nodeId ? { ...n, data: { ...n.data, ...patch } } : n)),
        }))),
      patchNodes: (entryId, patches) =>
        set((s) => patchBoard(s.moodboards, entryId, (b) => ({
          ...b,
          nodes: b.nodes.map((n) => (patches[n.id] ? { ...n, ...patches[n.id] } : n)),
        }))),
      // Also drops any wires attached to the removed nodes.
      deleteNodes: (entryId, nodeIds) =>
        set((s) => {
          const gone = new Set(nodeIds);
          return patchBoard(s.moodboards, entryId, (b) => ({
            nodes: b.nodes.filter((n) => !gone.has(n.id)),
            wires: b.wires.filter((w) => !gone.has(w.from) && !gone.has(w.to)),
          }));
        }),
      addWire: (entryId, wire) =>
        set((s) => patchBoard(s.moodboards, entryId, (b) => ({ ...b, wires: [...b.wires, wire] }))),
      deleteWires: (entryId, wireIds) =>
        set((s) => {
          const gone = new Set(wireIds);
          return patchBoard(s.moodboards, entryId, (b) => ({ ...b, wires: b.wires.filter((w) => !gone.has(w.id)) }));
        }),
      setBoard: (entryId, board) =>
        set((s) => ({ moodboards: { ...s.moodboards, [entryId]: board } })),
      deleteMoodboard: (entryId) =>
        set((s) => {
          const moodboards = { ...s.moodboards };
          delete moodboards[entryId];
          return { moodboards };
        }),
    }),
    {
      name: "otakuvault.v1",
      // Entries live in Postgres now; only moodboards stay in localStorage (until they migrate too).
      partialize: (s) => ({ moodboards: s.moodboards }),
      // Hydrate manually from a client effect so server and first client render match.
      skipHydration: true,
      // Older saves also hold entries; ignore those.
      merge: (persisted, current) => ({
        ...current,
        moodboards: (persisted as Partial<EntriesState> | undefined)?.moodboards ?? current.moodboards,
      }),
    }
  )
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

const subscribeBoards = (cb: () => void) => useEntriesStore.persist.onFinishHydration(cb);
const boardsHydrated = () => useEntriesStore.persist.hasHydrated();

// True once both the DB entries and the locally persisted moodboards are loaded (always false on the server).
export const useEntriesHydrated = () => {
  const boards = useSyncExternalStore(subscribeBoards, boardsHydrated, () => false);
  const entries = useEntriesStore((s) => s.hydratedFor !== null);
  return boards && entries;
};
