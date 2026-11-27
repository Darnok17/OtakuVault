import {
  SEASON_INFO, descriptionParagraphs, titleHref, uniqueBy,
  type FuzzyDate, type PersonWorks, type TitleCharacter, type TitleDetails, type TitleVoiceActor,
} from "@/lib/anilist-shared";
import type { EntryType } from "@/lib/types";

// The data behind the 3D "world" on a title page: the show at the centre, hubs around it, and each
// hub's own web of nodes. Pure and serializable — built on the server from TitleDetails and handed
// to the client, which only adds positions (lib/title-graph-layout.ts). Nothing here knows about
// three.js or themes; colours are named tones that the scene resolves from the theme's CSS tokens.

// Every node colour is one of the theme's accent tokens, resolved at runtime.
export type Tone = "acc-1" | "acc-2" | "acc-3" | "gold" | "azure" | "violet" | "rose" | "orange";

export type HubId = "details" | "characters" | "cast" | "staff" | "franchise" | "similar" | "watch";

export type NodeDetail =
  | { type: "character"; role: string | null; voiceActors: TitleVoiceActor[] }
  | { type: "person"; role: string | null; characters?: string[] }
  // credit: the person's part in it, on a person web (as Frieren · Main, Director)
  | { type: "title"; anilistId: number; entryType: EntryType; relation: string | null; format: string | null; year: number | null; href: string; credit?: string }
  | { type: "link"; url: string }
  | { type: "fact"; group: string };

export type WebNode = {
  id: string;
  label: string;
  sub: string | null; // a short second line: role, relation type, fact group
  image: string | null; // shown as a portrait disc; null renders a plain point
  tone: Tone;
  weight: number; // 0..1 importance: size, labels, and how close to the hub it sits
  detail: NodeDetail;
  // Layout hints, read by lib/title-graph-layout.ts:
  group: string | null; // sub-cluster within the hub: staff role group, cast language, fact group, franchise lane
  links?: string[]; // ids of nodes in the same hub this one is drawn connected to (a voice actor → their characters)
  anchor?: boolean; // a supporting node, not counted as one of the hub's own (the characters a cast web hangs from)
  start?: number | null; // sortable start date, yyyymm; orders the franchise timeline
};

export type Hub = {
  id: HubId;
  label: string;
  kanji: string;
  tone: Tone;
  nodes: WebNode[];
};

export type TitleGraph = {
  anilistId: number;
  entryType: EntryType;
  title: string;
  romaji: string;
  english: string | null;
  native: string | null;
  cover: string | null;
  color: string | null; // AniList's per-title colour; tints the scene
  score: number | null;
  status: string | null;
  synopsis: string[];
  start: number | null; // the show's own start date (yyyymm), its place on the franchise timeline
  hubs: Hub[]; // "details" is the core itself; the rest orbit it
};

// Caps keep the scene readable and fast. Ordered input means the cut drops the least important.
const MAX_NODES = 60;
const MAX_CAST_LANGUAGES = 3;
const MAX_FRANCHISE = 30; // long-running shows list dozens of specials; the cut keeps the path and side stories

const enumLabel = (v: string | null) =>
  v ? v.split("_").map((w) => (w.length <= 3 ? w : w[0] + w.slice(1).toLowerCase())).join(" ") : null;

// A hub's own node count, leaving out supporting anchors.
export const hubSize = (hub: Hub) => hub.nodes.reduce((n, x) => n + (x.anchor ? 0 : 1), 0);

const yyyymm = (d: FuzzyDate | null) => (d?.year ? d.year * 100 + (d.month ?? 0) : null);

const KEY_ROLE = /^(director|original creator|music|character design|screenplay|series composition)/i;

// Facts sit in four small sub-clusters around the core (the node's `group`); `detail.group` is the
// finer label shown on the card. Weight ≥ 0.7 is labelled from afar, the rest once you lean in.
export const FACT_GROUPS = ["Genres", "Stats", "Studios", "Tags"] as const;

