"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef, type CSSProperties } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Billboard, CameraControls } from "@react-three/drei";
import {
  AdditiveBlending, CanvasTexture, Color, EdgesGeometry, Fog, IcosahedronGeometry, Matrix4, SRGBColorSpace, TextureLoader, Vector3,
  type Camera, type Group, type Object3D, type Texture,
} from "three";
import { hubSize, type Hub, type HubId, type TitleGraph, type WebNode } from "@/lib/title-graph";
import {
  CORE_RADIUS, HUB_END, OVERVIEW, PHONE_WIDTH, cameraFor, jointEnd, cameraForPerson, layoutWorld, personLayout, reach,
  type GroupLabel, type HubLayout, type V3, type Viewport, type WorldLayout,
} from "@/lib/title-graph-layout";
import type { ListMark } from "@/lib/types";
import Bloom from "./bloom";
import { DiscBatch, HaloBatch, PortraitAtlas, type DiscLook } from "./disc-batch";
import { FatLines, type LineLook } from "./fat-lines";
import { STATUS_TONE, markFraction, markGlyphs } from "./list-marks";
import { coreColor, type SceneTheme } from "./scene-theme";
import { useWorldHover, useWorldInsets } from "./world-store";

// The 3D half of the title world. Everything is laid out once (lib/title-graph-layout.ts); this
// file draws it, animates clusters opening and closing, moves the camera, and keeps one DOM layer
// of labels pinned to the 3D nodes (so labels use the theme's real fonts).

// person: the staff id whose web of other works is open (from the focused cast or staff node);
// work: the node selected inside that web.
export type Focus = { hub: HubId | null; node: string | null; person: number | null; work: string | null };
// The open person web; works is null while it loads.
export type PersonView = { id: number; works: WebNode[] | null };
type Marks = Record<number, ListMark> | null;

type Props = {
  graph: TitleGraph;
  theme: SceneTheme;
  focus: Focus;
  person: PersonView | null;
  marks: Marks; // the signed-in user's list, by AniList id; null when signed out
  reducedMotion: boolean;
  onFocus: (hub: HubId | null, node?: string | null, person?: number | null, work?: string | null) => void;
  onBack: () => void;
};

const markOf = (node: WebNode, marks: Marks) => (node.detail.type === "title" ? marks?.[node.detail.anilistId] : undefined);

const OPEN_SECONDS = 0.9;
const NODE_RADIUS = 0.36;
const ease = (t: number) => 1 - Math.pow(1 - Math.min(Math.max(t, 0), 1), 3);
const v3 = (p: V3) => new Vector3(p[0], p[1], p[2]);
const approach = (from: number, to: number, dt: number, rate = 8) => from + (to - from) * Math.min(1, dt * rate);
// A pointer that moved more than this between down and up was a drag (orbit), not a click.
const wasDrag = (e: ThreeEvent<MouseEvent>) => e.delta > 5;

/* ---------- labels: 3D anchors, one DOM layer ---------- */

// Scene objects register an anchor (a point in 3D plus a target opacity); the label layer projects
// every anchor to the screen once per frame. Mutable on purpose: this runs at 60fps.
type Anchor = { obj: Object3D; opacity: number };
const anchors = new Map<string, Anchor>();
const labelSync: { camera: Camera | null; flush: (() => void) | null } = { camera: null, flush: null };

// A stable ref callback that registers the anchor for as long as the object is mounted.
function useLabelAnchor(id: string) {
  return useCallback((obj: Object3D | null) => {
    if (!obj) return;
    anchors.set(id, { obj, opacity: 0 });
    return () => { if (anchors.get(id)?.obj === obj) anchors.delete(id); };
  }, [id]);
}
const labelOpacity = (id: string) => anchors.get(id)?.opacity ?? 0;
const setLabelOpacity = (id: string, o: number) => { const a = anchors.get(id); if (a) a.opacity = o; };

// Runs last in the frame, after every node has moved.
function LabelFlush() {
  const camera = useThree((s) => s.camera);
  useEffect(() => { labelSync.camera = camera; }, [camera]);
  useFrame(() => labelSync.flush?.());
  return null;
}

// mark: the "in your list" glyphs (✓ ★4.5), a second line under a title node's name.
type Label = { id: string; text: string; sub?: string; mark?: string; kind: "core" | "hub" | "node" | "fact" | "group"; tone?: string };

