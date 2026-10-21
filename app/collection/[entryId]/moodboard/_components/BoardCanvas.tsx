"use client";

import { useCallback, useEffect, useRef, useState, type PointerEvent } from "react";
import type { MoodNode, MoodWire } from "@/lib/types";
import BoardNode from "./BoardNode";
import { NODE_TYPES, nodeColor } from "./nodeTypes";
import type { BoardActions } from "./useBoardHistory";
import { GRID, bezierPath, center, edgePoint, orthoPath, snapTo, type Box, type EdgePoint } from "./wires";

export type BoardView = { x: number; y: number; zoom: number };

export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 2.5;
export const clampZoom = (z: number) => Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, z));

type Gesture =
  | { kind: "pan"; startX: number; startY: number; viewX: number; viewY: number }
  | { kind: "drag"; startX: number; startY: number; zoom: number; ids: Set<string>; moved: boolean; dx: number; dy: number; collapseTo: string | null }
  | { kind: "marquee"; startX: number; startY: number; base: Set<string> }
  | { kind: "wire"; fromId: string; target: string | null };

type Rect = { left: number; top: number; width: number; height: number };
type Size = { w: number; h: number };
type WireDrag = { fromId: string; x: number; y: number; target: string | null };

export const isTyping = (t: EventTarget | null) =>
  t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));

