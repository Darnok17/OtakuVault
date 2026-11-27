import { FACT_GROUPS, STAFF_GROUPS, type Hub, type HubId, type Tone, type TitleGraph, type WebNode } from "@/lib/title-graph";

// Where everything sits in the 3D world. Deterministic — no physics — so a title always looks the
// same, and camera moves never fight a settling simulation. Pure math on plain tuples.
//
//   core ............ the show, at the origin
//   hub ring ........ the other hubs on a tilted ring around it (the "orb" overview)
//   cluster ......... a focused hub's web, laid out in the hub's own plane a little outward from
//                     the hub, so the camera flies past the hub into it. Each hub has its own shape:
//                       characters  mains on an inner ring, supporting cast on an outer one
//                       cast        the voiced characters as a small inner ring, one ring of voice
//                                   actors per language outside it, each actor next to its roles
//                       staff       one sub-cluster per role group
//                       franchise   prequels → this show → sequels as a path, other relations
//                                   branching above and below it at their place in time
//                       similar     distance from the hub is the recommendation rank
//                       watch       a short list
//   details ......... the core's own web: four small fact clusters around the show itself

export type V3 = [number, number, number];

// An edge end: a node index (≥ 0), the hub itself (-1), or a joint (-2 - j): an unmarked point
// lines meet at, like the middle of a staff sub-cluster or this show's spot on the franchise path.
export type EdgeEnd = number;
export const HUB_END = -1;
export const jointEnd = (j: number): EdgeEnd => -2 - j;

// A sub-cluster caption (Japanese · 24, Direction, Genres…). `marker` draws a small ring at the joint.
export type GroupLabel = { id: string; label: string; tone: Tone; at: V3; joint?: number; marker?: boolean };

export type HubLayout = {
  id: HubId;
  pos: V3; // the hub node itself
  normal: V3; // outward direction; clusters open along it
  center: V3; // centre of the cluster when opened
  nodes: V3[]; // one per graph node, same order
  joints: V3[];
  edges: [EdgeEnd, EdgeEnd][];
  groups: GroupLabel[];
  satellites: V3[]; // the closed hub's preview dots
};

export type WorldLayout = { hubs: Record<HubId, HubLayout>; dust: Float32Array };

export type CameraView = { pos: V3; target: V3 };

export const CORE_RADIUS = 1.1;
const HUB_RING = 7.5;
const CLUSTER_OFFSET = 3; // how far out past its hub a cluster opens
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const TAU = Math.PI * 2;
const DETAILS_NORMAL = norm([0, 0.32, 1]);

/* ---------- vector helpers ---------- */