function details(d: TitleDetails): WebNode[] {
  const fact = (cluster: (typeof FACT_GROUPS)[number], group: string, label: string, tone: Tone, weight: number): WebNode => ({
    id: `fact:${group}:${label}`, label, sub: group, image: null, tone, weight, detail: { type: "fact", group }, group: cluster,
  });
  const tags = [...d.tags].sort((a, b) => b.rank - a.rank).slice(0, 14);
  const season = d.season && d.seasonYear ? `${SEASON_INFO[d.season].label} ${d.seasonYear}` : null;
  return [
    ...d.genres.map((g) => fact("Genres", "Genre", g, "acc-1", 0.9)),
    ...d.studios.map((s) => fact("Studios", s.isMain ? "Studio" : "Producer", s.name, "violet", s.isMain ? 0.85 : 0.4)),
    ...[
      ["Format", enumLabel(d.format)], ["Source", enumLabel(d.source)], ["Season", season],
      ["Episodes", d.episodes ? `${d.episodes} episodes` : null], ["Score", d.averageScore != null ? `${d.averageScore}%` : null],
    ].flatMap(([g, v]) => (v ? [fact("Stats", g!, v, "gold", 0.75)] : [])),
    // Capped below 0.7: tags are the long tail, labelled only up close.
    ...tags.map((t) => fact("Tags", "Tag", t.name, "acc-3", 0.2 + (t.rank / 100) * 0.45)),
  ];
}

function characters(d: TitleDetails): WebNode[] {
  // AniList already orders by relevance; mains first keeps them on the inner ring.
  const sorted = [...d.characters].sort((a, b) => Number(b.role === "MAIN") - Number(a.role === "MAIN"));
  return sorted.slice(0, MAX_NODES).map((c) => ({
    id: `char:${c.id}`, label: c.name, sub: enumLabel(c.role), image: c.image,
    tone: c.role === "MAIN" ? "acc-1" : "rose", weight: c.role === "MAIN" ? 1 : 0.45,
    detail: { type: "character", role: c.role, voiceActors: c.voiceActors }, group: c.role === "MAIN" ? "main" : "supporting",
  }));
}

function cast(d: TitleDetails): WebNode[] {
  // One node per voice actor; someone voicing two characters links to both.
  const byId = new Map<number, { va: TitleVoiceActor; chars: TitleCharacter[]; main: boolean }>();
  for (const c of d.characters) for (const va of c.voiceActors) {
    const hit = byId.get(va.id);
    if (hit) { hit.chars.push(c); hit.main ||= c.role === "MAIN"; }
    else byId.set(va.id, { va, chars: [c], main: c.role === "MAIN" });
  }
  // Japanese cast first (it is the one every title has), mains before supporting.
  const rank = (x: { va: TitleVoiceActor; main: boolean }) => (x.va.language === "Japanese" ? 2 : 0) + (x.main ? 1 : 0);
  // Three languages at most, each its own ring: Japanese, English, then the largest other dub.
  // Ten rings of three dubbers each would bury the links the web is there to show.
  const count = new Map<string, number>();
  for (const { va } of byId.values()) count.set(va.language ?? "Other", (count.get(va.language ?? "Other") ?? 0) + 1);
  const langs = [...count.keys()].sort((a, b) =>
    Number(b === "Japanese") - Number(a === "Japanese") || Number(b === "English") - Number(a === "English") || count.get(b)! - count.get(a)!)
    .slice(0, MAX_CAST_LANGUAGES);
  const kept = [...byId.values()].filter((x) => langs.includes(x.va.language ?? "Other"))
    .sort((a, b) => rank(b) - rank(a)).slice(0, MAX_NODES);
  const actors = kept.map(({ va, chars, main }): WebNode => ({
    id: `va:${va.id}`, label: va.name, sub: va.language, image: va.image,
    tone: va.language === "Japanese" ? "azure" : "violet", weight: main ? 0.9 : 0.4,
    detail: { type: "person", role: va.language ? `${va.language} voice` : "Voice", characters: chars.map((c) => c.name) },
    group: va.language ?? "Other", links: [...new Set(chars.map((c) => `cast:char:${c.id}`))],
  }));
  // The characters they voice, as small anchors the web hangs from, in AniList's order.
  const voiced = new Set(kept.flatMap((x) => x.chars.map((c) => c.id)));
  const anchors = d.characters.filter((c) => voiced.has(c.id)).map((c): WebNode => ({
    id: `cast:char:${c.id}`, label: c.name, sub: enumLabel(c.role), image: c.image, tone: c.role === "MAIN" ? "acc-1" : "rose",
    weight: 0.25, detail: { type: "character", role: c.role, voiceActors: c.voiceActors }, group: "characters", anchor: true,
  }));
  return [...actors, ...anchors];
}