function LabelLayer({ graph, layout, works, marks }: { graph: TitleGraph; layout: WorldLayout; works: WebNode[] | null; marks: Marks }) {
  const layer = useRef<HTMLDivElement>(null);
  const els = useRef(new Map<string, HTMLDivElement>());
  const hovered = useWorldHover((s) => s.hovered);
  const labels = useMemo<Label[]>(() => {
    const node = (n: WebNode): Label => {
      const m = markOf(n, marks);
      return { id: n.id, text: n.label, kind: n.image ? "node" : "fact", mark: m && markGlyphs(m), tone: m && STATUS_TONE[m.status] };
    };
    return [
      { id: "core", text: graph.title, kind: "core" },
      ...graph.hubs.filter((h) => h.id !== "details").map((h): Label => ({ id: `hub:${h.id}`, text: h.label, sub: `${h.kanji} · ${hubSize(h)}`, kind: "hub", tone: h.tone })),
      ...graph.hubs.flatMap((h) => h.nodes.map(node)),
      ...(works ?? []).map(node),
      ...graph.hubs.flatMap((h) => layout.hubs[h.id].groups.map((g): Label => ({ id: `group:${g.id}`, text: g.label, kind: "group", tone: g.tone }))),
    ];
  }, [graph, layout, works, marks]);

  // Static importance per label, for the declutter pass; sizes are measured again when they change.
  const ranks = useRef(new Map<string, number>());
  const sizes = useRef(new Map<string, number[]>());
  useEffect(() => {
    const weights = new Map([...graph.hubs.flatMap((h) => h.nodes), ...(works ?? [])].map((n) => [n.id, n.weight] as const));
    ranks.current = new Map(labels.map((l) => [l.id, l.kind === "core" ? 9 : l.kind === "hub" ? 8 : l.kind === "group" ? 7 : (weights.get(l.id) ?? 0) * 5]));
    sizes.current.clear();
  }, [graph, labels, works]);

  useEffect(() => {
    const p = new Vector3();
    // Placed labels this frame, as [left, top, right, bottom], and who was shown last frame.
    const placed: number[][] = [];
    const shown = new Set<string>();
    type Candidate = { id: string; el: HTMLDivElement; x: number; y: number; o: number; rank: number };
    const candidates: Candidate[] = [];
    labelSync.flush = () => {
      const cam = labelSync.camera;
      const box = layer.current;
      if (!cam || !box) return;
      const w = box.clientWidth, h = box.clientHeight;
      const hot = useWorldHover.getState().hovered;
      candidates.length = 0;
      for (const [id, el] of els.current) {
        const a = anchors.get(id);
        let show = !!a && a.opacity > 0.02;
        if (show) {
          a!.obj.updateWorldMatrix(true, false);
          p.setFromMatrixPosition(a!.obj.matrixWorld).project(cam);
          show = p.z < 1 && Math.abs(p.x) < 1.1 && Math.abs(p.y) < 1.1;
        }
        if (!show) { hide(id, el); continue; }
        // Hover first, then whatever is most opaque and most important; a label already up keeps
        // its place against an equal newcomer, so they don't flicker as the camera drifts.
        const rank = (id === hot ? 100 : 0) + a!.opacity * 10 + (ranks.current.get(id) ?? 0) + (shown.has(id) ? 0.5 : 0);
        candidates.push({ id, el, x: ((p.x + 1) / 2) * w, y: ((1 - p.y) / 2) * h, o: a!.opacity, rank });
      }
      // Greedy declutter: a label that would overlap one already placed waits until there's room.
      candidates.sort((a, b) => b.rank - a.rank);
      placed.length = 0;
      for (const c of candidates) {
        let size = sizes.current.get(c.id);
        if (!size) { size = [c.el.offsetWidth, c.el.offsetHeight]; if (size[0]) sizes.current.set(c.id, size); }
        const r = [c.x - size[0] / 2 - 4, c.y - size[1] / 2 - 2, c.x + size[0] / 2 + 4, c.y + size[1] / 2 + 2];
        if (placed.some((q) => r[0] < q[2] && r[2] > q[0] && r[1] < q[3] && r[3] > q[1])) { hide(c.id, c.el); continue; }
        placed.push(r);
        shown.add(c.id);
        c.el.style.visibility = "";
        c.el.style.opacity = c.o.toFixed(2);
        c.el.style.transform = `translate3d(${c.x}px,${c.y}px,0) translate(-50%,-50%)`;
      }
    };
    const hide = (id: string, el: HTMLDivElement) => {
      shown.delete(id);
      if (el.style.visibility !== "hidden") el.style.visibility = "hidden";
    };
    // Label sizes are measured once; web fonts arriving late change them.
    const measured = sizes.current;
    void document.fonts?.ready.then(() => measured.clear());
    return () => { labelSync.flush = null; };
  }, []);

  return (
    <div className="ow-labels" ref={layer} aria-hidden="true">
      {labels.map((l) => (
        <div key={l.id} ref={(el) => { if (el) els.current.set(l.id, el); else els.current.delete(l.id); }}
          className={`ow-label ow-label-${l.kind}${l.mark ? " has-mark" : ""}${hovered === l.id ? " is-hot" : ""}`}
          style={{ visibility: "hidden", ...(l.tone ? { "--c": `var(--${l.tone})` } : {}) } as CSSProperties}>
          {l.kind === "hub" ? <><span>{l.text}</span><small>{l.sub}</small></>
            : l.mark ? <><span className="ow-label-text">{l.text}</span><small className="ow-label-mark">{l.mark}</small></> : l.text}
        </div>
      ))}
    </div>
  );
}

/* ---------- textures ---------- */

let haloTexture: Texture | null = null;
// A soft radial glow, drawn once; also the round sprite for point clouds.
function halo() {
  if (haloTexture) return haloTexture;
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.25, "rgba(255,255,255,.45)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  haloTexture = new CanvasTexture(c);
  return haloTexture;
}

const textures = new Map<string, Promise<Texture>>();
const loader = new TextureLoader().setCrossOrigin("anonymous");

// Portraits are cropped like `object-fit: cover` onto the round disc, top-aligned so faces stay in.
function fitCover(t: Texture) {
  t.colorSpace = SRGBColorSpace;
  const img = t.image as HTMLImageElement;
  const aspect = img.width / img.height;
  if (aspect < 1) { t.repeat.set(1, aspect); t.offset.set(0, 1 - aspect); }
  else { t.repeat.set(1 / aspect, 1); t.offset.set((1 - 1 / aspect) / 2, 0); }
  return t;
}

// WebGL needs CORS images. If the page already showed this image as a plain <img> (the list view,
// the Index), the browser's image cache holds a copy without CORS headers and refuses it here; a
// one-off query string makes it a fresh request. AniList's CDN ignores the parameter.
function loadTexture(url: string) {
  let hit = textures.get(url);
  if (!hit) {
    hit = loader.loadAsync(url)
      .catch(() => loader.loadAsync(`${url}${url.includes("?") ? "&" : "?"}ov-cors=1`))
      .then(fitCover);
    hit.catch(() => textures.delete(url));
    textures.set(url, hit);
  }
  return hit;
}

function useTexture(url: string | null) {
  const [tex, setTex] = useState<Texture | null>(null);
  useEffect(() => {
    if (!url) return;
    let live = true;
    loadTexture(url).then((t) => { if (live) setTex(t); }, () => {});
    return () => { live = false; };
  }, [url]);
  return url ? tex : null;
}

// A round, image-filled disc. The material is keyed on the texture: three.js compiles a material
// without a map differently, so adding one later needs a fresh material, not a prop change.
function Portrait({ radius, tex, fallback, opacity, events }: {
  radius: number; tex: Texture | null; fallback: Color; opacity: number; events?: Partial<NodeEvents>;
}) {
  return (
    <mesh {...events}>
      <circleGeometry args={[radius, 48]} />
      <meshBasicMaterial key={tex ? tex.uuid : "none"} map={tex} color={tex ? "#fff" : fallback} transparent opacity={opacity} />
    </mesh>
  );
}

/* ---------- shared bits ---------- */

