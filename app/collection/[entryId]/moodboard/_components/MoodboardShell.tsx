"use client";

import { useEffect, useEffectEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEntriesHydrated, useEntriesStore } from "@/lib/store";
import type { MoodNode, MoodNodeType, MoodWire } from "@/lib/types";
import BoardCanvas, { clampZoom, isTyping, type BoardView } from "./BoardCanvas";
import NodePalette from "./NodePalette";
import { BUBBLE_COLORS, NODE_TYPES } from "./nodeTypes";
import { useBoardHistory } from "./useBoardHistory";
import { snapTo } from "./wires";

const NO_NODES: MoodNode[] = [];
const NO_WIRES: MoodWire[] = [];

export default function MoodboardShell({ entryId }: { entryId: string }) {
  const router = useRouter();
  const hydrated = useEntriesHydrated();
  const entry = useEntriesStore((s) => s.entries.find((e) => e.id === entryId));
  const storedNodes = useEntriesStore((s) => s.moodboards[entryId]?.nodes ?? NO_NODES);
  // Skip nodes whose type no longer exists (Scene/Theme/Soundtrack from the first draft).
  const nodes = useMemo(() => storedNodes.filter((n) => n.type in NODE_TYPES), [storedNodes]);
  const wires = useEntriesStore((s) => s.moodboards[entryId]?.wires ?? NO_WIRES);
  const actions = useBoardHistory(entryId);
  const [view, setView] = useState<BoardView>({ x: 0, y: 0, zoom: 1 });
  const [snap, setSnap] = useState(false);
  const [rawSelected, setSelected] = useState<Set<string>>(() => new Set());
  const [rawSelectedWires, setSelectedWires] = useState<Set<string>>(() => new Set());

  // Ignore ids of nodes/wires that are gone (deleted via ✕, undone, …).
  const selected = useMemo(() => {
    const live = new Set(nodes.map((n) => n.id));
    return new Set([...rawSelected].filter((id) => live.has(id)));
  }, [nodes, rawSelected]);
  const selectedWires = useMemo(() => {
    const live = new Set(wires.map((w) => w.id));
    return new Set([...rawSelectedWires].filter((id) => live.has(id)));
  }, [wires, rawSelectedWires]);

  useEffect(() => {
    useEntriesStore.persist.rehydrate();
  }, []);

  // The board covers the page; stop the document behind it from scrolling.
  useEffect(() => {
    document.body.classList.add("board-open");
    return () => document.body.classList.remove("board-open");
  }, []);

  // New nodes land centered on screen, staggered so repeated clicks don't stack exactly.
  const spawn = (type: MoodNodeType) => {
    const stagger = (nodes.length % 6) * 24;
    const x = -view.x / view.zoom - NODE_TYPES[type].width / 2 + stagger;
    const y = -view.y / view.zoom - 80 + stagger;
    const node: MoodNode = {
      // Not crypto.randomUUID(): that needs a secure context, which a LAN dev URL isn't.
      id: "n_" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      type,
      x: snap ? snapTo(x) : x,
      y: snap ? snapTo(y) : y,
      data: {},
    };
    actions.addNode(node);
    setSelected(new Set([node.id]));
    setSelectedWires(new Set());
  };

  // Turning snap on also pulls every node onto the grid (one undo step).
  const toggleSnap = () => {
    if (!snap) {
      const patches: Record<string, { x: number; y: number }> = {};
      for (const n of nodes) {
        if (n.x !== snapTo(n.x) || n.y !== snapTo(n.y)) patches[n.id] = { x: snapTo(n.x), y: snapTo(n.y) };
      }
      if (Object.keys(patches).length) actions.patchNodes(patches);
    }
    setSnap(!snap);
  };

  // B: flip selected bubbles ⇄ custom nodes (text and color carry over); with none selected, add a bubble.
  const toggleBubble = () => {
    const targets = nodes.filter((n) => selected.has(n.id) && (n.type === "bubble" || n.type === "custom"));
    if (!targets.length) { spawn("bubble"); return; }
    const patches: Record<string, Partial<MoodNode>> = {};
    for (const n of targets) {
      const toBubble = n.type === "custom";
      const data = { ...n.data };
      // Custom has two extra colors that bubbles don't support.
      if (toBubble && !(BUBBLE_COLORS as readonly string[]).includes(data.color)) delete data.color;
      patches[n.id] = { type: toBubble ? "bubble" : "custom", data };
    }
    actions.patchNodes(patches);
  };

  const onKeyDown = useEffectEvent((e: KeyboardEvent) => {
    if (isTyping(e.target)) {
      if (e.key === "Escape") (e.target as HTMLElement).blur();
      return; // Leave Ctrl+Z, Ctrl+A, Delete etc. to the text field.
    }
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (mod && key === "z") {
      e.preventDefault();
      if (e.shiftKey) actions.redo(); else actions.undo();
    } else if (mod && key === "y") {
      e.preventDefault();
      actions.redo();
    } else if (mod && key === "a") {
      e.preventDefault();
      setSelected(new Set(nodes.map((n) => n.id)));
    } else if (mod || e.altKey) {
      return;
    } else if (key === "delete" || key === "backspace") {
      e.preventDefault();
      actions.deleteSelection([...selected], [...selectedWires]);
      setSelected(new Set());
      setSelectedWires(new Set());
    } else if (key === "escape") {
      setSelected(new Set());
      setSelectedWires(new Set());
    } else if (key === "g") {
      toggleSnap();
    } else if (key === "b") {
      toggleBubble();
    }
  });

  useEffect(() => {
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const zoomBy = (k: number) => setView((v) => {
    const zoom = clampZoom(v.zoom * k);
    // Keep the screen center fixed.
    return { zoom, x: v.x * (zoom / v.zoom), y: v.y * (zoom / v.zoom) };
  });

  if (hydrated && !entry) {
    return (
      <div className="board-overlay open">
        <div className="board-missing">
          <p>That entry doesn&apos;t exist anymore.</p>
          <Link href="/collection" className="board-back">← Back to Collection</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="board-overlay open">
      <div className="board-header">
        <button className="board-back" type="button" onClick={() => router.push("/collection")} title="Back to Collection">
          <span>←</span><span>Back</span>
        </button>
        <div className="board-identity">
          <div className="board-cover-thumb">
            {entry?.imageUrl
              ? <img src={entry.imageUrl} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", borderRadius: "inherit" }} />
              : "🎌"}
          </div>
          <div className="board-title-group">
            <nav className="board-crumbs" aria-label="Breadcrumb">
              <Link href="/collection" className="crumb-link">Collection</Link>
              <span className="crumb-sep" aria-hidden="true">❯</span>
              <span className="board-title crumb-entry">{entry?.title ?? "…"}</span>
              <span className="crumb-sep" aria-hidden="true">❯</span>
              <span className="crumb-current" aria-current="page">Moodboard</span>
            </nav>
            {entry && (
              <div className="board-meta">
                <span className={`badge badge-type-${entry.type}`}>{entry.type}</span>
                <span className="badge badge-genre">{nodes.length} node{nodes.length === 1 ? "" : "s"}</span>
              </div>
            )}
          </div>
        </div>
        <div className="board-zoom-info">
          <button className="board-zoom-btn" type="button" title="Zoom out" onClick={() => zoomBy(1 / 1.2)}>−</button>
          <span id="boardZoomLevel">{Math.round(view.zoom * 100)}%</span>
          <button className="board-zoom-btn" type="button" title="Zoom in" onClick={() => zoomBy(1.2)}>+</button>
          <button className="board-zoom-btn wide" type="button" title="Reset view" onClick={() => setView({ x: 0, y: 0, zoom: 1 })}>Reset</button>
          <button className={`board-snap-toggle ${snap ? "active" : ""}`} type="button" title="Snap to grid (G)"
            aria-pressed={snap} onClick={toggleSnap}>⊞</button>
        </div>
      </div>

      <div style={{ flex: 1, display: "flex", position: "relative", minHeight: 0 }}>
        <NodePalette onSpawn={spawn} />
        {hydrated && (
          <BoardCanvas
            nodes={nodes}
            wires={wires}
            view={view}
            setView={setView}
            snap={snap}
            selected={selected}
            setSelected={setSelected}
            selectedWires={selectedWires}
            setSelectedWires={setSelectedWires}
            actions={actions}
          />
        )}
      </div>

      <div className="board-help">
        <strong>Pan:</strong> middle-drag or space + drag &nbsp;·&nbsp;
        <strong>Zoom:</strong> ctrl + scroll &nbsp;·&nbsp;
        <strong>Select:</strong> click, ctrl-click, box, ⌃A &nbsp;·&nbsp;
        <strong>Connect:</strong> drag an edge dot &nbsp;·&nbsp;
        <strong>Grid:</strong> G &nbsp;·&nbsp;
        <strong>Bubble:</strong> B &nbsp;·&nbsp;
        <strong>Undo:</strong> ⌃Z / ⌃⇧Z &nbsp;·&nbsp;
        <strong>Delete:</strong> Del
      </div>
    </div>
  );
}