// Staff sub-clusters. Checked in this order, so "Animation Director" lands in animation and
// "Sound Director" in music before the plain director test sees them.
export const STAFF_GROUPS = ["Direction", "Writing", "Music & sound", "Animation & art", "Other"] as const;
const STAFF_TESTS: [RegExp, (typeof STAFF_GROUPS)[number]][] = [
  [/\b(adr|dub|locali[sz]ation|translat)/i, "Other"],
  [/music|sound|song|composer|lyric|vocal|arrange/i, "Music & sound"],
  [/animat|design|art\b|colou?r|background|\bcg\b|3d|photograph|layout|in-between/i, "Animation & art"],
  [/creator|original story|composition|script|screenplay|writ|story\b/i, "Writing"],
  [/director|storyboard|direction/i, "Direction"],
];
// A person's first listed role decides their group (commas inside "(eps 1, 5)" don't split).
export function staffGroup(role: string | null): (typeof STAFF_GROUPS)[number] {
  const first = (role ?? "").split(/,\s*(?![^()]*\))/)[0];
  return STAFF_TESTS.find(([re]) => re.test(first))?.[1] ?? "Other";
}

function staff(d: TitleDetails): WebNode[] {
  const people = uniqueBy(d.staff, (s) => s.id, (a, b) => ({ ...a, role: [a.role, b.role].filter(Boolean).join(", ") }));
  return people.sort((a, b) => Number(KEY_ROLE.test(b.role ?? "")) - Number(KEY_ROLE.test(a.role ?? "")))
    .slice(0, MAX_NODES).map((s) => ({
      id: `staff:${s.id}`, label: s.name, sub: s.role, image: s.image, tone: "violet",
      weight: KEY_ROLE.test(s.role ?? "") ? 0.9 : 0.4, detail: { type: "person", role: s.role }, group: staffGroup(s.role),
    }));
}

function franchise(d: TitleDetails): WebNode[] {
  const order = ["PREQUEL", "SEQUEL", "PARENT", "SIDE_STORY", "SPIN_OFF", "ALTERNATIVE", "ADAPTATION", "SOURCE"];
  const rank = (r: string | null) => { const i = order.indexOf(r ?? ""); return i < 0 ? order.length : i; };
  return [...d.relations].sort((a, b) => rank(a.relationType) - rank(b.relationType)).slice(0, MAX_FRANCHISE).map((r) => {
    // Prequels and sequels make the timeline itself; everything else branches off it.
    const spine = r.relationType === "PREQUEL" || r.relationType === "SEQUEL";
    const year = r.startDate?.year ?? null;
    return {
      id: `rel:${r.id}:${r.relationType}`, label: r.title, sub: [enumLabel(r.relationType), year].filter(Boolean).join(" · "),
      image: r.cover, tone: spine ? "azure" : "violet", weight: spine ? 1 : 0.5,
      detail: {
        type: "title", anilistId: r.id, entryType: r.entryType, relation: enumLabel(r.relationType), format: enumLabel(r.format), year,
        href: titleHref(r.entryType, r.id),
      },
      group: spine ? "spine" : r.relationType ?? "OTHER", start: yyyymm(r.startDate),
    };
  });
}

function similar(d: TitleDetails): WebNode[] {
  return d.recommendations.slice(0, 24).map((t, i) => ({
    id: `sim:${t.anilistId}`, label: t.title, sub: t.startYear ? String(t.startYear) : null, image: t.thumb ?? t.cover, tone: "gold",
    weight: 1 - i / 24, group: null,
    detail: {
      type: "title", anilistId: t.anilistId, entryType: t.entryType, relation: null, format: enumLabel(t.format), year: t.startYear ?? null,
      href: titleHref(t.entryType, t.anilistId),
    },
  }));
}

function watch(d: TitleDetails): WebNode[] {
  const links = uniqueBy([
    ...(d.trailer?.site === "youtube" ? [{ url: `https://www.youtube.com/watch?v=${d.trailer.id}`, site: "Trailer" }] : []),
    ...d.externalLinks.map((l) => ({ url: l.url, site: l.language ? `${l.site} (${l.language})` : l.site })),
    ...(d.siteUrl ? [{ url: d.siteUrl, site: "AniList" }] : []),
    ...(d.idMal ? [{ url: `https://myanimelist.net/${d.kind.toLowerCase()}/${d.idMal}`, site: "MyAnimeList" }] : []),
  ], (l) => l.url);
  return links.slice(0, MAX_NODES).map((l, i) => ({
    id: `link:${l.url}`, label: l.site, sub: i === 0 && l.site === "Trailer" ? "Watch the trailer" : "External link",
    image: null, tone: "acc-3", weight: l.site === "Trailer" ? 1 : 0.6, detail: { type: "link", url: l.url }, group: null,
  }));
}