export default function BoardCanvas({
  nodes, wires, view, setView, snap, selected, setSelected, selectedWires, setSelectedWires, actions,
}: {
  nodes: MoodNode[];
  wires: MoodWire[];
  view: BoardView;
  setView: React.Dispatch<React.SetStateAction<BoardView>>;
  snap: boolean;
  selected: Set<string>;
  setSelected: (s: Set<string>) => void;
  selectedWires: Set<string>;
  setSelectedWires: (s: Set<string>) => void;
  actions: BoardActions;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const nodeEls = useRef(new Map<string, HTMLDivElement>());
  const sizeObserver = useRef<ResizeObserver | null>(null);
  const gesture = useRef<Gesture | null>(null);
  const [sizes, setSizes] = useState<Record<string, Size>>({});
  const [drag, setDrag] = useState<{ ids: Set<string>; dx: number; dy: number } | null>(null);
  const [wireDrag, setWireDrag] = useState<WireDrag | null>(null);
  const [marquee, setMarquee] = useState<Rect | null>(null);
  const [panning, setPanning] = useState(false);
  const [spaceDown, setSpaceDown] = useState(false);

  // Wires attach to node edges, so track each node's rendered size.
  useEffect(() => {
    const obs = new ResizeObserver((records) => {
      setSizes((prev) => {
        let next = prev;
        for (const r of records) {
          const el = r.target as HTMLElement;
          const id = el.dataset.nodeId!;
          const w = el.offsetWidth, h = el.offsetHeight;
          if (prev[id]?.w === w && prev[id]?.h === h) continue;
          if (next === prev) next = { ...prev };
          next[id] = { w, h };
        }
        return next;
      });
    });
    sizeObserver.current = obs;
    nodeEls.current.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, []);

  const registerEl = useCallback((id: string, el: HTMLDivElement | null) => {
    const prev = nodeEls.current.get(id);
    if (prev === el) return;
    if (prev) sizeObserver.current?.unobserve(prev);
    if (el) {
      nodeEls.current.set(id, el);
      sizeObserver.current?.observe(el);
    } else {
      nodeEls.current.delete(id);
    }
  }, []);
  const onPatch = useCallback((id: string, patch: Record<string, string>) => actions.editField(id, patch), [actions]);
  const onDeleteOne = useCallback((id: string) => actions.deleteNodes([id]), [actions]);

  // Space arms panning (the rest of the shortcuts live in MoodboardShell).
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.code !== "Space" || isTyping(e.target)) return;
      e.preventDefault();
      setSpaceDown(true);
    };
    const up = (e: KeyboardEvent) => { if (e.code === "Space") setSpaceDown(false); };
    const blur = () => setSpaceDown(false);
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);

  // Wheel: ctrl/⌘ (and trackpad pinch) zooms around the cursor; plain scroll pans.
  // Attached natively because React's wheel listener is passive and can't block browser zoom.
  useEffect(() => {
    const vp = viewportRef.current;
    if (!vp) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        const r = vp.getBoundingClientRect();
        // Cursor position relative to the canvas origin (viewport center).
        const cx = e.clientX - r.left - r.width / 2;
        const cy = e.clientY - r.top - r.height / 2;
        setView((v) => {
          const zoom = clampZoom(v.zoom * Math.exp(-e.deltaY * 0.0015));
          const k = zoom / v.zoom;
          return { zoom, x: cx - (cx - v.x) * k, y: cy - (cy - v.y) * k };
        });
      } else {
        setView((v) => ({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
      }
    };
    vp.addEventListener("wheel", onWheel, { passive: false });
    return () => vp.removeEventListener("wheel", onWheel);
  }, [setView]);

  const toWorld = (clientX: number, clientY: number) => {
    const r = viewportRef.current!.getBoundingClientRect();
    return {
      x: (clientX - r.left - r.width / 2 - view.x) / view.zoom,
      y: (clientY - r.top - r.height / 2 - view.y) / view.zoom,
    };
  };

  // Live offset of a node being dragged; with snap on, its corner lands on the grid.
  const offsetOf = (n: MoodNode) => {
    if (!drag || !drag.ids.has(n.id)) return { dx: 0, dy: 0 };
    if (!snap) return { dx: drag.dx, dy: drag.dy };
    return { dx: snapTo(n.x + drag.dx) - n.x, dy: snapTo(n.y + drag.dy) - n.y };
  };

  const byId = new Map(nodes.map((n) => [n.id, n]));
  const boxOf = (n: MoodNode): Box => {
    const o = offsetOf(n);
    const s = sizes[n.id] ?? { w: NODE_TYPES[n.type].width, h: 100 };
    return { x: n.x + o.dx, y: n.y + o.dy, w: s.w, h: s.h };
  };
  const route = (a: EdgePoint, b: EdgePoint) => (snap ? orthoPath(a, b) : bezierPath(a, b));

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    const vp = viewportRef.current!;
    const target = e.target as HTMLElement;

    // Pan: middle button anywhere, or left button while space is held.
    if (e.button === 1 || (e.button === 0 && spaceDown)) {
      e.preventDefault();
      vp.setPointerCapture(e.pointerId);
      gesture.current = { kind: "pan", startX: e.clientX, startY: e.clientY, viewX: view.x, viewY: view.y };
      setPanning(true);
      return;
    }
    if (e.button !== 0) return;

    const additive = e.ctrlKey || e.metaKey;
    const nodeEl = target.closest<HTMLElement>("[data-node-id]");

    // Edge handle: start drawing a wire from this node.
    if (nodeEl && target.closest("[data-anchor]")) {
      e.preventDefault();
      vp.setPointerCapture(e.pointerId);
      const fromId = nodeEl.dataset.nodeId!;
      gesture.current = { kind: "wire", fromId, target: null };
      setWireDrag({ fromId, ...toWorld(e.clientX, e.clientY), target: null });
      return;
    }

    // Wire: select it (ctrl/⌘ toggles it in the wire selection).
    const wireEl = target.closest<SVGElement>("[data-line-id]");
    if (wireEl) {
      const id = wireEl.dataset.lineId!;
      const next = new Set(additive ? selectedWires : []);
      if (additive && next.has(id)) next.delete(id); else next.add(id);
      setSelectedWires(next);
      if (!additive) setSelected(new Set());
      return;
    }

    if (nodeEl) {
      const id = nodeEl.dataset.nodeId!;
      if (additive) {
        const next = new Set(selected);
        if (next.has(id)) next.delete(id); else next.add(id);
        setSelected(next);
        return;
      }
      setSelectedWires(new Set());
      const wasSelected = selected.has(id);
      if (!wasSelected) setSelected(new Set([id]));
      // Only the header (or a bubble's padding) drags; the body stays free for typing and uploads.
      // A custom node's header is mostly its title input, so that drags too once the pointer moves.
      const handle = target.closest(".bc-head, [data-drag-handle]");
      const inHeadInput = target.matches(".bc-head input");
      if (handle && !target.closest("button, textarea, .bc-custom-icon") && (inHeadInput || !isTyping(target))) {
        if (!inHeadInput) e.preventDefault();
        vp.setPointerCapture(e.pointerId);
        gesture.current = {
          kind: "drag", startX: e.clientX, startY: e.clientY, zoom: view.zoom,
          ids: wasSelected ? new Set(selected) : new Set([id]),
          moved: false, dx: 0, dy: 0,
          // Plain click on one node of a multi-selection narrows to it (on release, if not dragged).
          collapseTo: wasSelected && selected.size > 1 ? id : null,
        };
      }
      return;
    }

    // Empty canvas: start a marquee (ctrl/⌘ adds to the current selection).
    e.preventDefault();
    if (isTyping(document.activeElement)) (document.activeElement as HTMLElement).blur();
    vp.setPointerCapture(e.pointerId);
    const r = vp.getBoundingClientRect();
    gesture.current = {
      kind: "marquee", startX: e.clientX - r.left, startY: e.clientY - r.top,
      base: additive ? new Set(selected) : new Set(),
    };
    if (!additive) {
      setSelected(new Set());
      setSelectedWires(new Set());
    }
  };

  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    const g = gesture.current;
    if (!g) return;
    if (g.kind === "pan") {
      setView((v) => ({ ...v, x: g.viewX + e.clientX - g.startX, y: g.viewY + e.clientY - g.startY }));
    } else if (g.kind === "wire") {
      // Pointer capture doesn't affect hit-testing, so this finds the node under the cursor.
      const over = document.elementFromPoint(e.clientX, e.clientY)?.closest<HTMLElement>("[data-node-id]");
      const id = over?.dataset.nodeId;
      g.target = id && id !== g.fromId ? id : null;
      setWireDrag({ fromId: g.fromId, ...toWorld(e.clientX, e.clientY), target: g.target });
    } else if (g.kind === "drag") {
      if (!g.moved && Math.hypot(e.clientX - g.startX, e.clientY - g.startY) < 3) return;
      if (!g.moved && isTyping(document.activeElement)) (document.activeElement as HTMLElement).blur();
      g.moved = true;
      g.dx = (e.clientX - g.startX) / g.zoom;
      g.dy = (e.clientY - g.startY) / g.zoom;
      setDrag({ ids: g.ids, dx: g.dx, dy: g.dy });
    } else {
      const r = viewportRef.current!.getBoundingClientRect();
      const x = e.clientX - r.left, y = e.clientY - r.top;
      const box = {
        left: Math.min(g.startX, x), top: Math.min(g.startY, y),
        width: Math.abs(x - g.startX), height: Math.abs(y - g.startY),
      };
      setMarquee(box);
      // Hit-test in client coordinates against each node's on-screen box.
      const L = r.left + box.left, T = r.top + box.top, R = L + box.width, B = T + box.height;
      const next = new Set(g.base);
      nodeEls.current.forEach((el, id) => {
        const b = el.getBoundingClientRect();
        if (b.left < R && b.right > L && b.top < B && b.bottom > T) next.add(id);
      });
      setSelected(next);
    }
  };

  const onPointerUp = () => {
    const g = gesture.current;
    gesture.current = null;
    if (!g) return;
    if (g.kind === "pan") setPanning(false);
    else if (g.kind === "marquee") setMarquee(null);
    else if (g.kind === "wire") {
      setWireDrag(null);
      const { fromId, target: to } = g;
      const exists = wires.some((w) => (w.from === fromId && w.to === to) || (w.from === to && w.to === fromId));
      if (to && !exists) {
        actions.addWire({ id: "w_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7), from: fromId, to });
      }
    } else if (g.moved) {
      const patches: Record<string, { x: number; y: number }> = {};
      for (const n of nodes) {
        if (!g.ids.has(n.id)) continue;
        const x = n.x + g.dx, y = n.y + g.dy;
        patches[n.id] = snap ? { x: snapTo(x), y: snapTo(y) } : { x, y };
      }
      actions.patchNodes(patches);
      setDrag(null);
    } else if (g.collapseTo) {
      setSelected(new Set([g.collapseTo]));
    }
  };

  // ── Wire geometry (canvas space) ──
  const gradients: React.ReactNode[] = [];
  const paths: React.ReactNode[] = [];
  for (const w of wires) {
    const a = byId.get(w.from), b = byId.get(w.to);
    if (!a || !b) continue;
    const ab = boxOf(a), bb = boxOf(b);
    const ac = center(ab), bc = center(bb);
    const from = edgePoint(ab, bc.x, bc.y);
    const to = edgePoint(bb, ac.x, ac.y);
    const gid = `wg_${w.id}`;
    gradients.push(
      <linearGradient key={gid} id={gid} gradientUnits="userSpaceOnUse" x1={from.x} y1={from.y} x2={to.x} y2={to.y}>
        <stop offset="0%" stopColor={nodeColor(a)} />
        <stop offset="100%" stopColor={nodeColor(b)} />
      </linearGradient>
    );
    const d = route(from, to);
    paths.push(
      <g key={w.id} data-line-id={w.id}>
        <path className="wire-hit" d={d} />
        <path className={`wire ${selectedWires.has(w.id) ? "selected" : ""}`} d={d} stroke={`url(#${gid})`} vectorEffect="non-scaling-stroke" />
      </g>
    );
  }

  let ghost: React.ReactNode = null;
  const ghostFrom = wireDrag && byId.get(wireDrag.fromId);
  if (wireDrag && ghostFrom) {
    const target = wireDrag.target ? byId.get(wireDrag.target) : undefined;
    const fb = boxOf(ghostFrom);
    const aim = target ? center(boxOf(target)) : { x: wireDrag.x, y: wireDrag.y };
    const from = edgePoint(fb, aim.x, aim.y);
    const fc = center(fb);
    const to: EdgePoint = target ? edgePoint(boxOf(target), fc.x, fc.y) : { x: wireDrag.x, y: wireDrag.y, nx: 0, ny: 0 };
    const c1 = nodeColor(ghostFrom);
    const c2 = target ? nodeColor(target) : c1;
    gradients.push(
      <linearGradient key="ghost" id="wg_ghost" gradientUnits="userSpaceOnUse" x1={from.x} y1={from.y} x2={to.x} y2={to.y}>
        <stop offset="0%" stopColor={c1} />
        <stop offset="100%" stopColor={c2} />
      </linearGradient>
    );
    ghost = (
      <>
        <path className="wire ghost" d={route(from, to)} stroke="url(#wg_ghost)" style={{ color: c2 }} vectorEffect="non-scaling-stroke" />
        <circle className="wire-tip" cx={to.x} cy={to.y} r={4.5} fill={c2} style={{ color: c2 }} />
      </>
    );
  }

  return (
    <div
      ref={viewportRef}
      className={`board-viewport select-mode ${snap ? "snap-on" : ""} ${spaceDown ? "space-pan" : ""} ${panning ? "panning" : ""} ${wireDrag ? "wiring" : ""}`}
      style={{
        backgroundPosition: `calc(50% + ${view.x}px) calc(50% + ${view.y}px)`,
        backgroundSize: `${GRID * view.zoom}px ${GRID * view.zoom}px`,
      }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      // Stops Windows middle-click autoscroll from hijacking the pan.
      onMouseDown={(e) => { if (e.button === 1) e.preventDefault(); }}
    >
      <div
        className="board-canvas"
        style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.zoom})` }}
      >
        <svg className="board-wires" xmlns="http://www.w3.org/2000/svg">
          <defs>{gradients}</defs>
          {paths}
          {ghost}
        </svg>
        {nodes.map((n) => {
          const o = offsetOf(n);
          return (
            <BoardNode
              key={n.id}
              node={n}
              dx={o.dx}
              dy={o.dy}
              selected={selected.has(n.id)}
              dragging={!!drag && drag.ids.has(n.id)}
              connectTarget={wireDrag?.target === n.id}
              onPatch={onPatch}
              onDelete={onDeleteOne}
              registerEl={registerEl}
            />
          );
        })}
      </div>

      {marquee && <div className="board-marquee" style={marquee}></div>}
      <div className={`board-multi-pill ${selected.size + selectedWires.size > 1 ? "visible" : ""}`}>
        {selected.size + selectedWires.size} selected
      </div>
      {nodes.length === 0 && (
        <div className="board-empty">Pick a node from the palette to start this board.</div>
      )}
    </div>
  );
}
