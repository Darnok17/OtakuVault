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
  // Small cover for lists (absent on titles cached before it was added; fall back to cover).
  thumb?: string | null;
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
  | { status: "exists"; entry: Entry }
  | { status: "signin" };

/* ---------- Detail pages ---------- */

export const TITLE_ROUTES: Record<EntryType, string> = { anime: "anime", manga: "manga", webtoon: "webtoons", novel: "novels" };

export const titleHref = (type: EntryType, anilistId: number) => `/${TITLE_ROUTES[type]}/${anilistId}`;

export type FuzzyDate = { year: number | null; month: number | null; day: number | null };

export type TitleVoiceActor = { id: number; name: string; image: string | null; language: string | null };
export type TitleCharacter = { id: number; name: string; role: string | null; image: string | null; voiceActors: TitleVoiceActor[] };
export type TitleStaff = { id: number; name: string; role: string | null; image: string | null };
export type TitleRelation = { id: number; relationType: string | null; entryType: EntryType; format: string | null; title: string; cover: string | null };
export type TitleLink = { url: string; site: string; language: string | null; icon: string | null; color: string | null };

// Everything a detail page shows; this is what cached_titles.details holds. Normalized so lists
// are always arrays and absent values are null. Bump DETAILS_VERSION when the shape changes.
export const DETAILS_VERSION = 2;

export type TitleDetails = {
  v: number;
  fetchedAt: number;
  anilistId: number;
  idMal: number | null;
  siteUrl: string | null;
  kind: MediaKind;
  entryType: EntryType;
  title: string; // english, else romaji
  romaji: string;
  english: string | null;
  native: string | null;
  synonyms: string[];
  cover: string | null;
  color: string | null;
  banner: string | null;
  description: string | null; // raw, as AniList sends it; see descriptionParagraphs
  format: string | null;
  status: string | null;
  episodes: number | null;
  chapters: number | null;
  volumes: number | null;
  duration: number | null;
  startDate: FuzzyDate | null;
  endDate: FuzzyDate | null;
  season: Season | null;
  seasonYear: number | null;
  averageScore: number | null;
  meanScore: number | null;
  popularity: number | null;
  popularityRank: number | null;
  favourites: number | null;
  source: string | null;
  genres: string[];
  tags: { name: string; rank: number }[];
  studios: { name: string; isMain: boolean }[];
  staff: TitleStaff[];
  characters: TitleCharacter[];
  relations: TitleRelation[];
  recommendations: Title[];
  streamingEpisodes: { title: string | null; thumbnail: string | null; url: string | null; site: string | null }[];
  externalLinks: TitleLink[];
  trailer: { id: string; site: string } | null;
};

export type DetailsResult =
  | { status: "ok"; details: TitleDetails }
  | { status: "not-found" }
  | { status: "wrong-type"; entryType: EntryType }; // the id exists, under another route

// Collapses items sharing a key, keeping the first one's position. `merge` folds each later
// duplicate into the one already kept.
export function uniqueBy<T>(items: T[], keyOf: (item: T) => unknown, merge: (kept: T, dup: T) => T = (kept) => kept): T[] {
  const byKey = new Map<unknown, T>();
  for (const item of items) {
    const key = keyOf(item);
    const kept = byKey.get(key);
    byKey.set(key, kept === undefined ? item : merge(kept, item));
  }
  return [...byKey.values()];
}

// AniList repeats entries, e.g. a studio credited as both animator (isMain) and producer. This
// runs at render rather than in normalizeDetails so details already cached are covered too.
// Staff and relations stay distinct per role/type: the same person or title under a second label
// is real information, and the row shows that label.
export function dedupeDetails(d: TitleDetails): TitleDetails {
  return {
    ...d,
    synonyms: [...new Set(d.synonyms)],
    genres: [...new Set(d.genres)],
    tags: uniqueBy(d.tags, (t) => t.name, (a, b) => (b.rank > a.rank ? b : a)),
    studios: uniqueBy(d.studios, (s) => s.name.trim().toLowerCase(), (a, b) => ({ ...a, isMain: a.isMain || b.isMain })),
    staff: uniqueBy(d.staff, (s) => `${s.id}-${s.role}`),
    // AniList sorts by role, so the kept entry already has the most prominent one.
    characters: uniqueBy(d.characters, (c) => c.id, (a, b) => ({
      ...a, role: a.role ?? b.role, image: a.image ?? b.image, voiceActors: [...a.voiceActors, ...b.voiceActors],
    })).map((c) => ({ ...c, voiceActors: uniqueBy(c.voiceActors, (v) => v.id) })),
    relations: uniqueBy(d.relations, (r) => `${r.id}-${r.relationType}`),
    recommendations: uniqueBy(d.recommendations, (t) => t.anilistId),
  };
}

const ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", mdash: "—", ndash: "–", hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“" };

// AniList descriptions are HTML-ish, with ~!spoiler!~ blocks. Returns plain-text paragraphs.
export function descriptionParagraphs(raw: string | null): string[] {
  if (!raw) return [];
  return raw
    .replace(/~!\s*[\s\S]*?!~/g, "")
    .replace(/\r/g, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]*>/g, "")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&(\w+);/g, (m, name) => ENTITIES[name] ?? m)
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

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