function add(a: V3, b: V3): V3 { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
function sub(a: V3, b: V3): V3 { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function scale(a: V3, s: number): V3 { return [a[0] * s, a[1] * s, a[2] * s]; }
function dot(a: V3, b: V3) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function cross(a: V3, b: V3): V3 { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function norm(a: V3): V3 { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }

// A tangent frame for a plane facing `n`: u points right, v up (as seen from outside, along -n).
function frame(n: V3): [V3, V3] {
  const up: V3 = Math.abs(n[1]) > 0.95 ? [1, 0, 0] : [0, 1, 0];
  const u = norm(cross(up, n));
  return [u, cross(n, u)];
}

// Points spread evenly over a sphere.
function fibonacciSphere(count: number, radius: number, center: V3 = [0, 0, 0]): V3[] {
  return Array.from({ length: count }, (_, i) => {
    const y = count === 1 ? 0 : 1 - (i / (count - 1)) * 2;
    const r = Math.sqrt(1 - y * y);
    const a = GOLDEN * i;
    return add(center, [Math.cos(a) * r * radius, y * radius, Math.sin(a) * r * radius]);
  });
}

const polar = (r: number, a: number, z = 0): V3 => [Math.cos(a) * r, Math.sin(a) * r, z];
const ripple = (k: number, amp: number) => Math.sin(k * 1.7) * amp;

// Sunflower spiral: point k at radius ∝ √k, so ordered input puts the most important in the middle.
const sunflower = (count: number, step: number): V3[] =>
  Array.from({ length: count }, (_, k) => polar(count === 1 ? 0 : step * Math.sqrt(k + 0.7), k * GOLDEN, ripple(k, 0.25)));
const sunflowerRadius = (count: number, step: number) => (count <= 1 ? 0 : step * Math.sqrt(count - 0.3));

// Spreads angles (radians) around a circle so neighbours are at least `gap` apart, moving each as
// little as it can. Input order is kept for ties; deterministic.
function spreadAngles(want: number[], gap: number): number[] {
  const n = want.length;
  if (n < 2) return want.slice();
  gap = Math.min(gap, TAU / n);
  const order = want.map((a, i) => [((a % TAU) + TAU) % TAU, i] as const).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const a = order.map(([x]) => x);
  for (let pass = 0; pass < 200; pass++) {
    let moved = false;
    for (let k = 0; k < n; k++) {
      const j = (k + 1) % n;
      const d = j === 0 ? a[0] + TAU - a[k] : a[j] - a[k];
      if (d < gap - 1e-6) {
        const push = (gap - d) / 2;
        a[k] -= push;
        a[j] += push;
        moved = true;
      }
    }
    if (!moved) break;
  }
  const out = new Array<number>(n);
  order.forEach(([, i], k) => { out[i] = a[k]; });
  return out;
}

// The circular mean of some angles.
const meanAngle = (as: number[]) => Math.atan2(as.reduce((s, a) => s + Math.sin(a), 0), as.reduce((s, a) => s + Math.cos(a), 0));

/* ---------- per-hub layouts, in the hub's local plane ---------- */

// x right, y up, z toward the viewer; the cluster centre is the origin and the hub sits behind it
// at z = -CLUSTER_OFFSET. Groups' `at` and joints use the same coordinates.
type Local = { nodes: V3[]; joints: V3[]; edges: [EdgeEnd, EdgeEnd][]; groups: GroupLabel[] };

const indexOf = (nodes: WebNode[], pick: (n: WebNode) => boolean) => nodes.flatMap((n, i) => (pick(n) ? [i] : []));

function characterLayout(hub: Hub): Local {
  const nodes = new Array<V3>(hub.nodes.length);
  const edges: Local["edges"] = [];
  let mains = indexOf(hub.nodes, (n) => n.group === "main");
  let rest = indexOf(hub.nodes, (n) => n.group !== "main");
  if (mains.length === 0) { mains = rest.slice(0, 1); rest = rest.slice(1); }
  // Mains ring the hub; one main sits in the middle.
  const rM = mains.length <= 1 ? 0 : Math.max(1.6, (mains.length * 1.65) / TAU);
  const mainAngle = mains.map((_, k) => Math.PI / 2 - (k / mains.length) * TAU);
  mains.forEach((i, k) => { nodes[i] = polar(rM, mainAngle[k], 0.5); edges.push([HUB_END, i]); });
  if (mains.length > 2) mains.forEach((i, k) => edges.push([i, mains[(k + 1) % mains.length]]));
  // Supporting characters on an outer ring, staggered in two bands once it gets crowded.
  const staggered = rest.length > 22;
  const rS = Math.max(rM + 1.8, (rest.length * (staggered ? 0.72 : 1.1)) / TAU);
  rest.forEach((i, k) => {
    const a = Math.PI / 2 - ((k + 0.5) / rest.length) * TAU;
    nodes[i] = polar(rS + (staggered && k % 2 ? 0.9 : 0), a, -0.3 + ripple(k, 0.25));
    // Each hangs off the nearest main, so the rings read as one web.
    if (rM === 0) { edges.push([mains[0], i]); return; }
    let best = 0;
    mainAngle.forEach((m, j) => { if (Math.cos(a - m) > Math.cos(a - mainAngle[best])) best = j; });
    edges.push([mains[best], i]);
  });
  return { nodes, joints: [], edges, groups: [] };
}

function castLayout(hub: Hub): Local {
  const nodes = new Array<V3>(hub.nodes.length);
  const edges: Local["edges"] = [];
  const groups: GroupLabel[] = [];
  const anchors = indexOf(hub.nodes, (n) => !!n.anchor);
  const anchorAt = new Map(anchors.map((i, k) => [hub.nodes[i].id, k]));
  // The voiced characters: a tight inner ring, in AniList order (mains first, from the top).
  const r0 = anchors.length <= 1 ? 0 : Math.max(1.3, (anchors.length * 0.66) / TAU);
  const theta = anchors.map((_, k) => Math.PI / 2 - (k / Math.max(anchors.length, 1)) * TAU);
  anchors.forEach((i, k) => { nodes[i] = polar(r0, theta[k], 0.35); });
  if (anchors.length > 2) anchors.forEach((i, k) => edges.push([i, anchors[(k + 1) % anchors.length]]));
  anchors.forEach((i) => edges.push([HUB_END, i]));

  // One ring per language, in first-seen order (Japanese first), each actor at its characters' angle.
  const languages = [...new Set(hub.nodes.filter((n) => !n.anchor).map((n) => n.group ?? "Other"))];
  let r = r0;
  const rings: { lang: string; r: number; z: number; angles: number[]; count: number }[] = [];
  languages.forEach((lang, li) => {
    const members = indexOf(hub.nodes, (n) => !n.anchor && (n.group ?? "Other") === lang);
    const spacing = 1.2;
    r = Math.max(r + (li === 0 ? 1.7 : 1.35), (members.length * spacing) / TAU);
    const want = members.map((i) => {
      const own = (hub.nodes[i].links ?? []).flatMap((id) => { const k = anchorAt.get(id); return k == null ? [] : [theta[k]]; });
      return own.length ? meanAngle(own) : Math.PI / 2;
    });
    const angles = spreadAngles(want, spacing / r);
    const z = -0.25 * (li + 1);
    members.forEach((i, k) => {
      nodes[i] = polar(r, angles[k], z + ripple(k, 0.15));
      for (const id of hub.nodes[i].links ?? []) { const a = anchorAt.get(id); if (a != null) edges.push([i, anchors[a]]); }
    });
    rings.push({ lang, r, z, angles, count: members.length });
  });
  // Captions line up along one radius: the direction with the most room on every ring, leaning
  // to straight up or down so the stacked captions separate vertically.
  let best = -Math.PI / 2, bestScore = -Infinity;
  for (let d = 0; d < 72; d++) {
    const a = (d / 72) * TAU;
    const room = rings.reduce((sum, ring) => sum + Math.min(...ring.angles.map((x) => {
      const diff = Math.abs((((a - x) % TAU) + TAU) % TAU);
      return Math.min(diff, TAU - diff) * ring.r;
    }), 3), 0);
    const score = room * (0.6 + 0.4 * Math.abs(Math.sin(a)));
    if (score > bestScore + 1e-9) { bestScore = score; best = a; }
  }
  for (const ring of rings) {
    groups.push({ id: `cast:${ring.lang}`, label: `${ring.lang} · ${ring.count}`, tone: ring.lang === "Japanese" ? "azure" : "violet", at: polar(ring.r, best, ring.z) });
  }
  return { nodes, joints: [], edges, groups };
}

const STAFF_TONES: Record<string, Tone> = {
  Direction: "gold", Writing: "acc-3", "Music & sound": "rose", "Animation & art": "acc-1", Other: "violet",
};

function staffLayout(hub: Hub): Local {
  const nodes = new Array<V3>(hub.nodes.length);
  const edges: Local["edges"] = [];
  const groups: GroupLabel[] = [];
  const joints: V3[] = [];
  const present = STAFF_GROUPS.map((g) => ({ g, members: indexOf(hub.nodes, (n) => n.group === g) })).filter((x) => x.members.length);
  const step = 0.95;
  const radii = present.map((p) => sunflowerRadius(p.members.length, step) + 0.7);
  // Sub-clusters around the hub, each given an arc in proportion to its size, and pushed out
  // until neighbours clear each other and the middle stays open.
  const total = radii.reduce((s, x) => s + x, 0);
  const mid: number[] = [];
  let acc = 0;
  radii.forEach((x) => { mid.push(Math.PI / 2 - ((acc + x / 2) / total) * TAU); acc += x; });
  let R = present.length === 1 ? 0 : Math.max(...radii) + 0.6;
  if (present.length > 1) present.forEach((_, k) => {
    const j = (k + 1) % present.length;
    if (present.length === 2 && k === 1) return;
    let d = Math.abs(mid[j] - mid[k]);
    d = Math.min(d, TAU - d);
    R = Math.max(R, (radii[k] + radii[j] + 0.5) / (2 * Math.sin(d / 2)));
  });
  present.forEach((p, k) => {
    const c = polar(R, mid[k], 0);
    const j = joints.push(c) - 1;
    edges.push([HUB_END, jointEnd(j)]);
    sunflower(p.members.length, step).forEach((q, m) => {
      const i = p.members[m];
      nodes[i] = add(c, [q[0], q[1], q[2] - Math.hypot(q[0], q[1]) * 0.08]);
      edges.push([jointEnd(j), i]);
    });
    groups.push({ id: `staff:${p.g}`, label: p.g, tone: STAFF_TONES[p.g], at: add(c, [0, radii[k] + 0.05, 0.3]), joint: j });
  });
  return { nodes, joints, edges, groups };
}

// Relations that hang above the franchise path (stories set beside it) and below (other versions).
const BELOW = new Set(["ALTERNATIVE", "ADAPTATION", "SOURCE", "CONTAINS"]);

function franchiseLayout(hub: Hub, graph: TitleGraph): Local {
  const nodes = new Array<V3>(hub.nodes.length);
  const edges: Local["edges"] = [];
  const NOW = jointEnd(0);
  // The path: prequels by date, this show, sequels by date. Undated ones sit next to the show.
  const byDate = (rel: string) => indexOf(hub.nodes, (n) => n.group === "spine" && n.id.endsWith(`:${rel}`))
    .map((i, k) => ({ i, k, s: hub.nodes[i].start ?? null }));
  const order = (xs: { i: number; k: number; s: number | null }[], undatedLast: boolean) =>
    [...xs].sort((a, b) => (a.s == null) !== (b.s == null) ? ((a.s == null) === undatedLast ? 1 : -1) : (a.s ?? 0) - (b.s ?? 0) || a.k - b.k);
  const path: { end: EdgeEnd; s: number | null }[] = [
    ...order(byDate("PREQUEL"), true).map((x) => ({ end: x.i, s: x.s })),
    { end: NOW, s: graph.start },
    ...order(byDate("SEQUEL"), false).map((x) => ({ end: x.i, s: x.s })),
  ];
  // Everything else attaches to the path at the point closest to it in time (undated: this show),
  // as a small grid above it (stories beside the path) or below (other versions of it).
  const nowAt = path.findIndex((p) => p.end === NOW);
  const lanes = path.map(() => ({ above: [] as { i: number; s: number | null }[], below: [] as { i: number; s: number | null }[] }));
  indexOf(hub.nodes, (n) => n.group !== "spine").forEach((i) => {
    const s = hub.nodes[i].start ?? null;
    let best = nowAt;
    if (s != null) path.forEach((p, k) => { if (p.s != null && Math.abs(p.s - s) < Math.abs((path[best].s ?? Infinity) - s)) best = k; });
    lanes[best][BELOW.has(hub.nodes[i].group ?? "") ? "below" : "above"].push({ i, s });
  });
  const CW = 1.7, RH = 1.45;
  const colsFor = (n: number) => (n <= 3 ? n : Math.ceil(Math.sqrt(n * 2)));
  const widths = lanes.map((l) => Math.max(colsFor(l.above.length), colsFor(l.below.length), 1) * CW);
  // Path stops spread apart as far as their grids need.
  const xs: number[] = [0];
  for (let k = 1; k < path.length; k++) xs.push(xs[k - 1] + Math.max(2, (widths[k - 1] + widths[k]) / 2 + 0.3));
  const mid = (xs[0] + xs[xs.length - 1]) / 2;
  for (let k = 0; k < xs.length; k++) xs[k] -= mid;
  // A gentle arch, curving back at the ends so a long run reads as a path rather than a line.
  const at = (x: number): V3 => [x, -0.025 * x * x, -0.03 * x * x];
  const joints: V3[] = [at(xs[nowAt])];
  path.forEach((p, k) => { if (p.end >= 0) nodes[p.end] = at(xs[k]); if (k) edges.push([path[k - 1].end, p.end]); });
  edges.push([HUB_END, NOW]);
  lanes.forEach((lane, k) => {
    for (const side of ["above", "below"] as const) {
      // Oldest first, filling rows outward from the path.
      const items = [...lane[side]].sort((a, b) => (a.s ?? Infinity) - (b.s ?? Infinity) || a.i - b.i);
      const cols = colsFor(items.length);
      items.forEach((it, m) => {
        const c = m % cols, r = Math.floor(m / cols);
        const rowCols = Math.min(cols, items.length - r * cols);
        const x = xs[k] + (c - (rowCols - 1) / 2) * CW;
        const base = at(xs[k]);
        // Every other column a little further out, so neighbouring labels don't touch.
        const y = (side === "below" ? -1 : 1) * (1.75 + r * RH + (c % 2) * 0.35);
        nodes[it.i] = [x, base[1] + y, base[2] + 0.25 - r * 0.15];
        edges.push([path[k].end, it.i]);
      });
    }
  });
  const groups: GroupLabel[] = [{ id: "franchise:now", label: "◆ This show", tone: "gold", at: add(joints[0], [0, -0.75, 0]), joint: 0, marker: true }];
  return { nodes, joints, edges, groups };
}

function similarLayout(hub: Hub): Local {
  // Rank is distance: the best match closest to the hub, each next one a little further out.
  const nodes = hub.nodes.map((_, i): V3 => polar(1.6 + i * 0.24, Math.PI / 2 + i * GOLDEN, -i * 0.05));
  return { nodes, joints: [], edges: nodes.map((_, i) => [HUB_END, i]), groups: [] };
}

function watchLayout(hub: Hub): Local {
  // A short list beside the hub: columns of up to seven.
  const per = 7;
  const cols = Math.ceil(hub.nodes.length / per);
  const nodes = hub.nodes.map((_, i): V3 => {
    const c = Math.floor(i / per), r = i % per, rows = Math.min(per, hub.nodes.length - c * per);
    return [(c - (cols - 1) / 2) * 2.6, ((rows - 1) / 2 - r) * 0.7, -Math.abs(r - (rows - 1) / 2) * 0.12];
  });
  return { nodes, joints: [], edges: nodes.map((_, i) => [HUB_END, i]), groups: [] };
}

const FACT_TONES: Record<string, Tone> = { Genres: "acc-1", Stats: "gold", Studios: "violet", Tags: "acc-3" };
// Where each fact cluster sits around the core: [x side, y side].
const FACT_SIDES: Record<string, [number, number]> = { Genres: [-1, 1], Stats: [1, 1], Studios: [1, -1], Tags: [-1, -1] };

function detailsLayout(hub: Hub): Local {
  const nodes = new Array<V3>(hub.nodes.length);
  const edges: Local["edges"] = [];
  const joints: V3[] = [];
  const groups: GroupLabel[] = [];
  const CW = 1.75, CH = 0.58;
  for (const g of FACT_GROUPS) {
    const members = indexOf(hub.nodes, (n) => n.group === g);
    if (!members.length) continue;
    // A small grid, filled down each column so the heaviest facts come first.
    const cols = members.length <= 4 ? 1 : members.length <= 10 ? 2 : 3;
    const rows = Math.ceil(members.length / cols);
    const hw = ((cols - 1) * CW) / 2, hh = ((rows - 1) * CH) / 2;
    const [sx, sy] = FACT_SIDES[g];
    // Above and below the core, leaning out to the side: square enough for a phone screen too.
    const c: V3 = [sx * (1.1 + hw), sy * (1.75 + hh), 0.6];
    const j = joints.push(c) - 1;
    edges.push([HUB_END, jointEnd(j)]);
    members.forEach((i, m) => {
      const col = Math.floor(m / rows), row = m % rows;
      nodes[i] = add(c, [col * CW - hw, hh - row * CH, ripple(m, 0.15)]);
      edges.push([jointEnd(j), i]);
    });
    groups.push({ id: `details:${g}`, label: g, tone: FACT_TONES[g], at: add(c, [0, sy > 0 ? hh + 0.5 : -hh - 0.55, 0]), joint: j });
  }
  return { nodes, joints, edges, groups };
}

function localLayout(hub: Hub, graph: TitleGraph): Local {
  switch (hub.id) {
    case "details": return detailsLayout(hub);
    case "characters": return characterLayout(hub);
    case "cast": return castLayout(hub);
    case "staff": return staffLayout(hub);
    case "franchise": return franchiseLayout(hub, graph);
    case "similar": return similarLayout(hub);
    case "watch": return watchLayout(hub);
  }
}

/* ---------- layout ---------- */

export function layoutWorld(graph: TitleGraph): WorldLayout {
  const ring = graph.hubs.filter((h) => h.id !== "details");
  const hubs = {} as Record<HubId, HubLayout>;

  for (const hub of graph.hubs) {
    let pos: V3, normal: V3, center: V3;
    if (hub.id === "details") {
      // The show's own web sits around the core, facing the default view.
      pos = [0, 0, 0]; normal = DETAILS_NORMAL; center = [0, 0, 0];
    } else {
      const i = ring.indexOf(hub);
      // Alternating slightly above and below the ring for depth.
      // Offset so no hub sits dead in front of the core (it would block the details view), and
      // skewed off the ring's mirror line so front and back hubs never line up on screen.
      const a = ((i + 0.5) / ring.length) * TAU + Math.PI / 2 + 0.33;
      // The ring tilts like an orbit seen from above: hubs in front sit lower, so none covers the core.
      pos = [Math.cos(a) * HUB_RING, (i % 2 ? 1 : -1) * 0.9 - Math.sin(a) * 2.4, Math.sin(a) * HUB_RING * 0.8];
      normal = norm(pos);
      center = add(pos, scale(normal, CLUSTER_OFFSET));
    }
    const [u, v] = frame(normal);
    const toWorld = (p: V3): V3 => add(add(add(center, scale(u, p[0])), scale(v, p[1])), scale(normal, p[2]));
    const local = localLayout(hub, graph);
    hubs[hub.id] = {
      id: hub.id, pos, normal, center,
      nodes: local.nodes.map(toWorld),
      joints: local.joints.map(toWorld),
      edges: local.edges,
      groups: local.groups.map((g) => ({ ...g, at: toWorld(g.at) })),
      satellites: hub.id === "details" ? [] : fibonacciSphere(Math.min(hub.nodes.length, 9), 0.95, pos),
    };
  }

  // Background star dust: a loose shell well outside the hubs, seeded so it never reshuffles.
  let seed = graph.anilistId % 2147483647 || 1;
  const rand = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const dust = new Float32Array(700 * 3);
  for (let k = 0; k < 700; k++) {
    const d = norm([rand() * 2 - 1, rand() * 2 - 1, rand() * 2 - 1]);
    const r = 22 + rand() * 40;
    dust.set([d[0] * r, d[1] * r * 0.7, d[2] * r], k * 3);
  }

  return { hubs, dust };
}

// Resolves an edge end to its position.
export function endPoint(at: HubLayout, e: EdgeEnd): V3 {
  return e >= 0 ? at.nodes[e] : e === HUB_END ? at.pos : at.joints[-2 - e];
}

/* ---------- camera ---------- */

export const OVERVIEW: CameraView = { pos: [0, 8.5, 20], target: [0, 0, 0] };
export const FOV = 45;

// The canvas size, and optionally how far the DOM overlays reach into it from each edge (measured
// by TitleWorld). Without insets, typical HUD and panel sizes are assumed.
export type Insets = { top: number; right: number; bottom: number; left: number };
export type Viewport = { width: number; height: number; insets?: Insets };
const DEFAULT_VIEWPORT: Viewport = { width: 1440, height: 900 };
export const PHONE_WIDTH = 720; // matches the CSS breakpoint where the HUD and panel restack

// How far a screen of this shape has to pull back; fog and zoom limits scale with it.
export const reach = (aspect: number) => Math.min(Math.max(1.35 / aspect, 1), 2.6);

// The part of the screen a view may use, in NDC, after the DOM overlays (TitleWorld): the HUD
// across the top, the focus panel on the right (bottom on phones) once a hub is open.
export function safeArea(vp: Viewport, panel: boolean) {
  const phone = vp.width <= PHONE_WIDTH;
  const inset = { ...(vp.insets ?? (phone
    ? { top: 175, bottom: panel ? 165 : 30, left: 14, right: 14 }
    : { top: 150, bottom: 40, left: 30, right: panel ? 370 : 30 })) };
  // Overlays can't take more than 60% of either axis (a phone's HUD plus a long synopsis would):
  // past that the web is framed partly under them rather than shrunk to a speck.
  const squeeze = (a: "top" | "left", b: "bottom" | "right", size: number) => {
    const k = Math.min(1, (size * 0.6) / Math.max(inset[a] + inset[b], 1));
    inset[a] *= k; inset[b] *= k;
  };
  squeeze("top", "bottom", vp.height);
  squeeze("left", "right", vp.width);
  // Labels are centred under their nodes and up to ~150px wide: keep half of that clear at the sides.
  const label = Math.min(75, vp.width * 0.12);
  return {
    x0: -1 + (2 * (inset.left + label)) / vp.width, x1: 1 - (2 * (inset.right + label)) / vp.width,
    y0: -1 + (2 * inset.bottom) / vp.height, y1: 1 - (2 * inset.top) / vp.height,
  };
}

// Room each node needs around its point: disc radius sideways, plus its label below.
const PAD = { side: 0.75, top: 0.6, bottom: 0.95 };

// The closest camera, looking along -dir, that fits every point inside the safe area. For a
// fixed distance the sideways shift that fits is a linear constraint per point, so this is a
// search over distance alone; the shift is then the middle of what fits (or `prefer` if allowed).
function fitView(points: V3[], center: V3, dir: V3, vp: Viewport, panel: boolean, minDist: number, prefer?: [number, number]): CameraView {
  const area = safeArea(vp, panel);
  const t = Math.tan((FOV / 2) * (Math.PI / 180));
  const aspect = vp.width / vp.height;
  const f = scale(dir, -1);
  const right = norm(cross(f, [0, 1, 0]));
  const up = cross(right, f);
  const rel = points.map((p) => { const q = sub(p, center); return [dot(q, right), dot(q, up), dot(q, f)] as const; });
  const span = (d: number, axis: 0 | 1) => {
    const [lo, hi, k, padLo, padHi] = axis === 0
      ? [area.x0, area.x1, t * aspect, PAD.side, PAD.side] : [area.y0, area.y1, t, PAD.bottom, PAD.top];
    let min = -Infinity, max = Infinity;
    for (const r of rel) {
      const z = r[2] + d;
      if (z < 0.5) return null;
      // lo ≤ (a ± pad - s) / (z k) ≤ hi
      min = Math.max(min, r[axis] + padHi - hi * z * k);
      max = Math.min(max, r[axis] - padLo - lo * z * k);
    }
    return min <= max ? [min, max] as const : null;
  };
  const fits = (d: number) => span(d, 0) && span(d, 1);
  let lo = minDist, hi = minDist;
  while (!fits(hi) && hi < 400) hi *= 1.5;
  if (hi > minDist) {
    for (let k = 0; k < 40; k++) { const m = (lo + hi) / 2; if (fits(m)) hi = m; else lo = m; }
  }
  const d = hi * (hi > minDist ? 1.04 : 1);
  const sx = span(d, 0) ?? [0, 0], sy = span(d, 1) ?? [0, 0];
  const pick = (s: readonly [number, number], want?: number) =>
    want != null ? Math.min(Math.max(want, s[0]), s[1]) : (s[0] + s[1]) / 2;
  const shift = add(scale(right, pick(sx, prefer?.[0])), scale(up, pick(sy, prefer?.[1])));
  const target = add(center, shift);
  return { pos: add(target, scale(dir, d)), target };
}

// Everything a hub's view has to keep on screen.
export function viewPoints(layout: WorldLayout, hubId: HubId): V3[] {
  const at = layout.hubs[hubId];
  return hubId === "details"
    ? [...at.nodes, ...at.groups.map((g) => g.at), ...fibonacciSphere(8, CORE_RADIUS * 1.5)]
    : [...at.nodes, ...at.groups.map((g) => g.at)];
}

export function cameraFor(layout: WorldLayout, hubId: HubId | null, nodeIndex: number | null, vp: Viewport = DEFAULT_VIEWPORT): CameraView {
  const hub = hubId ? layout.hubs[hubId] : null;
  if (!hub) {
    // The orb: framed as designed on a wide screen, pulled back as far as a narrow one needs.
    const pts = Object.values(layout.hubs).flatMap((h) => (h.id === "details" ? [] : [h.pos, ...h.satellites]));
    const dir = norm(OVERVIEW.pos);
    return fitView([...pts, [0, CORE_RADIUS * 1.6, 0], [0, -CORE_RADIUS * 1.9, 0]], OVERVIEW.target, dir, vp, false,
      Math.hypot(...OVERVIEW.pos), [0, 0]);
  }
  const [, v] = frame(hub.normal);
  if (nodeIndex != null && hub.nodes[nodeIndex]) {
    // Close on one node, nudged so the info panel on the right doesn't cover it.
    const p = hub.nodes[nodeIndex];
    // Details nodes wrap the core, so each is approached from its own outward side.
    const n = hubId === "details" ? norm(add(p, scale(DETAILS_NORMAL, 2))) : hub.normal;
    const [u, w] = frame(n);
    return { pos: add(add(p, scale(n, 8.5)), scale(w, 1)), target: add(p, scale(u, 1.6)) };
  }
  // Seen from outside the cluster, a little from above, as close as fits everything.
  return fitView(viewPoints(layout, hub.id), hub.center, norm(add(hub.normal, scale(v, 0.18))), vp, true, 10);
}

/* ---------- person webs ---------- */

// A voice actor's or staff member's other works, opened from their node in the cast or staff web:
// rings around a centre a little in front of the person (along the hub's normal, so the camera
// flies past them into it, as it does from a hub into its cluster). Most popular on the inner
// ring, from the top, clockwise. Shaped like a HubLayout with the person as its "hub", so the
// scene draws it with the same cluster code.
const PERSON_OFFSET = 2.6;
const PERSON_RING0 = 2.1;
const PERSON_RING_STEP = 1.45;
const PERSON_SPACING = 1.35; // arc length between neighbours on a ring

export function personLayout(at: HubLayout, nodeIndex: number, count: number): HubLayout {
  const pos = at.nodes[nodeIndex];
  const normal = at.normal;
  const center = add(pos, scale(normal, PERSON_OFFSET));
  const [u, v] = frame(normal);
  const toWorld = (p: V3): V3 => add(add(add(center, scale(u, p[0])), scale(v, p[1])), scale(normal, p[2]));
  const local: V3[] = [];
  for (let ring = 0; local.length < count; ring++) {
    const r = PERSON_RING0 + ring * PERSON_RING_STEP;
    const m = Math.min(Math.max(6, Math.floor((TAU * r) / PERSON_SPACING)), count - local.length);
    // Each ring turned half a step from the last, so its nodes sit in the inner ring's gaps.
    for (let j = 0; j < m; j++) local.push(polar(r, Math.PI / 2 - ((j + (ring % 2) * 0.5) / m) * TAU, -ring * 0.35 + ripple(j, 0.12)));
  }
  const nodes = local.map(toWorld);
  return { id: at.id, pos, normal, center, nodes, joints: [], edges: nodes.map((_, i) => [HUB_END, i]), groups: [], satellites: [] };
}

// The person web framed whole (the person's own node included), or closed on one of its works.
export function cameraForPerson(web: HubLayout, workIndex: number | null, vp: Viewport = DEFAULT_VIEWPORT): CameraView {
  const [u, v] = frame(web.normal);
  if (workIndex != null && web.nodes[workIndex]) {
    const p = web.nodes[workIndex];
    return { pos: add(add(p, scale(web.normal, 8.5)), scale(v, 1)), target: add(p, scale(u, 1.6)) };
  }
  return fitView([...web.nodes, web.pos], web.center, norm(add(web.normal, scale(v, 0.18))), vp, true, 8);
}
