import { useSyncExternalStore } from "react";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Entry, MoodNode, MoodWire, Moodboard } from "./types";

const DEMO: Omit<Entry, "id" | "created">[] = [
  { title:"Fullmetal Alchemist: Brotherhood", type:"anime", status:"completed", genre:"Action, Adventure", totalEps:"64 eps", notes:"A true masterpiece from start to finish.", rating:5, imageUrl:"", progressCurrent:0, progressTotal:0 },
  { title:"Demon Slayer",                     type:"anime", status:"watching",  genre:"Action, Supernatural", totalEps:"26 eps", notes:"Stunning animation.", rating:4, imageUrl:"", progressCurrent:18, progressTotal:26 },
  { title:"Vinland Saga",                     type:"manga", status:"completed", genre:"Historical, Action", totalEps:"Ch. 210", notes:"One of the greatest manga ever written.", rating:5, imageUrl:"", progressCurrent:0, progressTotal:0 },
  { title:"Solo Leveling",                    type:"webtoon",status:"completed", genre:"Action, Fantasy", totalEps:"179 ch", notes:"Peak power fantasy, loved every chapter.", rating:4, imageUrl:"", progressCurrent:0, progressTotal:0 },
  { title:"One Piece",                        type:"anime", status:"watching",  genre:"Action, Adventure", totalEps:"1000+ eps", notes:"The greatest adventure.", rating:5, imageUrl:"", progressCurrent:600, progressTotal:1100 },
  { title:"Hunter x Hunter",                  type:"anime", status:"plan-to",   genre:"Action, Adventure", totalEps:"148 eps", notes:"", rating:0, imageUrl:"", progressCurrent:0, progressTotal:0 },
  { title:"Berserk",                          type:"manga", status:"plan-to",   genre:"Dark Fantasy, Action", totalEps:"374 ch", notes:"", rating:0, imageUrl:"", progressCurrent:0, progressTotal:0 },
  { title:"Re:Zero",                          type:"novel", status:"watching",  genre:"Isekai, Psychological", totalEps:"36 vol", notes:"Subaru arcs hit different in the LN.", rating:5, imageUrl:"", progressCurrent:14, progressTotal:36 },
  { title:"Mushoku Tensei",                   type:"novel", status:"completed", genre:"Isekai, Adventure", totalEps:"26 vol", notes:"The grandfather of modern isekai.", rating:5, imageUrl:"", progressCurrent:0, progressTotal:0 },
  { title:"Overlord",                         type:"novel", status:"plan-to",   genre:"Isekai, Dark Fantasy", totalEps:"18 vol", notes:"", rating:0, imageUrl:"", progressCurrent:0, progressTotal:0 },
];

const seedEntries = (): Entry[] =>
  DEMO.map((d, i) => ({
    ...d,
    id: "demo_" + i,
    created: Date.now() - (DEMO.length - i) * 86400000,
  }));

type EntriesState = {
  entries: Entry[];
  addEntry: (entry: Entry) => void;
  updateEntry: (id: string, patch: Partial<Entry>) => void;
  deleteEntry: (id: string) => void;
  restoreEntry: (entry: Entry, index: number) => void;
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

// Set during hydration when nothing was stored yet, so the seed gets written once.
let seededOnHydrate = false;

export const useEntriesStore = create<EntriesState>()(
  persist(
    (set) => ({
      entries: [],
      addEntry: (entry) => set((s) => ({ entries: [entry, ...s.entries] })),
      updateEntry: (id, patch) =>
        set((s) => ({ entries: s.entries.map((e) => (e.id === id ? { ...e, ...patch } : e)) })),
      deleteEntry: (id) => set((s) => ({ entries: s.entries.filter((e) => e.id !== id) })),
      // Re-insert a deleted entry at its old position (used by undo).
      restoreEntry: (entry, index) =>
        set((s) => {
          if (s.entries.some((e) => e.id === entry.id)) return s;
          const entries = [...s.entries];
          entries.splice(Math.min(index, entries.length), 0, entry);
          return { entries };
        }),
      // Persist a rating tier's new order as manualOrder = position in orderedIds.
      reorderTier: (orderedIds) =>
        set((s) => {
          const order = new Map(orderedIds.map((id, i) => [id, i]));
          return {
            entries: s.entries.map((e) => (order.has(e.id) ? { ...e, manualOrder: order.get(e.id) } : e)),
          };
        }),
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
      partialize: (s) => ({ entries: s.entries, moodboards: s.moodboards }),
      // Hydrate manually from a client effect so server and first client render match.
      skipHydration: true,
      merge: (persisted, current) => {
        if (persisted) return { ...current, ...(persisted as Partial<EntriesState>) };
        seededOnHydrate = true;
        return { ...current, entries: seedEntries() };
      },
      onRehydrateStorage: () => (state) => {
        if (state && seededOnHydrate) {
          seededOnHydrate = false;
          state.setEntries(state.entries);
        }
      },
    }
  )
);

// True once the persisted state has been loaded into the store (always false on the server).
export const useEntriesHydrated = () =>
  useSyncExternalStore(
    (cb) => useEntriesStore.persist.onFinishHydration(cb),
    () => useEntriesStore.persist.hasHydrated(),
    () => false
  );
