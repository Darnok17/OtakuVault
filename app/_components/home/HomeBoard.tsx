"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";

// The home page's live moodboard: four real nodes about One Piece, joined by wires that follow
// the nodes as you drag them (mouse, touch or arrow keys). Positions are fractions of the board
// and reset when you leave the page. Deliberately tiny — no physics, no library.

type NodeId = "image" | "character" | "quote" | "note";
type Pos = { x: number; y: number }; // top-left corner, 0–1 of the board

const START: Record<NodeId, Pos> = {
  image:     { x: 0.05, y: 0.08 },
  character: { x: 0.44, y: 0.30 },
  quote:     { x: 0.60, y: 0.07 },
  note:      { x: 0.20, y: 0.70 },
};
const WIRES: [NodeId, NodeId][] = [["image", "character"], ["character", "quote"], ["character", "note"], ["image", "note"]];
const COLOR: Record<NodeId, string> = { image: "var(--anime)", character: "var(--azure)", quote: "var(--gold)", note: "var(--acc-3)" };
const NODE_IDS = Object.keys(START) as NodeId[];
const KEY_STEP = 0.03;

export type BoardArt = { cover: string | null; portrait: string | null; href: string };

export default function HomeBoard({ cover, portrait, href }: BoardArt) {
  const [pos, setPos] = useState(START);
  const [dragging, setDragging] = useState<NodeId | null>(null);
  const boardRef = useRef<HTMLDivElement>(null);
  const nodeRefs = useRef<Partial<Record<NodeId, HTMLDivElement | null>>>({});
  const pathRefs = useRef<(SVGPathElement | null)[]>([]);
  const gradRefs = useRef<(SVGLinearGradientElement | null)[]>([]);
  const svgRef = useRef<SVGSVGElement>(null);
  const grab = useRef<{ id: NodeId; dx: number; dy: number; moved: boolean } | null>(null);

  // Wires are drawn straight from the DOM: wherever the nodes are right now, centre to centre.
  const drawWires = useCallback(() => {
    const board = boardRef.current, svg = svgRef.current;
    if (!board || !svg) return;
    const b = board.getBoundingClientRect();
    if (!b.width) return;
    svg.setAttribute("viewBox", `0 0 ${b.width} ${b.height}`);
    WIRES.forEach(([from, to], i) => {
      const a = nodeRefs.current[from]?.getBoundingClientRect(), z = nodeRefs.current[to]?.getBoundingClientRect();
      const path = pathRefs.current[i], grad = gradRefs.current[i];
      if (!a || !z || !path || !grad) return;
      const x1 = a.left + a.width / 2 - b.left, y1 = a.top + a.height / 2 - b.top;
      const x2 = z.left + z.width / 2 - b.left, y2 = z.top + z.height / 2 - b.top;
      const bend = Math.max(30, Math.abs(x2 - x1) * 0.5);
      path.setAttribute("d", `M${x1},${y1} C${x1 + bend},${y1} ${x2 - bend},${y2} ${x2},${y2}`);
      grad.setAttribute("x1", String(x1)); grad.setAttribute("y1", String(y1));
      grad.setAttribute("x2", String(x2)); grad.setAttribute("y2", String(y2));
    });
  }, []);

  useLayoutEffect(drawWires, [pos, drawWires]);
  useEffect(() => {
    const board = boardRef.current;
    if (!board) return;
    // Board resizes, images loading and the reveal animation all move the node centres.
    const ro = new ResizeObserver(drawWires);
    ro.observe(board);
    NODE_IDS.forEach((id) => { const el = nodeRefs.current[id]; if (el) ro.observe(el); });
    board.addEventListener("transitionend", drawWires);
    return () => { ro.disconnect(); board.removeEventListener("transitionend", drawWires); };
  }, [drawWires]);

  const clampTo = (id: NodeId, x: number, y: number): Pos => {
    const board = boardRef.current, el = nodeRefs.current[id];
    if (!board || !el) return { x, y };
    const maxX = 1 - el.offsetWidth / board.clientWidth, maxY = 1 - el.offsetHeight / board.clientHeight;
    return { x: Math.min(Math.max(x, 0), Math.max(maxX, 0)), y: Math.min(Math.max(y, 0), Math.max(maxY, 0)) };
  };

  // Handlers read which node they belong to from data-node, so the same function serves all four.
  const idOf = (el: HTMLElement) => el.dataset.node as NodeId;
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return;
    const id = idOf(e.currentTarget);
    const r = e.currentTarget.getBoundingClientRect();
    grab.current = { id, dx: e.clientX - r.left, dy: e.clientY - r.top, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(id);
  };
  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const g = grab.current, board = boardRef.current;
    if (!g || !board) return;
    const b = board.getBoundingClientRect();
    g.moved = true;
    const next = clampTo(g.id, (e.clientX - g.dx - b.left) / b.width, (e.clientY - g.dy - b.top) / b.height);
    setPos((p) => ({ ...p, [g.id]: next }));
  };
  const endDrag = () => { grab.current = null; setDragging(null); };
  // A drag must not also follow the link inside the node.
  const onClickCapture = (e: React.MouseEvent) => { if (grab.current?.moved) { e.preventDefault(); e.stopPropagation(); } };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const d = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] }[e.key];
    if (!d) return;
    e.preventDefault();
    const id = idOf(e.currentTarget);
    setPos((p) => ({ ...p, [id]: clampTo(id, p[id].x + d[0] * KEY_STEP, p[id].y + d[1] * KEY_STEP) }));
  };

  // The static half of a node's props; its ref and event handlers are attached in the JSX.
  const nodeProps = (id: NodeId, label: string) => ({
    "data-node": id,
    className: `hb-node hb-${id}${dragging === id ? " dragging" : ""}`,
    style: { left: `${pos[id].x * 100}%`, top: `${pos[id].y * 100}%`, "--c": COLOR[id] } as React.CSSProperties,
    tabIndex: 0,
    role: "group" as const,
    "aria-label": `${label} node. Drag it, or move it with the arrow keys.`,
  });

  return (
    <div className="demo-board hb-board" ref={boardRef}>
      <svg className="hb-wires" ref={svgRef} aria-hidden="true">
        <defs>
          {WIRES.map(([from, to], i) => (
            <linearGradient key={i} id={`hbWire${i}`} gradientUnits="userSpaceOnUse" ref={(el) => { gradRefs.current[i] = el; }}>
              <stop offset="0%" style={{ stopColor: COLOR[from] }} />
              <stop offset="100%" style={{ stopColor: COLOR[to] }} />
            </linearGradient>
          ))}
        </defs>
        {WIRES.map((_, i) => (
          <path key={i} className="hb-wire" stroke={`url(#hbWire${i})`} ref={(el) => { pathRefs.current[i] = el; }} />
        ))}
      </svg>

      <div {...nodeProps("image", "Image")} ref={(el) => { nodeRefs.current.image = el; }} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag} onClickCapture={onClickCapture} onKeyDown={onKeyDown}>
        <span className="hb-tag">Image</span>
        {cover
          // eslint-disable-next-line @next/next/no-img-element -- remote AniList art, sized by CSS
          ? <img className="hb-art" src={cover} alt="One Piece key art" draggable={false} />
          : <span className="hb-art hb-art-empty">海</span>}
        <Link className="hb-caption" href={href} draggable={false}>One Piece</Link>
      </div>

      <div {...nodeProps("character", "Character")} ref={(el) => { nodeRefs.current.character = el; }} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag} onClickCapture={onClickCapture} onKeyDown={onKeyDown}>
        <span className="hb-tag">Character</span>
        {portrait
          // eslint-disable-next-line @next/next/no-img-element -- remote AniList art, sized by CSS
          ? <img className="hb-portrait" src={portrait} alt="" draggable={false} />
          : <span className="hb-portrait hb-art-empty">ル</span>}
        <span className="hb-char-text">
          <strong>Monkey D. Luffy</strong>
          <span>Captain, Straw Hat Pirates</span>
        </span>
      </div>

      <div {...nodeProps("quote", "Quote")} ref={(el) => { nodeRefs.current.quote = el; }} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag} onClickCapture={onClickCapture} onKeyDown={onKeyDown}>
        <span className="hb-tag">Quote</span>
        <q>I&apos;m gonna be King of the Pirates!</q>
      </div>

      <div {...nodeProps("note", "Note")} ref={(el) => { nodeRefs.current.note = el; }} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={endDrag} onPointerCancel={endDrag} onClickCapture={onClickCapture} onKeyDown={onKeyDown}>
        <span className="hb-tag">Note</span>
        A story about freedom, friendship, and one guy&apos;s refusal to listen to reason.
      </div>

      <span className="hb-hint">Drag the nodes</span>
    </div>
  );
}