type NodeEvents = {
  onClick: (e: ThreeEvent<MouseEvent>) => void;
  onPointerOver: (e: ThreeEvent<PointerEvent>) => void;
  onPointerOut: () => void;
};

function useNodeEvents(id: string, onPick: () => void): NodeEvents {
  const setHovered = useWorldHover((s) => s.setHovered);
  return {
    onClick: (e) => { if (wasDrag(e)) return; e.stopPropagation(); onPick(); },
    onPointerOver: (e) => { e.stopPropagation(); setHovered(id); document.body.style.cursor = "pointer"; },
    onPointerOut: () => { setHovered(null); document.body.style.cursor = ""; },
  };
}

function Halo({ color, size, opacity, theme }: { color: Color; size: number; opacity: number; theme: SceneTheme }) {
  if (!theme.style.glow || !theme.fx) return null;
  return (
    <mesh>
      <planeGeometry args={[size, size]} />
      <meshBasicMaterial map={halo()} color={color} transparent opacity={opacity} blending={AdditiveBlending} depthWrite={false} fog={false} />
    </mesh>
  );
}

// Fat line segments as a scene object, rebuilt when their look changes and sized to the canvas.
function useFatLines(segments: number, look: LineLook, positions?: ArrayLike<number>) {
  const { color, opacity, width, additive } = look;
  const lines = useMemo(() => new FatLines(segments, { color, opacity, width, additive }, positions),
    [segments, color, opacity, width, additive, positions]);
  useEffect(() => () => lines.dispose(), [lines]);
  const size = useThree((s) => s.size);
  useEffect(() => { lines.resize(size.width, size.height); }, [lines, size]);
  return lines;
}

const lineLook = (theme: SceneTheme, color: Color, opacity = theme.style.lineOpacity): LineLook =>
  ({ color, opacity, width: theme.style.lineWidth, additive: theme.style.glow });

// The ink outline the paper themes draw around every disc; glowing themes use halos instead.
function Rim({ inner, theme, opacity }: { inner: number; theme: SceneTheme; opacity: number }) {
  if (theme.style.glow) return null;
  const w = Math.max(0.035, inner * 0.09) * (theme.style.lineWidth / 1.6);
  return (
    <mesh>
      <ringGeometry args={[inner, inner + w, 48]} />
      <meshBasicMaterial color={theme.ink} transparent opacity={opacity} />
    </mesh>
  );
}

/* ---------- "in your list" rings ---------- */

const TAU = Math.PI * 2;
const DASHES = 14;

// Around a disc whose title is in the user's list: a faint full track, and over it an arc in the
// status's tone from twelve o'clock clockwise — whole when completed, progress while watching,
// none when only planned. `unstarted` (franchise entries not in the list) draws a dashed track.
function MarkRing({ inner, mark, unstarted, theme, opacity }: {
  inner: number; mark?: ListMark; unstarted?: boolean; theme: SceneTheme; opacity: number;
}) {
  if (!mark && !unstarted) return null;
  const r0 = inner + Math.max(0.04, inner * 0.1);
  const w = Math.max(0.05, inner * 0.13) * (theme.style.glow ? 1 : Math.min(1.4, theme.style.lineWidth / 1.4));
  if (!mark) {
    const arc = TAU / DASHES;
    return (
      <>
        {Array.from({ length: DASHES }, (_, k) => (
          <mesh key={k}>
            <ringGeometry args={[r0, r0 + Math.min(w * 0.45, 0.045), 6, 1, k * arc, arc * 0.45]} />
            <meshBasicMaterial color={theme.dim} transparent opacity={0.5 * opacity} />
          </mesh>
        ))}
      </>
    );
  }
  const color = theme.tones[STATUS_TONE[mark.status]];
  const f = markFraction(mark);
  return (
    <>
      <mesh>
        <ringGeometry args={[r0, r0 + w, 64]} />
        <meshBasicMaterial color={color} transparent opacity={(f >= 1 ? 0 : 0.28) * opacity} />
      </mesh>
      {f > 0 && (
        <mesh>
          <ringGeometry args={[r0, r0 + w, 64, 1, Math.PI / 2 - TAU * f, TAU * f]} />
          <meshBasicMaterial color={color} transparent opacity={opacity} />
        </mesh>
      )}
    </>
  );
}

/* ---------- the core: the show itself ---------- */

function Core({ graph, theme, focus, onPick }: { graph: TitleGraph; theme: SceneTheme; focus: Focus; onPick: () => void }) {
  const shell = useRef<Group>(null);
  const tex = useTexture(graph.cover);
  const color = useMemo(() => coreColor(theme, graph.color), [theme, graph.color]);
  const shellPositions = useMemo(() => new EdgesGeometry(new IcosahedronGeometry(CORE_RADIUS * 1.45, 1)).getAttribute("position").array, []);
  const vertices = useMemo(() => new IcosahedronGeometry(CORE_RADIUS * 1.45, 1), []);
  const hovered = useWorldHover((s) => s.hovered === "core");
  const events = useNodeEvents("core", onPick);
  const labelRef = useLabelAnchor("core");
  // While another hub is open the core sits right behind its web: fade it back.
  const recede = focus.hub != null && focus.hub !== "details";
  const o = recede ? 0.18 : 1;
  const shellLines = useFatLines(shellPositions.length / 6, lineLook(theme, color, (theme.style.glow ? 0.55 : 0.85) * o), shellPositions);

  useFrame((_, dt) => {
    setLabelOpacity("core", approach(labelOpacity("core"), focus.hub ? 0 : 1, dt));
    if (shell.current) {
      shell.current.rotation.y += dt * 0.12;
      shell.current.rotation.x += dt * 0.04;
      shell.current.scale.setScalar(approach(shell.current.scale.x, hovered ? 1.08 : 1, dt, 10));
    }
  });

  return (
    <group>
      <group ref={shell}>
        <primitive object={shellLines.object} />
        <points geometry={vertices}>
          <pointsMaterial map={halo()} color={color} size={0.22} sizeAttenuation transparent opacity={o} depthWrite={false} />
        </points>
      </group>
      <Billboard>
        <Halo color={color} size={CORE_RADIUS * 6} opacity={focus.hub === "details" ? 0.25 : 0.45 * o} theme={theme} />
        <mesh>
          <ringGeometry args={[CORE_RADIUS * 0.9, CORE_RADIUS, 64]} />
          <meshBasicMaterial color={color} transparent opacity={o} />
        </mesh>
        <Rim inner={CORE_RADIUS} theme={theme} opacity={o} />
        <Portrait radius={CORE_RADIUS * 0.9} tex={tex} fallback={color} opacity={o} events={recede ? undefined : events} />
        <object3D ref={labelRef} position={[0, -CORE_RADIUS * 1.6, 0]} />
      </Billboard>
    </group>
  );
}

