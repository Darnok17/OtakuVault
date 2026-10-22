import { eq } from "drizzle-orm";
import { db, entries } from "@/lib/db";
import type { Entry } from "@/lib/types";

// Deliberately not in app/actions: every export of a "use server" file is a public
// endpoint, and this takes an arbitrary userId. Only called from the signup hook.

const DAY = 86400000;

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

// Gives a brand-new user the demo collection, but never touches an account that has entries.
export async function seedDemoEntries(userId: string) {
  if ((await db.$count(entries, eq(entries.userId, userId))) > 0) return;
  const now = Date.now();
  await db.insert(entries).values(
    DEMO.map((d, i) => ({ ...d, userId, createdAt: new Date(now - (DEMO.length - i) * DAY) }))
  );
}
