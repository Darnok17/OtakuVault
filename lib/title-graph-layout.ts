import type { HubId, TitleGraph } from "@/lib/title-graph";

// Where everything sits in the 3D world. Deterministic — no physics — so a title always looks the
// same, and camera moves never fight a settling simulation. Pure math on plain tuples.
//
//   core ............ the show, at the origin
//   hub ring ........ the other hubs on a tilted ring around it (the "orb" overview)
//   cluster ......... a focused hub's nodes, on a sunflower spiral pushed outward from the hub,
//                     so the camera flies past the hub into its web
//   details ......... the core's own web: a shell around the show itself

export type V3 = [number, number, number];

export type HubLayout = {
  id: HubId;
  pos: V3; // the hub node itself
  normal: V3; // outward direction; clusters open along it
  center: V3; // centre of the cluster when opened
  nodes: V3[]; // one per graph node, same order
  plexus: [number, number][]; // faint neighbour links inside the cluster
  satellites: V3[]; // the closed hub's preview dots
};

export type WorldLayout = { hubs: Record<HubId, HubLayout>; dust: Float32Array };

export type CameraView = { pos: V3; target: V3 };

export const CORE_RADIUS = 1.1;
const HUB_RING = 7.5;
const GOLDEN = Math.PI * (3 - Math.sqrt(5));
const DETAILS_NORMAL = norm([0, 0.32, 1]);

/* ---------- vector helpers ---------- */

function add(a: V3, b: V3): V3 { return [a[0] + b[0], a[1] + b[1], a[2] + b[2]]; }
function scale(a: V3, s: number): V3 { return [a[0] * s, a[1] * s, a[2] * s]; }
function cross(a: V3, b: V3): V3 { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function norm(a: V3): V3 { const l = Math.hypot(...a) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
function dist2(a: V3, b: V3) { return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2; }

// A tangent frame for a plane facing `n`.
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

// Each point linked to its k nearest neighbours: the "plexus" look.
function nearest(points: V3[], k: number): [number, number][] {
  const seen = new Set<string>();
  const out: [number, number][] = [];
  points.forEach((p, i) => {
    points.map((q, j) => [j, dist2(p, q)] as const).filter(([j]) => j !== i)
      .sort((a, b) => a[1] - b[1]).slice(0, k).forEach(([j]) => {
        const key = i < j ? `${i}-${j}` : `${j}-${i}`;
        if (!seen.has(key)) { seen.add(key); out.push([Math.min(i, j), Math.max(i, j)]); }
      });
  });
  return out;
}

// Spacing grows with node count so big casts stay legible.
const spiralStep = (count: number) => (count > 30 ? 1.05 : 1.25);

/* ---------- layout ---------- */

export function layoutWorld(graph: TitleGraph): WorldLayout {
  const ring = graph.hubs.filter((h) => h.id !== "details");
  const hubs = {} as Record<HubId, HubLayout>;

  for (const hub of graph.hubs) {
    const count = hub.nodes.length;
    if (hub.id === "details") {
      // The show's own web wraps the core; heavier facts sit on the front-facing side first.
      const nodes = fibonacciSphere(count, 3.6).sort((a, b) => b[2] + b[1] * 0.3 - (a[2] + a[1] * 0.3));
      hubs.details = {
        id: "details", pos: [0, 0, 0], normal: DETAILS_NORMAL, center: [0, 0, 0], nodes,
        plexus: nearest(nodes, 2), satellites: [],
      };
      continue;
    }
    const i = ring.indexOf(hub);
    // Alternating slightly above and below the ring for depth.
    // Offset so no hub sits dead in front of the core (it would block the details view), and
    // skewed off the ring's mirror line so front and back hubs never line up on screen.
    const a = ((i + 0.5) / ring.length) * Math.PI * 2 + Math.PI / 2 + 0.33;
    // The ring tilts like an orbit seen from above: hubs in front sit lower, so none covers the core.
    const pos: V3 = [Math.cos(a) * HUB_RING, (i % 2 ? 1 : -1) * 0.9 - Math.sin(a) * 2.4, Math.sin(a) * HUB_RING * 0.8];
    const normal = norm(pos);
    const center = add(pos, scale(normal, 3));
    const [u, v] = frame(normal);
    const step = spiralStep(count);
    // Sunflower spiral: node i at radius ∝ √i. Input is ordered by importance, so mains land inside.
    const nodes = hub.nodes.map((_, k): V3 => {
      const r = step * Math.sqrt(k + 0.7);
      const t = k * GOLDEN;
      const depth = Math.sin(k * 1.7) * 0.7 - r * 0.12; // a shallow bowl, rippled
      return add(add(add(center, scale(u, Math.cos(t) * r)), scale(v, Math.sin(t) * r)), scale(normal, depth));
    });
    hubs[hub.id] = {
      id: hub.id, pos, normal, center, nodes, plexus: nearest(nodes, 2),
      satellites: fibonacciSphere(Math.min(count, 9), 0.95, pos),
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

/* ---------- camera ---------- */

export const OVERVIEW: CameraView = { pos: [0, 8.5, 20], target: [0, 0, 0] };

// Views are framed for a landscape screen; narrower ones (phones) back the camera off along the
// same line so the width still fits. Single-node close-ups are left alone.
const FRAMED_ASPECT = 1.35;
// How far a screen of this shape has to pull back; fog and zoom limits scale with it too.
export const reach = (aspect: number) => Math.min(Math.max(FRAMED_ASPECT / aspect, 1), 2.6);

export function cameraFor(layout: WorldLayout, hubId: HubId | null, nodeIndex: number | null, aspect = FRAMED_ASPECT): CameraView {
  const view = frameView(layout, hubId, nodeIndex);
  if (nodeIndex != null || aspect >= FRAMED_ASPECT) return view;
  const k = reach(aspect);
  const off: V3 = [view.pos[0] - view.target[0], view.pos[1] - view.target[1], view.pos[2] - view.target[2]];
  return { pos: add(view.target, scale(off, k)), target: view.target };
}

function frameView(layout: WorldLayout, hubId: HubId | null, nodeIndex: number | null): CameraView {
  if (!hubId) return OVERVIEW;
  const hub = layout.hubs[hubId];
  if (!hub) return OVERVIEW;
  const [, v] = frame(hub.normal);
  if (nodeIndex != null && hub.nodes[nodeIndex]) {
    // Close on one node, nudged so the info panel on the right doesn't cover it.
    const p = hub.nodes[nodeIndex];
    // Details nodes wrap the core, so each is approached from its own outward side.
    const n = hubId === "details" ? norm(p) : hub.normal;
    const [u, w] = frame(n);
    return { pos: add(add(p, scale(n, 8.5)), scale(w, 1)), target: add(p, scale(u, 1.6)) };
  }
  // Back off far enough to fit the whole spiral (or the details shell) in view.
  const extent = hubId === "details" ? 3.6 : spiralStep(hub.nodes.length) * Math.sqrt(hub.nodes.length + 0.7);
  const d = Math.max(7, extent * 2.3 + 3);
  return { pos: add(add(hub.center, scale(hub.normal, d)), scale(v, d * 0.18)), target: hub.center };
}
