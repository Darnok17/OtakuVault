import type { Entry, EntryType } from "@/lib/types";

// Client-safe AniList types and display helpers. The fetching/caching layer is lib/anilist.ts.

export type MediaKind = "ANIME" | "MANGA";
export type Season = "WINTER" | "SPRING" | "SUMMER" | "FALL";

// A normalized AniList media record; this is what cached_titles.meta holds.
export type Title = {
  anilistId: number;
  kind: MediaKind;
  entryType: EntryType;
  title: string;
  romaji: string;
  native: string | null;
  format: string | null;
  status: string | null;
  episodes: number | null;
  chapters: number | null;
  volumes: number | null;
  score: number | null; // averageScore, 0–100
  popularity: number | null;
  genres: string[];
  cover: string | null;
  banner: string | null;
  color: string | null;
  season: Season | null;
  seasonYear: number | null;
  startYear: number | null;
  // Present once fetched through getTitleById.
  description?: string | null;
  studios?: string[];
};

export type TitlePage = { items: Title[]; total: number; hasNext: boolean };

export type BrowseSort = "popularity" | "rating-desc" | "rating-asc" | "newest" | "oldest";
export type BrowseStatus = "RELEASING" | "FINISHED" | "NOT_YET_RELEASED" | "HIATUS";

export type BrowseFilters = {
  types: EntryType[]; // empty = every type
  statuses: BrowseStatus[];
  genres: string[];
  yearFrom: number | null;
  yearTo: number | null;
  minStars: number; // 0–5
  sort: BrowseSort;
};

export const ENTRY_TYPES: EntryType[] = ["anime", "manga", "webtoon", "novel"];

export const DEFAULT_FILTERS: BrowseFilters = {
  types: [...ENTRY_TYPES], statuses: [], genres: [], yearFrom: null, yearTo: null, minStars: 0, sort: "popularity",
};

// AniList keeps these as tags rather than genres.
export const TAG_GENRES = new Set(["Isekai", "Seinen", "Shounen", "Shonen"]);

export type AddResult =
  | { status: "added"; entry: Entry }
  | { status: "exists" }
  | { status: "signin" };

/* ---------- Seasons ---------- */

export const SEASON_INFO: Record<Season, { label: string; months: string; kanji: string }> = {
  WINTER: { label: "Winter", months: "JAN–MAR", kanji: "冬アニメ" },
  SPRING: { label: "Spring", months: "APR–JUN", kanji: "春アニメ" },
  SUMMER: { label: "Summer", months: "JUL–SEP", kanji: "夏アニメ" },
  FALL:   { label: "Fall",   months: "OCT–DEC", kanji: "秋アニメ" },
};

export function seasonOf(date: Date): { year: number; season: Season } {
  const seasons: Season[] = ["WINTER", "SPRING", "SUMMER", "FALL"];
  return { year: date.getFullYear(), season: seasons[Math.floor(date.getMonth() / 3)] };
}

/* ---------- Display ---------- */

export const badgeFor = (t: Title) =>
  t.entryType === "novel" ? "Novel" : t.entryType.charAt(0).toUpperCase() + t.entryType.slice(1);

export const ratingFor = (t: Title) => (t.score == null ? "—" : (t.score / 20).toFixed(1));

// First kanji/kana of the native title, standing in for cover art the way the old placeholders did.
// (Hangul is skipped: the glyph font is Noto Sans JP, which has none.)
export function glyphFor(t: Title) {
  const cjk = t.native?.match(/[\u3040-\u30ff\u3400-\u9fff\uf900-\ufaff]/u);
  return cjk ? cjk[0] : (t.title.match(/[A-Za-z0-9]/)?.[0] ?? "◆").toUpperCase();
}

// Snap AniList's cover color to the nearest site accent (teal / crimson / violet / gold / orange).
const HUES: [number, string][] = [[350, "crimson"], [8, "crimson"], [30, "orange"], [50, "gold"], [165, "teal"], [195, "teal"], [265, "violet"], [300, "violet"]];

export function hueFor(t: Title): string {
  const m = t.color?.match(/^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i);
  if (m) {
    const [r, g, b] = m.slice(1).map((h) => parseInt(h, 16) / 255);
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    if (d > 0.12) {
      let h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
      h = (h * 60 + 360) % 360;
      const dist = (a: number) => Math.min(Math.abs(a - h), 360 - Math.abs(a - h));
      return HUES.reduce((best, cur) => (dist(cur[0]) < dist(best[0]) ? cur : best))[1];
    }
  }
  return ["teal", "crimson", "violet", "gold", "orange"][t.anilistId % 5];
}

export const hueToVar = (hue: string) =>
  hue === "teal"    ? "accent3" :
  hue === "crimson" ? "accent"  :
  hue === "violet"  ? "accent2" :
  hue === "gold"    ? "gold"    : "novel";

// Episode/chapter/volume count in the same shapes the collection already uses ("64 eps", "179 ch", "36 vol").
export function lengthFor(t: Title): { label: string; total: number } {
  const [n, unit] =
    t.entryType === "anime" ? [t.episodes, "eps"] :
    t.entryType === "novel" ? [t.volumes, "vol"] :
    [t.chapters, "ch"];
  return n ? { label: `${n} ${unit}`, total: n } : { label: "", total: 0 };
}