/* ---------- hubs on the ring ---------- */

function HubNode({ hub, at, theme, focus, onPick }: { hub: Hub; at: WorldLayout["hubs"][HubId]; theme: SceneTheme; focus: Focus; onPick: () => void }) {
  const group = useRef<Group>(null);
  const color = theme.tones[hub.tone];
  const hovered = useWorldHover((s) => s.hovered === `hub:${hub.id}`);
  const events = useNodeEvents(`hub:${hub.id}`, onPick);
  const labelId = `hub:${hub.id}`;
  const labelRef = useLabelAnchor(labelId);
  const open = focus.hub === hub.id;
  // Other hubs fall back while one is open, so the open web reads first.
  const dimmed = focus.hub != null && !open;
  const satellites = useMemo(
    () => new Float32Array(at.satellites.flatMap((p) => [p[0] - at.pos[0], p[1] - at.pos[1], p[2] - at.pos[2]])), [at]);

  useFrame((_, dt) => {
    if (group.current) group.current.scale.setScalar(approach(group.current.scale.x, hovered ? 1.25 : 1, dt, 10));
    // Labels only on the overview; inside a web they'd be noise behind it.
    setLabelOpacity(labelId, approach(labelOpacity(labelId), focus.hub ? 0 : 1, dt));
  });

  return (
    <group position={at.pos}>
      <group ref={group}>
        <Billboard>
          <Halo color={color} size={2.4} opacity={dimmed ? 0.08 : 0.5} theme={theme} />
        </Billboard>
        <Billboard>
          <Rim inner={0.42} theme={theme} opacity={dimmed ? 0.2 : 1} />
        </Billboard>
        <mesh {...(dimmed ? {} : events)}>
          <sphereGeometry args={[0.42, 32, 16]} />
          <meshBasicMaterial color={color} transparent opacity={dimmed ? 0.2 : 1} />
        </mesh>
      </group>
      {/* Satellites hint at what's inside; they hand over to the real web when it opens. */}
      {!open && satellites.length > 0 && (
        <points>
          <bufferGeometry>
            <bufferAttribute attach="attributes-position" args={[satellites, 3]} />
          </bufferGeometry>
          <pointsMaterial map={halo()} color={color} size={0.3} sizeAttenuation transparent opacity={dimmed ? 0.15 : 0.9} depthWrite={false} />
        </points>
      )}
      <object3D ref={labelRef} position={[0, -0.95, 0]} />
    </group>
  );
}

// Core → hub spokes and each hub's satellite web: drawn once, never animated.
function StaticEdges({ graph, layout, theme, focus }: { graph: TitleGraph; layout: WorldLayout; theme: SceneTheme; focus: Focus }) {
  const positions = useMemo(() => {
    const pts: number[] = [];
    for (const hub of graph.hubs) {
      if (hub.id === "details") continue;
      const at = layout.hubs[hub.id];
      pts.push(0, 0, 0, ...at.pos);
      at.satellites.forEach((s) => pts.push(...at.pos, ...s));
      at.satellites.forEach((s, i) => { const n = at.satellites[(i + 1) % at.satellites.length]; pts.push(...s, ...n); });
    }
    return new Float32Array(pts);
  }, [graph, layout]);
  const lines = useFatLines(positions.length / 6, lineLook(theme, theme.dim, theme.style.lineOpacity * (focus.hub ? 0.3 : 1)), positions);
  return <primitive object={lines.object} />;
}

function Dust({ layout, theme }: { layout: WorldLayout; theme: SceneTheme }) {
  const ref = useRef<Group>(null);
  useFrame((_, dt) => { if (ref.current) ref.current.rotation.y += dt * 0.004; });
  return (
    <group ref={ref}>
      <points>
        <bufferGeometry>
          <bufferAttribute attach="attributes-position" args={[layout.dust, 3]} />
        </bufferGeometry>
        {/* Fixed pixel size: attenuated dots balloon into blobs when the camera passes close. */}
        <pointsMaterial map={halo()} color={theme.faint} size={3} sizeAttenuation={false} transparent
          opacity={theme.style.dustOpacity} depthWrite={false} fog={false} />
      </points>
    </group>
  );
}

/* ---------- an open hub: its web of nodes ---------- */

// How one node's disc looks right now (see DiscBatch). receded: another web (a person's) has
// the stage in front of this one; only the selected node stays lit. Unstarted franchise entries
// sit back a little, so what you've seen reads as the lit path.
function discLook(node: WebNode, theme: SceneTheme, selected: boolean, someoneSelected: boolean, receded: boolean,
  mark: ListMark | undefined, unstarted: boolean): DiscLook {
  // Anchors (the characters a cast web hangs from) are small: they're the hooks, not the subject.
  const radius = node.anchor ? 0.24 : NODE_RADIUS * (node.image ? 0.8 + node.weight * 0.6 : 0.3 + node.weight * 0.25);
  const ring = node.image ? radius * (selected ? 1.22 : 1.13) : radius;
  const fade = (selected ? 1 : receded ? 0.12 : someoneSelected ? 0.45 : 1) * (unstarted && !selected ? 0.6 : 1);
  const rim = theme.style.glow ? 0 : Math.max(0.035, ring * 0.09) * (theme.style.lineWidth / 1.6);
  const markR0 = ring + Math.max(0.04, ring * 0.1);
  const markW = Math.max(0.05, ring * 0.13) * (theme.style.glow ? 1 : Math.min(1.4, theme.style.lineWidth / 1.4));
  const f = mark ? markFraction(mark) : 0;
  return {
    radius, ring, rim, markR0, markW, markFraction: f, markTrack: f >= 1 ? 0 : 0.28, markMode: mark ? 1 : unstarted ? 2 : 0,
    fill: node.image ? theme.faint : theme.tones[node.tone], tone: theme.tones[node.tone],
    markColor: mark ? theme.tones[STATUS_TONE[mark.status]] : theme.dim,
    fade, markFade: unstarted ? Math.min(1, fade / 0.6) : fade,
    half: Math.max(mark || unstarted ? markR0 + markW : 0, ring + rim) + 0.03,
  };
}

