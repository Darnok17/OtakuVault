import { SEASON_INFO, descriptionParagraphs, titleHref, uniqueBy, type TitleDetails, type TitleVoiceActor } from "@/lib/anilist-shared";

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
  | { type: "title"; relation: string | null; format: string | null; href: string }
  | { type: "link"; url: string }
  | { type: "fact"; group: string };

export type WebNode = {
  id: string;
  label: string;
  sub: string | null; // a short second line: role, relation type, fact group
  image: string | null; // shown as a portrait disc; null renders a plain point
  tone: Tone;
  weight: number; // 0..1 importance: size, and how close to the hub it sits
  detail: NodeDetail;
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
  title: string;
  romaji: string;
  english: string | null;
  native: string | null;
  cover: string | null;
  color: string | null; // AniList's per-title colour; tints the scene
  score: number | null;
  status: string | null;
  synopsis: string[];
  hubs: Hub[]; // "details" is the core itself; the rest orbit it
};

// Caps keep the scene readable and fast. Ordered input means the cut drops the least important.
const MAX_NODES = 60;

const enumLabel = (v: string | null) =>
  v ? v.split("_").map((w) => (w.length <= 3 ? w : w[0] + w.slice(1).toLowerCase())).join(" ") : null;

const KEY_ROLE = /^(director|original creator|music|character design|screenplay|series composition)/i;

function details(d: TitleDetails): WebNode[] {
  const fact = (group: string, label: string, tone: Tone, weight: number): WebNode =>
    ({ id: `fact:${group}:${label}`, label, sub: group, image: null, tone, weight, detail: { type: "fact", group } });
  const tags = [...d.tags].sort((a, b) => b.rank - a.rank).slice(0, 14);
  const season = d.season && d.seasonYear ? `${SEASON_INFO[d.season].label} ${d.seasonYear}` : null;
  return [
    ...d.genres.map((g) => fact("Genre", g, "acc-1", 0.9)),
    ...d.studios.map((s) => fact(s.isMain ? "Studio" : "Producer", s.name, "violet", s.isMain ? 0.85 : 0.4)),
    ...[
      ["Format", enumLabel(d.format)], ["Source", enumLabel(d.source)], ["Season", season],
      ["Episodes", d.episodes ? `${d.episodes} episodes` : null], ["Score", d.averageScore != null ? `${d.averageScore}%` : null],
    ].flatMap(([g, v]) => (v ? [fact(g!, v, "gold", 0.7)] : [])),
    ...tags.map((t) => fact("Tag", t.name, "acc-3", 0.2 + (t.rank / 100) * 0.5)),
  ];
}

function characters(d: TitleDetails): WebNode[] {
  // AniList already orders by relevance; mains first keeps them on the inner ring.
  const sorted = [...d.characters].sort((a, b) => Number(b.role === "MAIN") - Number(a.role === "MAIN"));
  return sorted.slice(0, MAX_NODES).map((c) => ({
    id: `char:${c.id}`, label: c.name, sub: enumLabel(c.role), image: c.image,
    tone: c.role === "MAIN" ? "acc-1" : "rose", weight: c.role === "MAIN" ? 1 : 0.45,
    detail: { type: "character", role: c.role, voiceActors: c.voiceActors },
  }));
}

function cast(d: TitleDetails): WebNode[] {
  // One node per voice actor; someone voicing two characters lists both.
  const byId = new Map<number, { va: TitleVoiceActor; chars: string[]; main: boolean }>();
  for (const c of d.characters) for (const va of c.voiceActors) {
    const hit = byId.get(va.id);
    if (hit) { hit.chars.push(c.name); hit.main ||= c.role === "MAIN"; }
    else byId.set(va.id, { va, chars: [c.name], main: c.role === "MAIN" });
  }
  // Japanese cast first (it is the one every title has), mains before supporting.
  const rank = (x: { va: TitleVoiceActor; main: boolean }) => (x.va.language === "Japanese" ? 2 : 0) + (x.main ? 1 : 0);
  return [...byId.values()].sort((a, b) => rank(b) - rank(a)).slice(0, MAX_NODES).map(({ va, chars, main }) => ({
    id: `va:${va.id}`, label: va.name, sub: va.language, image: va.image,
    tone: va.language === "Japanese" ? "azure" : "violet", weight: main ? 0.9 : 0.4,
    detail: { type: "person", role: va.language ? `${va.language} voice` : "Voice", characters: chars },
  }));
}

function staff(d: TitleDetails): WebNode[] {
  const people = uniqueBy(d.staff, (s) => s.id, (a, b) => ({ ...a, role: [a.role, b.role].filter(Boolean).join(", ") }));
  return people.sort((a, b) => Number(KEY_ROLE.test(b.role ?? "")) - Number(KEY_ROLE.test(a.role ?? "")))
    .slice(0, MAX_NODES).map((s) => ({
      id: `staff:${s.id}`, label: s.name, sub: s.role, image: s.image, tone: "violet",
      weight: KEY_ROLE.test(s.role ?? "") ? 0.9 : 0.4, detail: { type: "person", role: s.role },
    }));
}

function franchise(d: TitleDetails): WebNode[] {
  const order = ["PREQUEL", "SEQUEL", "PARENT", "SIDE_STORY", "SPIN_OFF", "ALTERNATIVE", "ADAPTATION", "SOURCE"];
  const rank = (r: string | null) => { const i = order.indexOf(r ?? ""); return i < 0 ? order.length : i; };
  return [...d.relations].sort((a, b) => rank(a.relationType) - rank(b.relationType)).slice(0, MAX_NODES).map((r) => ({
    id: `rel:${r.id}:${r.relationType}`, label: r.title, sub: enumLabel(r.relationType), image: r.cover, tone: "azure",
    weight: rank(r.relationType) < 2 ? 1 : 0.5,
    detail: { type: "title", relation: enumLabel(r.relationType), format: enumLabel(r.format), href: titleHref(r.entryType, r.id) },
  }));
}

function similar(d: TitleDetails): WebNode[] {
  return d.recommendations.slice(0, 24).map((t, i) => ({
    id: `sim:${t.anilistId}`, label: t.title, sub: t.startYear ? String(t.startYear) : null, image: t.thumb ?? t.cover, tone: "gold",
    weight: 1 - i / 24, detail: { type: "title", relation: null, format: enumLabel(t.format), href: titleHref(t.entryType, t.anilistId) },
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
    image: null, tone: "acc-3", weight: l.site === "Trailer" ? 1 : 0.6, detail: { type: "link", url: l.url },
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
    anilistId: d.anilistId, title: d.title, romaji: d.romaji, english: d.english, native: d.native, cover: d.cover,
    color: d.color, score: d.averageScore, status: d.status, synopsis: descriptionParagraphs(d.description),
    // A hub with nothing in it is left out rather than drawn empty. Details is the core and always stays.
    hubs: hubs.filter((h) => h.id === "details" || h.nodes.length > 0),
  };
}
