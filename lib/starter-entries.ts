import { and, eq } from "drizzle-orm";
import { db, entries, users } from "@/lib/db";
import { getTitleById } from "@/lib/anilist";
import { lengthFor, type Title } from "@/lib/anilist-shared";
import type { EntryStatus } from "@/lib/types";

// The starter collection every new account gets, so the Collection page isn't empty on day one.
// Deliberately not in app/actions: every export of a "use server" file is a public endpoint, and
// this takes an arbitrary userId. Called from the signup hook, and retried when the collection
// is first loaded in case the hook's attempt failed.

type Starter = { anilistId: number; title: string; status: EntryStatus; genre: string; totalEps: string; total: number };

// The fallback fields are used only if AniList can't be reached and the title isn't cached yet.
const STARTERS: Starter[] = [
  { anilistId: 16498,  title: "Attack on Titan",                  status: "completed", genre: "Action, Drama",        totalEps: "25 eps",  total: 25 },
  { anilistId: 113415, title: "Jujutsu Kaisen",                   status: "watching",  genre: "Action, Supernatural", totalEps: "24 eps",  total: 24 },
  { anilistId: 101922, title: "Demon Slayer: Kimetsu no Yaiba",   status: "watching",  genre: "Action, Supernatural", totalEps: "26 eps",  total: 26 },
  { anilistId: 21,     title: "One Piece",                        status: "watching",  genre: "Action, Adventure",    totalEps: "",        total: 0 },
  { anilistId: 5114,   title: "Fullmetal Alchemist: Brotherhood", status: "completed", genre: "Action, Adventure",    totalEps: "64 eps",  total: 64 },
  { anilistId: 1535,   title: "Death Note",                       status: "completed", genre: "Mystery, Thriller",    totalEps: "37 eps",  total: 37 },
  { anilistId: 140960, title: "SPY x FAMILY",                     status: "plan-to",   genre: "Action, Comedy",       totalEps: "12 eps",  total: 12 },
  { anilistId: 127230, title: "Chainsaw Man",                     status: "plan-to",   genre: "Action, Horror",       totalEps: "12 eps",  total: 12 },
];

const MINUTE = 60_000;

function rowFor(s: Starter, t: Title | null, userId: string, createdAt: Date) {
  const length = t ? lengthFor(t) : { label: s.totalEps, total: s.total };
  return {
    userId, createdAt,
    title: t?.title ?? s.title,
    type: "anime" as const,
    status: s.status,
    genre: t?.genres.slice(0, 2).join(", ") || s.genre,
    totalEps: length.label,
    notes: "",
    // Unrated on purpose: ratings are the user's to give, and they drive recommendations.
    rating: 0,
    imageUrl: t?.cover ?? "",
    progressCurrent: s.status === "completed" ? length.total : 0,
    progressTotal: length.total,
    anilistId: s.anilistId,
  };
}

// Seeds the starter entries once per account (users.seeded). Safe to call repeatedly and
// concurrently: the flag is claimed in a single UPDATE before anything is inserted.
export async function seedStarterEntries(userId: string): Promise<boolean> {
  const claimed = await db.update(users).set({ seeded: true })
    .where(and(eq(users.id, userId), eq(users.seeded, false))).returning({ id: users.id });
  if (!claimed.length) return false;
  try {
    // Never add to a collection that already has something in it.
    if ((await db.$count(entries, eq(entries.userId, userId))) > 0) return false;
    // getTitleById also fills cached_titles, so cover art and detail pages work immediately.
    const titles = await Promise.all(STARTERS.map((s) => getTitleById(s.anilistId).catch(() => null)));
    const now = Date.now();
    await db.insert(entries).values(
      STARTERS.map((s, i) => rowFor(s, titles[i], userId, new Date(now - (STARTERS.length - i) * MINUTE))),
    );
    return true;
  } catch (err) {
    // Hand the claim back so the next load can try again.
    await db.update(users).set({ seeded: false }).where(eq(users.id, userId)).catch(() => {});
    throw err;
  }
}