// A node's place in the web, minus the drawing (that's the cluster's DiscBatch): the group the
// open/close animation moves, and the anchor its DOM label hangs from.
function NodeLabel({ node, always, near, register, selected, someoneSelected, receded, labelY }: {
  node: WebNode; always: boolean; near: number; register: (g: Group | null) => void;
  selected: boolean; someoneSelected: boolean; receded: boolean; labelY: number;
}) {
  const hovered = useWorldHover((s) => s.hovered === node.id);
  const labelRef = useLabelAnchor(node.id);
  const outer = useRef<Group | null>(null);
  const camera = useThree((s) => s.camera);
  const world = useMemo(() => new Vector3(), []);

  useFrame(() => {
    if (!outer.current) return;
    // Labels: key nodes from afar, the rest once you lean in past the hub's framed distance.
    // Hover and selection always win; nodes still flying out stay quiet.
    outer.current.getWorldPosition(world);
    const d = world.distanceTo(camera.position);
    const seen = Math.min(1, Math.max(0, always ? (75 - d) / 15 : (near - d) / (near * 0.15)));
    const spawn = Math.min(1, Math.max(0, (outer.current.scale.x - 0.6) / 0.4));
    const quiet = receded && !selected ? 0 : someoneSelected ? 0.35 : 1;
    setLabelOpacity(node.id, (selected || (hovered && !receded) ? 1 : seen * quiet) * spawn);
  });

  return (
    <group ref={(g) => { outer.current = g; register(g); }}>
      <Billboard>
        <object3D ref={labelRef} position={[0, labelY, 0]} />
      </Billboard>
    </group>
  );
}

// A sub-cluster's caption, and for some (this show on the franchise path) a small ring marker.
function GroupMark({ group, theme, cover, mark, unstarted, register }: {
  group: GroupLabel; theme: SceneTheme; cover: string | null; mark?: ListMark; unstarted: boolean; register: (g: Group | null) => void;
}) {
  const labelRef = useLabelAnchor(`group:${group.id}`);
  const tex = useTexture(group.marker ? cover : null);
  return (
    <group ref={register}>
      <object3D ref={labelRef} />
      {group.marker && (
        <Billboard position={[0, mark || unstarted ? 0.88 : 0.75, 0]}>
          <mesh>
            <ringGeometry args={[0.34, 0.42, 40]} />
            <meshBasicMaterial color={theme.tones[group.tone]} transparent opacity={0.95} />
          </mesh>
          <Portrait radius={0.34} tex={tex} fallback={theme.tones[group.tone]} opacity={1} />
          <Rim inner={0.42} theme={theme} opacity={1} />
          <MarkRing inner={0.42} mark={mark} unstarted={unstarted} theme={theme} opacity={1} />
        </Billboard>
      )}
    </group>
  );
}

