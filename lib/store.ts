import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { Entry } from "./types";

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
  setEntries: (entries: Entry[]) => void;
};

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
      setEntries: (entries) => set({ entries }),
    }),
    {
      name: "otakuvault.v1",
      partialize: (s) => ({ entries: s.entries }),
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
