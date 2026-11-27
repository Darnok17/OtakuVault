"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ComponentRef, type CSSProperties } from "react";
import { Canvas, useFrame, useThree, type ThreeEvent } from "@react-three/fiber";
import { Billboard, CameraControls } from "@react-three/drei";
import {
  AdditiveBlending, CanvasTexture, Color, EdgesGeometry, Fog, IcosahedronGeometry, SRGBColorSpace, TextureLoader, Vector3,
  type Camera, type Group, type Object3D, type Texture,
} from "three";
import { hubSize, type Hub, type HubId, type TitleGraph, type WebNode } from "@/lib/title-graph";
import {
  CORE_RADIUS, HUB_END, OVERVIEW, cameraFor, layoutWorld, reach, type GroupLabel, type HubLayout, type V3, type Viewport, type WorldLayout,
} from "@/lib/title-graph-layout";
import { FatLines, type LineLook } from "./fat-lines";
import { coreColor, type SceneTheme } from "./scene-theme";
import { useWorldHover, useWorldInsets } from "./world-store";

// The 3D half of the title world. Everything is laid out once (lib/title-graph-layout.ts); this
// file draws it, animates clusters opening and closing, moves the camera, and keeps one DOM layer
// of labels pinned to the 3D nodes (so labels use the theme's real fonts).

export type Focus = { hub: HubId | null; node: string | null };

type Props = {
  graph: TitleGraph;
  theme: SceneTheme;
  focus: Focus;
  reducedMotion: boolean;
  onFocus: (hub: HubId | null, node?: string | null) => void;
  onBack: () => void;
};

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

type Label = { id: string; text: string; sub?: string; kind: "core" | "hub" | "node" | "fact" | "group"; tone?: string };