export function buildTitleGraph(d: TitleDetails): TitleGraph {
  const hubs: Hub[] = [
    { id: "details", label: "Details", kanji: "詳細", tone: "gold", nodes: details(d) },
    { id: "characters", label: "Characters", kanji: "登場人物", tone: "acc-1", nodes: characters(d) },
    { id: "cast", label: "Cast", kanji: "声優", tone: "azure", nodes: cast(d) },
    { id: "staff", label: "Staff", kanji: "スタッフ", tone: "violet", nodes: staff(d) },
    { id: "franchise", label: "Franchise", kanji: "関連作品", tone: "azure", nodes: franchise(d) },
    { id: "similar", label: "Similar", kanji: "おすすめ", tone: "gold", nodes: similar(d) },
    { id: "watch", label: "Watch", kanji: "視聴", tone: "acc-3", nodes: watch(d) },
  ];
  return {
    anilistId: d.anilistId, entryType: d.entryType, title: d.title, romaji: d.romaji, english: d.english, native: d.native, cover: d.cover,
    color: d.color, score: d.averageScore, status: d.status, synopsis: descriptionParagraphs(d.description), start: yyyymm(d.startDate),
    // A hub with nothing in it is left out rather than drawn empty. Details is the core and always stays.
    hubs: hubs.filter((h) => h.id === "details" || h.nodes.length > 0),
  };
}

/* ---------- person webs ---------- */

// The hubs whose nodes are people with their own web of works, and the AniList staff id behind a
// node there (cast "va:95185", staff "staff:95185").
export const PERSON_HUBS: Partial<Record<HubId, string>> = { cast: "va:", staff: "staff:" };
export function personIdOf(hub: HubId, nodeId: string): number | null {
  const prefix = PERSON_HUBS[hub];
  if (!prefix || !nodeId.startsWith(prefix)) return null;
  const n = Number(nodeId.slice(prefix.length));
  return Number.isInteger(n) && n > 0 ? n : null;
}

const MAX_PERSON_WORKS = 30;

// A person's other works as web nodes, most popular first (the layout puts those closest): for a
// voice actor the characters they voice, for staff the titles they worked on. This show is left
// out, it's the web you came from.
export function personWeb(person: PersonWorks, hub: HubId, showId: number): WebNode[] {
  const top = (popularity: number, max: number) => 0.35 + 0.65 * Math.sqrt(popularity / Math.max(max, 1));
  const title = (w: PersonWorks["credits"][number] | PersonWorks["roles"][number], credit: string): NodeDetail => ({
    type: "title", anilistId: w.anilistId, entryType: w.entryType, relation: null, format: enumLabel(w.format), year: w.year,
    href: titleHref(w.entryType, w.anilistId), credit,
  });
  if (hub === "cast") {
    const roles = person.roles.filter((r) => r.anilistId !== showId).slice(0, MAX_PERSON_WORKS);
    const max = roles[0]?.popularity ?? 1;
    return roles.map((r) => ({
      id: `pw:${r.anilistId}:${r.character.id}`, label: r.character.name, sub: r.title, image: r.character.image ?? r.cover,
      tone: r.character.role === "MAIN" ? "acc-1" : "rose", weight: top(r.popularity, max), group: null,
      detail: title(r, [`as ${r.character.name}`, enumLabel(r.character.role)].filter(Boolean).join(" · ")),
    }));
  }
  const credits = person.credits.filter((c) => c.anilistId !== showId).slice(0, MAX_PERSON_WORKS);
  const max = credits[0]?.popularity ?? 1;
  return credits.map((c) => ({
    id: `pw:${c.anilistId}`, label: c.title, sub: c.role, image: c.cover, tone: "gold", weight: top(c.popularity, max), group: null,
    detail: title(c, c.role ?? "Staff"),
  }));
}

/* ---------- "in your list" ---------- */

// The titles in a graph a signed-in user may already have: this show and the franchise and
// similar webs. (Person webs ask for their own when they load.)
export function markQueries(graph: TitleGraph): { anilistId: number; type: EntryType; names: (string | null)[] }[] {
  const titles = graph.hubs.flatMap((h) => h.nodes.flatMap((n) =>
    n.detail.type === "title" ? [{ anilistId: n.detail.anilistId, type: n.detail.entryType, names: [n.label] }] : []));
  return uniqueBy([{ anilistId: graph.anilistId, type: graph.entryType, names: [graph.title, graph.romaji, graph.native] }, ...titles], (t) => t.anilistId);
}