// A web of nodes opening out of its hub: one of the title's hubs, or a person's web of works
// (`person`, laid out by personLayout with the person's node as its hub). `selectedId` is the
// node that has the stage; `receded` steps the whole web back behind a person web opened from it.
function Cluster({ hub, at, person = false, cover, layout, theme, active, selectedId, receded = false, marks, franchiseMark, reducedMotion, onPick, onGone }: {
  hub: Hub; at: HubLayout; person?: boolean; cover: string | null; layout: WorldLayout; theme: SceneTheme; active: boolean;
  selectedId: string | null; receded?: boolean; marks: Marks; franchiseMark?: ListMark; reducedMotion: boolean;
  onPick: (node: WebNode) => void; onGone: () => void;
}) {
  const groups = useRef<(Group | null)[]>([]);
  const captions = useRef<(Group | null)[]>([]);
  const progress = useRef(reducedMotion ? 1 : 0);
  const settled = useRef(false);
  const lastHot = useRef<string | null | undefined>(undefined);
  const from = useMemo(() => v3(at.pos), [at]);
  const targets = useMemo(() => at.nodes.map(v3), [at]);
  const live = useMemo(() => at.nodes.map(() => new Vector3()), [at]);
  const jointTargets = useMemo(() => at.joints.map(v3), [at]);
  const jointLive = useMemo(() => at.joints.map(() => new Vector3()), [at]);
  const groupTargets = useMemo(() => at.groups.map((g) => v3(g.at)), [at]);
  // Which edges touch each node, for lighting up a hovered or selected node's links.
  const touching = useMemo(() => {
    const m = new Map<number, number[]>();
    at.edges.forEach(([a, b], e) => { for (const x of [a, b]) if (x >= 0) m.set(x, [...(m.get(x) ?? []), e]); });
    return m;
  }, [at]);
  const indexOfId = useMemo(() => new Map(hub.nodes.map((n, i) => [n.id, i])), [hub]);
  const setHovered = useWorldHover((s) => s.setHovered);
  const tone = theme.tones[hub.tone];
  const lines = useFatLines(at.edges.length, lineLook(theme, tone, 0));
  const hotLines = useFatLines(at.edges.length, { ...lineLook(theme, tone, 0), width: theme.style.lineWidth * 1.8 });
  // Light travelling along links: out from a person to their works, and along the stretch of the
  // franchise you've completed (or are watching). The hovered or selected node's links pulse too
  // (hotLines). Off under reduced motion.
  const pulseLines = useFatLines(at.edges.length, { ...lineLook(theme, tone, 0), width: theme.style.lineWidth * 1.6 });
  const pulseEdges = useMemo(() => {
    if (person) return at.edges;
    if (hub.id !== "franchise" || !marks) return [];
    const seen = (x: number) => {
      const m = x >= 0 ? markOf(hub.nodes[x], marks) : x === jointEnd(0) ? franchiseMark : undefined;
      return m?.status === "completed" || m?.status === "watching";
    };
    return at.edges.filter(([a, b]) => seen(a) && seen(b));
  }, [person, at, hub, marks, franchiseMark]);
  const pulseFlash = useMemo(() => (theme.style.glow ? new Color("#ffffff") : theme.ink), [theme]);
  const pulseStrength = reducedMotion ? 0 : theme.style.pulse;
  const lastPulse = useRef<typeof pulseEdges | null>(null);
  const vp = useViewport();
  // Labels beyond the key nodes appear once the camera is a fifth closer than this web's framing.
  const near = useMemo(() => {
    const v = person ? cameraForPerson(at, null, vp) : cameraFor(layout, hub.id, null, vp);
    return Math.hypot(v.pos[0] - v.target[0], v.pos[1] - v.target[1], v.pos[2] - v.target[2]) * 0.8;
  }, [layout, at, person, hub.id, vp]);
  const n = hub.nodes.length;
  // Signed in, the franchise web also shows what you haven't started.
  const showProgress = !person && hub.id === "franchise" && marks != null;
  const end = (x: number) => (x >= 0 ? live[x] : x === HUB_END ? from : jointLive[-2 - x]);

  // All discs in one draw call (plus one for the glowing themes' halos), portraits from one atlas.
  const [phone] = useState(() => window.innerWidth <= PHONE_WIDTH);
  const cells = useMemo(() => { let c = 0; return hub.nodes.map((nd) => (nd.image ? c++ : -1)); }, [hub]);
  const atlas = useMemo(() => new PortraitAtlas(Math.max(...cells, 0) + 1, phone), [cells, phone]);
  const rects = useMemo(() => cells.map((c) => (c >= 0 ? atlas.rect(c) : null)), [cells, atlas]);
  const batch = useMemo(() => new DiscBatch(n, atlas.texture), [n, atlas]);
  const halos = useMemo(() => new HaloBatch(n, halo()), [n]);
  useEffect(() => () => { atlas.dispose(); batch.dispose(); }, [atlas, batch]);
  useEffect(() => () => halos.dispose(), [halos]);
  useEffect(() => { batch.setColors(theme.ink, theme.dim); }, [batch, theme]);
  // Portraits stream into the atlas as they load; a disc shows its flat fill until then.
  const loaded = useRef<boolean[]>([]);
  useEffect(() => {
    let alive = true;
    loaded.current = hub.nodes.map(() => false);
    hub.nodes.forEach((nd, i) => {
      if (!nd.image) return;
      loadTexture(nd.image).then((t) => {
        if (!alive) return;
        atlas.draw(cells[i], t.image as HTMLImageElement, performance.now() / 1000);
        loaded.current[i] = true;
      }, () => {});
    });
    return () => { alive = false; };
  }, [hub, atlas, cells]);
  const looks = useMemo(() => hub.nodes.map((node) => {
    const mark = markOf(node, marks);
    return discLook(node, theme, selectedId === node.id, selectedId != null, receded, mark, showProgress && !mark);
  }), [hub, theme, selectedId, receded, marks, showProgress]);
  // Draw order, farthest first: the discs are transparent at their edges. Instance slot k draws
  // node order[k]; picking maps back through it.
  const order = useRef<number[]>([]);
  const pop = useRef<number[]>([]);
  const depth = useRef<number[]>([]);
  const scratch = useMemo(() => ({ m: new Matrix4(), s: new Vector3(), fwd: new Vector3(), c: new Color() }), []);
  // Only lit nodes take the pointer: a receded web lets clicks fall through to empty space.
  useEffect(() => {
    batch.setFilter((slot) => !receded || hub.nodes[order.current[slot]]?.id === selectedId);
  }, [batch, receded, selectedId, hub]);

  useFrame((state, dt) => {
    const goal = active ? 1 : 0;
    const animating = !(progress.current === goal && settled.current);
    if (animating) {
      progress.current = reducedMotion ? goal : Math.min(1, Math.max(0, progress.current + (active ? dt : -dt * 1.6) / OPEN_SECONDS));
      const t = progress.current;
      // Nodes leave the hub in order of importance, each slightly after the last.
      for (let i = 0; i < n; i++) {
        const local = ease(t * 1.35 - (i / Math.max(n, 1)) * 0.35);
        live[i].lerpVectors(from, targets[i], local);
        const g = groups.current[i];
        if (g) { g.position.copy(live[i]); g.scale.setScalar(Math.max(local, 0.001)); g.visible = local > 0.01; }
      }
      const tj = ease(t * 1.2);
      jointTargets.forEach((p, j) => jointLive[j].lerpVectors(from, p, tj));
      groupTargets.forEach((p, k) => { const g = captions.current[k]; if (g) { g.position.lerpVectors(from, p, tj); g.scale.setScalar(Math.max(tj, 0.001)); } });
      at.edges.forEach(([a, b], e) => lines.set(e, end(a), end(b)));
      lines.commit(at.edges.length);
      settled.current = progress.current === goal;
      if (!active && progress.current === 0) onGone();
    }
    const t = progress.current;
    lines.fade(theme.style.lineOpacity * t * (receded ? 0.25 : 1));
    if (animating || lastPulse.current !== pulseEdges) {
      lastPulse.current = pulseEdges;
      pulseEdges.forEach(([a, b], k) => pulseLines.set(k, end(a), end(b)));
      pulseLines.commit(pulseEdges.length);
    }
    const now = state.clock.elapsedTime;
    pulseLines.fade(Math.min(1, theme.style.lineOpacity * 2.4) * t * (receded ? 0 : 1));
    pulseLines.pulse(now, pulseStrength, pulseFlash, true);
    hotLines.pulse(now, pulseStrength * 0.8, pulseFlash);
    // Captions fade with the web, and step back while one node has the stage.
    at.groups.forEach((g) => setLabelOpacity(`group:${g.id}`, t * (receded ? 0 : selectedId ? 0.4 : 1)));
    // The hovered (else selected) node's own links, drawn bolder on top.
    const hovered = useWorldHover.getState().hovered;
    const hot = (receded ? null : hovered) ?? selectedId;
    if (animating || hot !== lastHot.current) {
      lastHot.current = hot;
      const i = hot != null ? indexOfId.get(hot) : undefined;
      const es = i != null ? touching.get(i) ?? [] : [];
      // Each link runs out from the hot node, so its pulse does too.
      es.forEach((e, k) => {
        const [a, b] = at.edges[e];
        if (b === i) hotLines.set(k, end(b), end(a)); else hotLines.set(k, end(a), end(b));
      });
      hotLines.commit(es.length);
    }
    hotLines.fade(Math.min(1, theme.style.lineOpacity * 2.6) * t);

    // Discs: billboarded, popped on hover or selection, sorted back to front.
    const cam = state.camera;
    cam.getWorldDirection(scratch.fwd);
    const ord = order.current, d = depth.current, p = pop.current;
    ord.length = n; d.length = n;
    for (let i = 0; i < n; i++) {
      ord[i] = i;
      d[i] = live[i].x * scratch.fwd.x + live[i].y * scratch.fwd.y + live[i].z * scratch.fwd.z;
      const want = hovered === hub.nodes[i].id || selectedId === hub.nodes[i].id ? 1.3 : 1;
      p[i] = approach(p[i] ?? 1, want, dt, 10);
    }
    ord.sort((a, b) => d[b] - d[a]);
    const glow = theme.style.glow && theme.fx;
    const ready = loaded.current;
    for (let k = 0; k < n; k++) {
      const i = ord[k], g = groups.current[i], look = looks[i];
      const s = g && g.visible ? g.scale.x * p[i] : 0;
      batch.mesh.setMatrixAt(k, scratch.m.compose(live[i], cam.quaternion, scratch.s.setScalar(Math.max(s * look.half * 2, 1e-5)))); // the 1×1 quad spans ±look.half
      batch.write(k, look, ready[i] ? rects[i] : null);
      if (glow) {
        halos.set(i, scratch.m.compose(live[i], cam.quaternion, scratch.s.setScalar(Math.max(s * look.radius * 5, 1e-5))),
          scratch.c.copy(look.tone).multiplyScalar((selectedId === hub.nodes[i].id ? 0.6 : 0.3) * look.fade));
      }
    }
    batch.commit();
    batch.mesh.computeBoundingSphere(); // picking tests it first, and the nodes move
    atlas.flush(performance.now() / 1000);
    halos.commit(glow ? n : 0);
  });

  // A changed goal means another round of animation; so do fresh line objects (a theme switch
  // rebuilds them empty), which the next frame refills.
  useEffect(() => {
    settled.current = false;
    lastHot.current = undefined;
    lastPulse.current = null;
  }, [active, lines, hotLines, pulseLines]);

  // Small webs label every node; big ones (a 60-strong cast) only their key nodes until you lean in.
  // The details web always holds back its long tail of tags.
  const crowded = hub.id === "details" || hubSize(hub) > 30;
  return (
    <group>
      <primitive object={lines.object} />
      <primitive object={hotLines.object} />
      <primitive object={pulseLines.object} />
      {at.groups.map((g, k) => (
        <GroupMark key={g.id} group={g} theme={theme} cover={cover} mark={g.marker ? franchiseMark : undefined}
          unstarted={!!g.marker && showProgress && !franchiseMark} register={(o) => { captions.current[k] = o; }} />
      ))}
      <primitive object={halos.mesh} />
      <primitive object={batch.mesh}
        onPointerMove={(e: ThreeEvent<PointerEvent>) => {
          const node = e.instanceId != null ? hub.nodes[order.current[e.instanceId]] : undefined;
          if (!node) return;
          e.stopPropagation();
          if (useWorldHover.getState().hovered !== node.id) setHovered(node.id);
          document.body.style.cursor = "pointer";
        }}
        onPointerOut={() => {
          const h = useWorldHover.getState().hovered;
          if (h != null && indexOfId.has(h)) setHovered(null);
          document.body.style.cursor = "";
        }}
        onClick={(e: ThreeEvent<MouseEvent>) => {
          const node = e.instanceId != null ? hub.nodes[order.current[e.instanceId]] : undefined;
          if (!node || wasDrag(e)) return;
          e.stopPropagation();
          onPick(node);
        }} />
      {hub.nodes.map((node, i) => (
        <NodeLabel key={node.id} node={node} always={!node.anchor && (node.weight >= 0.7 || !crowded)} near={near}
          register={(g) => { groups.current[i] = g; }} selected={selectedId === node.id} someoneSelected={selectedId != null}
          receded={receded} labelY={-looks[i].ring * 1.2 - 0.14 - (looks[i].markMode ? 0.1 : 0)} />
      ))}
    </group>
  );
}