function LabelLayer({ graph, layout }: { graph: TitleGraph; layout: WorldLayout }) {
  const layer = useRef<HTMLDivElement>(null);
  const els = useRef(new Map<string, HTMLDivElement>());
  const hovered = useWorldHover((s) => s.hovered);
  const labels = useMemo<Label[]>(() => [
    { id: "core", text: graph.title, kind: "core" },
    ...graph.hubs.filter((h) => h.id !== "details").map((h): Label => ({ id: `hub:${h.id}`, text: h.label, sub: `${h.kanji} · ${hubSize(h)}`, kind: "hub", tone: h.tone })),
    ...graph.hubs.flatMap((h) => h.nodes.map((n): Label => ({ id: n.id, text: n.label, kind: n.image ? "node" : "fact" }))),
    ...graph.hubs.flatMap((h) => layout.hubs[h.id].groups.map((g): Label => ({ id: `group:${g.id}`, text: g.label, kind: "group", tone: g.tone }))),
  ], [graph, layout]);

  // Static importance per label, for the declutter pass.
  const ranks = useRef(new Map<string, number>());
  useEffect(() => {
    const weights = new Map(graph.hubs.flatMap((h) => h.nodes.map((n) => [n.id, n.weight] as const)));
    ranks.current = new Map(labels.map((l) => [l.id, l.kind === "core" ? 9 : l.kind === "hub" ? 8 : l.kind === "group" ? 7 : (weights.get(l.id) ?? 0) * 5]));
  }, [graph, labels]);

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
        let size = sizes.get(c.id);
        if (!size) { size = [c.el.offsetWidth, c.el.offsetHeight]; if (size[0]) sizes.set(c.id, size); }
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
    const sizes = new Map<string, number[]>();
    void document.fonts?.ready.then(() => sizes.clear());
    return () => { labelSync.flush = null; };
  }, []);

  return (
    <div className="ow-labels" ref={layer} aria-hidden="true">
      {labels.map((l) => (
        <div key={l.id} ref={(el) => { if (el) els.current.set(l.id, el); else els.current.delete(l.id); }}
          className={`ow-label ow-label-${l.kind}${hovered === l.id ? " is-hot" : ""}`}
          style={{ visibility: "hidden", ...(l.tone ? { "--c": `var(--${l.tone})` } : {}) } as CSSProperties}>
          {l.kind === "hub" ? <><span>{l.text}</span><small>{l.sub}</small></> : l.text}
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

function NodeDisc({ node, always, near, theme, register, selected, someoneSelected, onPick }: {
  node: WebNode; always: boolean; near: number; theme: SceneTheme; register: (g: Group | null) => void;
  selected: boolean; someoneSelected: boolean; onPick: () => void;
}) {
  const tex = useTexture(node.image);
  const color = theme.tones[node.tone];
  const hovered = useWorldHover((s) => s.hovered === node.id);
  const events = useNodeEvents(node.id, onPick);
  const labelRef = useLabelAnchor(node.id);
  const outer = useRef<Group | null>(null);
  const inner = useRef<Group>(null);
  // Anchors (the characters a cast web hangs from) are small: they're the hooks, not the subject.
  const radius = node.anchor ? 0.24 : NODE_RADIUS * (node.image ? 0.8 + node.weight * 0.6 : 0.3 + node.weight * 0.25);
  const camera = useThree((s) => s.camera);
  const world = useMemo(() => new Vector3(), []);

  useFrame((_, dt) => {
    const g = inner.current;
    if (!g || !outer.current) return;
    g.scale.setScalar(approach(g.scale.x, hovered || selected ? 1.3 : 1, dt, 10));
    // Labels: key nodes from afar, the rest once you lean in past the hub's framed distance.
    // Hover and selection always win; nodes still flying out stay quiet.
    outer.current.getWorldPosition(world);
    const d = world.distanceTo(camera.position);
    const seen = Math.min(1, Math.max(0, always ? (75 - d) / 15 : (near - d) / (near * 0.15)));
    const spawn = Math.min(1, Math.max(0, (outer.current.scale.x - 0.6) / 0.4));
    setLabelOpacity(node.id, (hovered || selected ? 1 : seen * (someoneSelected ? 0.35 : 1)) * spawn);
  });

  const fade = someoneSelected && !selected ? 0.45 : 1;
  const ring = node.image ? radius * (selected ? 1.22 : 1.13) : radius;

  return (
    <group ref={(g) => { outer.current = g; register(g); }}>
      <Billboard>
        <group ref={inner}>
          <Halo color={color} size={radius * 5} opacity={(selected ? 0.6 : 0.3) * fade} theme={theme} />
          <Rim inner={ring} theme={theme} opacity={fade} />
          {node.image ? (
            <>
              <mesh>
                <ringGeometry args={[radius, ring, 48]} />
                <meshBasicMaterial color={color} transparent opacity={fade} />
              </mesh>
              <Portrait radius={radius} tex={tex} fallback={theme.faint} opacity={fade} events={events} />
            </>
          ) : (
            <mesh {...events}>
              <circleGeometry args={[radius, 32]} />
              <meshBasicMaterial color={color} transparent opacity={fade} />
            </mesh>
          )}
        </group>
        <object3D ref={labelRef} position={[0, -ring * 1.2 - 0.14, 0]} />
      </Billboard>
    </group>
  );
}

// A sub-cluster's caption, and for some (this show on the franchise path) a small ring marker.
function GroupMark({ group, theme, cover, register }: {
  group: GroupLabel; theme: SceneTheme; cover: string | null; register: (g: Group | null) => void;
}) {
  const labelRef = useLabelAnchor(`group:${group.id}`);
  const tex = useTexture(group.marker ? cover : null);
  return (
    <group ref={register}>
      <object3D ref={labelRef} />
      {group.marker && (
        <Billboard position={[0, 0.75, 0]}>
          <mesh>
            <ringGeometry args={[0.34, 0.42, 40]} />
            <meshBasicMaterial color={theme.tones[group.tone]} transparent opacity={0.95} />
          </mesh>
          <Portrait radius={0.34} tex={tex} fallback={theme.tones[group.tone]} opacity={1} />
          <Rim inner={0.42} theme={theme} opacity={1} />
        </Billboard>
      )}
    </group>
  );
}

function Cluster({ hub, cover, layout, theme, active, focus, reducedMotion, onPick, onGone }: {
  hub: Hub; cover: string | null; layout: WorldLayout; theme: SceneTheme; active: boolean; focus: Focus; reducedMotion: boolean;
  onPick: (node: WebNode) => void; onGone: () => void;
}) {
  const at: HubLayout = layout.hubs[hub.id];
  const groups = useRef<(Group | null)[]>([]);
  const marks = useRef<(Group | null)[]>([]);
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
  const tone = theme.tones[hub.tone];
  const lines = useFatLines(at.edges.length, lineLook(theme, tone, 0));
  const hotLines = useFatLines(at.edges.length, { ...lineLook(theme, tone, 0), width: theme.style.lineWidth * 1.8 });
  const vp = useViewport();
  // Labels beyond the key nodes appear once the camera is a fifth closer than this web's framing.
  const near = useMemo(() => {
    const v = cameraFor(layout, hub.id, null, vp);
    return Math.hypot(v.pos[0] - v.target[0], v.pos[1] - v.target[1], v.pos[2] - v.target[2]) * 0.8;
  }, [layout, hub.id, vp]);
  const n = hub.nodes.length;
  const selectedId = focus.hub === hub.id ? focus.node : null;
  const end = (x: number) => (x >= 0 ? live[x] : x === HUB_END ? from : jointLive[-2 - x]);

  useFrame((_, dt) => {
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
      groupTargets.forEach((p, k) => { const g = marks.current[k]; if (g) { g.position.lerpVectors(from, p, tj); g.scale.setScalar(Math.max(tj, 0.001)); } });
      at.edges.forEach(([a, b], e) => lines.set(e, end(a), end(b)));
      lines.commit(at.edges.length);
      lines.fade(theme.style.lineOpacity * t);
      settled.current = progress.current === goal;
      if (!active && progress.current === 0) onGone();
    }
    const t = progress.current;
    // Captions fade with the web, and step back while one node has the stage.
    at.groups.forEach((g) => setLabelOpacity(`group:${g.id}`, t * (selectedId ? 0.4 : 1)));
    // The hovered (else selected) node's own links, drawn bolder on top.
    const hot = useWorldHover.getState().hovered ?? selectedId;
    if (animating || hot !== lastHot.current) {
      lastHot.current = hot;
      const i = hot != null ? indexOfId.get(hot) : undefined;
      const es = i != null ? touching.get(i) ?? [] : [];
      es.forEach((e, k) => hotLines.set(k, end(at.edges[e][0]), end(at.edges[e][1])));
      hotLines.commit(es.length);
    }
    hotLines.fade(Math.min(1, theme.style.lineOpacity * 2.6) * t);
  });

  // A changed goal means another round of animation.
  useEffect(() => { settled.current = false; }, [active]);

  // Small webs label every node; big ones (a 60-strong cast) only their key nodes until you lean in.
  // The details web always holds back its long tail of tags.
  const crowded = hub.id === "details" || hubSize(hub) > 30;
  return (
    <group>
      <primitive object={lines.object} />
      <primitive object={hotLines.object} />
      {at.groups.map((g, k) => (
        <GroupMark key={g.id} group={g} theme={theme} cover={cover} register={(o) => { marks.current[k] = o; }} />
      ))}
      {hub.nodes.map((node, i) => (
        <NodeDisc key={node.id} node={node} always={!node.anchor && (node.weight >= 0.7 || !crowded)} near={near} theme={theme}
          register={(g) => { groups.current[i] = g; }}
          selected={selectedId === node.id} someoneSelected={selectedId != null} onPick={() => onPick(node)} />
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

function CameraRig({ layout, graph, focus, reducedMotion }: { layout: WorldLayout; graph: TitleGraph; focus: Focus; reducedMotion: boolean }) {
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
    const view = cameraFor(layout, focus.hub, index >= 0 ? index : null, size);
    idle.current = 0;
    void c.setLookAt(...view.pos, ...view.target, !reducedMotion);
  }, [focus.hub, focus.node, layout, graph, reducedMotion, size]);

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

function World({ graph, theme, focus, reducedMotion, onFocus, layout }: Props & { layout: WorldLayout }) {
  // Clusters stay mounted while they fold back up, then leave.
  const [mounted, setMounted] = useState<HubId[]>(focus.hub ? [focus.hub] : []);
  if (focus.hub && !mounted.includes(focus.hub)) setMounted([...mounted, focus.hub]);
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
          <Cluster key={id} hub={hub} cover={graph.cover} layout={layout} theme={theme} active={focus.hub === id} focus={focus} reducedMotion={reducedMotion}
            onPick={(node) => onFocus(id, node.id)} onGone={() => setMounted((m) => m.filter((x) => x !== id))} />
        );
      })}
      <CameraRig layout={layout} graph={graph} focus={focus} reducedMotion={reducedMotion} />
      <LabelFlush />
    </>
  );
}

export default function WorldScene(props: Props) {
  const down = useRef<[number, number] | null>(null);
  const layout = useMemo(() => layoutWorld(props.graph), [props.graph]);
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
        <World {...props} layout={layout} />
      </Canvas>
      <LabelLayer graph={props.graph} layout={layout} />
    </>
  );
}
