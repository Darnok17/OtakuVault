import type { MoodNode, MoodNodeType, Moodboard } from "@/lib/types";

// A read-only picture of a moodboard: every node and wire, scaled to fit its container. Used for
// thumbnails on profiles and for boards shared in the forum. Node heights aren't stored, so
// they are estimated per type; that is close enough for a view nobody edits.

const SIZE: Record<MoodNodeType, [w: number, h: number]> = {
  note: [220, 140], image: [220, 230], quote: [260, 140], link: [240, 110],
  character: [200, 290], episode: [240, 160], bubble: [180, 56], custom: [240, 140],
};
const TYPE_COLOR: Record<MoodNodeType, string> = {
  note: "var(--acc-3)", image: "var(--anime)", quote: "var(--gold)", link: "var(--violet)",
  character: "var(--azure)", episode: "var(--orange)", bubble: "var(--acc-3)", custom: "var(--acc-3)",
};
const SWATCH: Record<string, string> = {
  teal: "var(--acc-3)", crimson: "var(--anime)", violet: "var(--violet)", gold: "var(--gold)",
  azure: "var(--azure)", orange: "var(--orange)", rose: "var(--rose)", lime: "#9bdc5a",
};
const LABEL: Record<MoodNodeType, string> = {
  note: "Note", image: "Image", quote: "Quote", link: "Link", character: "Character", episode: "Episode", bubble: "", custom: "Custom",
};
const colorOf = (n: MoodNode) => ((n.type === "bubble" || n.type === "custom") && SWATCH[n.data.color]) || TYPE_COLOR[n.type];
// Only show images we host or plain http(s) URLs.
const img = (url?: string) => (url && /^(https?:\/\/|\/uploads\/|data:image\/)/.test(url) ? url : null);

function NodeBody({ n }: { n: MoodNode }) {
  const d = n.data;
  switch (n.type) {
    case "image": return <>{img(d.url) && <span className="bp-img" style={{ backgroundImage: `url(${JSON.stringify(img(d.url))})` }} />}{d.caption && <span className="bp-text">{d.caption}</span>}</>;
    case "character": return <>{img(d.image) && <span className="bp-img tall" style={{ backgroundImage: `url(${JSON.stringify(img(d.image))})` }} />}<strong>{d.name || "Unnamed"}</strong>{d.role && <span className="bp-dim">{d.role}</span>}{d.desc && <span className="bp-text">{d.desc}</span>}</>;
    case "quote": return <><em className="bp-text">“{d.text}”</em>{d.source && <span className="bp-dim">— {d.source}</span>}</>;
    case "episode": return <><strong>{[d.number, d.title].filter(Boolean).join(" · ") || "Episode"}</strong>{d.notes && <span className="bp-text">{d.notes}</span>}</>;
    case "link": return <><strong>{d.title || "Link"}</strong>{d.url && <span className="bp-dim">{d.url.replace(/^https?:\/\//, "")}</span>}</>;
    default: return <span className="bp-text">{n.type === "custom" && d.icon ? `${d.icon} ` : ""}{d.text}</span>;
  }
}

export default function BoardPreview({ board, compact = false, className = "" }: { board: Moodboard; compact?: boolean; className?: string }) {
  const nodes = board.nodes;
  if (!nodes.length) return <div className={`bp bp-empty ${className}`}>Empty board</div>;
  const pad = 40;
  const minX = Math.min(...nodes.map((n) => n.x)) - pad, minY = Math.min(...nodes.map((n) => n.y)) - pad;
  const maxX = Math.max(...nodes.map((n) => n.x + SIZE[n.type][0])) + pad, maxY = Math.max(...nodes.map((n) => n.y + SIZE[n.type][1])) + pad;
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const centre = (n: MoodNode) => [n.x + SIZE[n.type][0] / 2, n.y + SIZE[n.type][1] / 2] as const;
  return (
    <svg className={`bp ${compact ? "compact" : ""} ${className}`} viewBox={`${minX} ${minY} ${maxX - minX} ${maxY - minY}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={`Moodboard with ${nodes.length} node${nodes.length === 1 ? "" : "s"}`}>
      {board.wires.map((w) => {
        const a = byId.get(w.from), b = byId.get(w.to);
        if (!a || !b) return null;
        const [x1, y1] = centre(a), [x2, y2] = centre(b);
        const bend = Math.max(40, Math.abs(x2 - x1) * 0.45);
        return <path key={w.id} className="bp-wire" d={`M${x1},${y1} C${x1 + bend},${y1} ${x2 - bend},${y2} ${x2},${y2}`} style={{ stroke: colorOf(a) }} />;
      })}
      {nodes.map((n) => {
        const [w, h] = SIZE[n.type];
        return compact ? (
          <rect key={n.id} className="bp-block" x={n.x} y={n.y} width={w} height={h} rx={n.type === "bubble" ? h / 2 : 10} style={{ stroke: colorOf(n), fill: `color-mix(in oklab, ${colorOf(n)} 22%, var(--surface-elevated))` }} />
        ) : (
          <foreignObject key={n.id} x={n.x} y={n.y} width={w} height={h}>
            <div className={`bp-node bp-${n.type}`} style={{ "--c": colorOf(n) } as React.CSSProperties}>
              {LABEL[n.type] && <span className="bp-tag">{LABEL[n.type]}</span>}
              <NodeBody n={n} />
            </div>
          </foreignObject>
        );
      })}
    </svg>
  );
}