/* ---------- camera ---------- */

// The canvas size plus the overlays' measured reach into it: what cameraFor frames against.
function useViewport(): Viewport {
  const size = useThree((s) => s.size);
  const insets = useWorldInsets((s) => s.insets);
  return useMemo(() => ({ width: size.width, height: size.height, insets: insets ?? undefined }), [size, insets]);
}

function CameraRig({ layout, graph, focus, personAt, works, reducedMotion }: {
  layout: WorldLayout; graph: TitleGraph; focus: Focus; personAt: HubLayout | null; works: WebNode[] | null; reducedMotion: boolean;
}) {
  const controls = useRef<ComponentRef<typeof CameraControls>>(null);
  const idle = useRef(0);
  const size = useViewport();
  const aspect = size.width / Math.max(size.height, 1);
  // Zooming out may go a little past the furthest framed view, whatever the screen.
  const maxView = useMemo(() => Math.max(...graph.hubs.map((h) => {
    const v = cameraFor(layout, h.id, null, size);
    return Math.hypot(v.pos[0] - v.target[0], v.pos[1] - v.target[1], v.pos[2] - v.target[2]);
  })), [graph, layout, size]);

  useEffect(() => {
    const c = controls.current;
    if (!c) return;
    const hub = focus.hub ? graph.hubs.find((h) => h.id === focus.hub) : null;
    const index = hub && focus.node ? hub.nodes.findIndex((n) => n.id === focus.node) : -1;
    // A person web once it's loaded; until then the camera waits on the person's own node.
    const work = personAt && works && focus.work ? works.findIndex((w) => w.id === focus.work) : -1;
    const view = personAt ? cameraForPerson(personAt, work >= 0 ? work : null, size) : cameraFor(layout, focus.hub, index >= 0 ? index : null, size);
    idle.current = 0;
    void c.setLookAt(...view.pos, ...view.target, !reducedMotion);
  }, [focus.hub, focus.node, focus.work, personAt, works, layout, graph, reducedMotion, size]);

  // A slow drift around the orb when nobody is touching it on the overview.
  useFrame(({ scene }, dt) => {
    idle.current += dt;
    const c = controls.current;
    if (!reducedMotion && !focus.hub && idle.current > 4 && c) c.azimuthAngle += dt * 0.05;
    // Fog keeps its depth relative to what's framed: a 60-strong cast seen from far back
    // shouldn't drown in it, and the overview keeps its designed falloff.
    if (c && scene.fog instanceof Fog) {
      const k = reach(aspect);
      scene.fog.near = Math.max(16 * k, c.distance * 0.85);
      scene.fog.far = Math.max(62 * k, c.distance * 2.8);
    }
  });

  return (
    <CameraControls ref={controls} makeDefault smoothTime={0.55} minDistance={2.5} maxDistance={Math.max(45 * reach(aspect), maxView * 1.4)}
      onStart={() => { idle.current = -1e9; }} onEnd={() => { idle.current = 0; }} />
  );
}

/* ---------- scene ---------- */

// A person web as mounted: kept (with its nodes and layout) while it folds back after closing.
type MountedPerson = { key: string; hub: Hub; at: HubLayout; nodeId: string; person: number };

function World({ graph, theme, focus, person, marks, reducedMotion, onFocus, layout, personAt }: Props & { layout: WorldLayout; personAt: HubLayout | null }) {
  // Clusters stay mounted while they fold back up, then leave.
  const [mounted, setMounted] = useState<HubId[]>(focus.hub ? [focus.hub] : []);
  if (focus.hub && !mounted.includes(focus.hub)) setMounted([...mounted, focus.hub]);
  const openPerson = useMemo<MountedPerson | null>(() => {
    const hub = focus.hub ? graph.hubs.find((h) => h.id === focus.hub) : null;
    if (!hub || !person?.works || !personAt || !focus.node) return null;
    return {
      key: `${hub.id}:${person.id}`, at: personAt, nodeId: focus.node, person: person.id,
      hub: { id: hub.id, label: hub.label, kanji: hub.kanji, tone: hub.tone, nodes: person.works },
    };
  }, [focus.hub, focus.node, graph, person, personAt]);
  const [people, setPeople] = useState<MountedPerson[]>(openPerson ? [openPerson] : []);
  if (openPerson && !people.some((p) => p.key === openPerson.key)) setPeople([...people.filter((p) => p.key !== openPerson.key), openPerson]);
  const franchiseMark = marks?.[graph.anilistId];
  const k = useThree((s) => reach(s.size.width / Math.max(s.size.height, 1)));

  return (
    <>
      {!(theme.style.seeThrough && theme.fx) && <color attach="background" args={[theme.bg]} />}
      <fog attach="fog" args={[theme.bg, 16 * k, 62 * k]} />
      <Dust layout={layout} theme={theme} />
      <StaticEdges graph={graph} layout={layout} theme={theme} focus={focus} />
      <Core graph={graph} theme={theme} focus={focus} onPick={() => onFocus("details")} />
      {graph.hubs.filter((h) => h.id !== "details").map((hub) => (
        <HubNode key={hub.id} hub={hub} at={layout.hubs[hub.id]} theme={theme} focus={focus} onPick={() => onFocus(hub.id)} />
      ))}
      {mounted.map((id) => {
        const hub = graph.hubs.find((h) => h.id === id)!;
        return (
          <Cluster key={id} hub={hub} at={layout.hubs[id]} cover={graph.cover} layout={layout} theme={theme} active={focus.hub === id}
            selectedId={focus.hub === id ? focus.node : null} receded={focus.hub === id && focus.person != null} marks={marks}
            franchiseMark={franchiseMark} reducedMotion={reducedMotion}
            onPick={(node) => onFocus(id, node.id)} onGone={() => setMounted((m) => m.filter((x) => x !== id))} />
        );
      })}
      {people.map((p) => {
        const active = openPerson?.key === p.key;
        return (
          <Cluster key={p.key} hub={p.hub} at={p.at} person cover={graph.cover} layout={layout} theme={theme} active={active}
            selectedId={active ? focus.work : null} marks={marks} reducedMotion={reducedMotion}
            onPick={(node) => onFocus(p.hub.id, p.nodeId, p.person, node.id)} onGone={() => setPeople((m) => m.filter((x) => x.key !== p.key))} />
        );
      })}
      {theme.style.bloom && theme.fx && <Bloom look={theme.style.bloom} />}
      <CameraRig layout={layout} graph={graph} focus={focus} personAt={personAt} works={person?.works ?? null} reducedMotion={reducedMotion} />
      <LabelFlush />
    </>
  );
}

export default function WorldScene(props: Props) {
  const down = useRef<[number, number] | null>(null);
  const layout = useMemo(() => layoutWorld(props.graph), [props.graph]);
  const { focus, person, graph } = props;
  // Where the open person web sits: out in front of their node in the cast or staff web.
  const personAt = useMemo(() => {
    const hub = focus.hub ? graph.hubs.find((h) => h.id === focus.hub) : null;
    const index = hub && focus.node ? hub.nodes.findIndex((n) => n.id === focus.node) : -1;
    return hub && index >= 0 && person?.works ? personLayout(layout.hubs[hub.id], index, person.works.length) : null;
  }, [layout, graph, focus.hub, focus.node, person]);
  return (
    <>
      <Canvas
        className="ow-canvas"
        dpr={[1, 1.75]}
        camera={{ fov: 45, near: 0.1, far: 260, position: OVERVIEW.pos }}
        gl={{ antialias: true, powerPreference: "high-performance", alpha: true }}
        // Capture phase: the camera controls stop pointerdown from bubbling.
        onPointerDownCapture={(e) => { down.current = [e.clientX, e.clientY]; }}
        // Clicking empty space steps back out one level; releasing an orbit drag does not.
        onPointerMissed={(e) => {
          const d = down.current;
          if (e.type === "click" && d && Math.hypot(e.clientX - d[0], e.clientY - d[1]) < 5) props.onBack();
        }}
      >
        <World {...props} layout={layout} personAt={personAt} />
      </Canvas>
      <LabelLayer graph={props.graph} layout={layout} works={person?.works ?? null} marks={props.marks} />
    </>
  );
}
