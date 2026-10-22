"use client";

import { memo, useRef, useState, type ChangeEvent } from "react";
import type { MoodNode } from "@/lib/types";
import { uploadImageFile } from "@/lib/image";
import { BUBBLE_COLORS, BUBBLE_STYLES, CUSTOM_COLORS, CUSTOM_ICONS, NODE_TYPES } from "./nodeTypes";

type Patch = (patch: Record<string, string>) => void;

// Grows the textarea to fit its content (.bc-edit hides overflow).
const autosize = (el: HTMLTextAreaElement | null) => {
  if (!el) return;
  el.style.height = "auto";
  el.style.height = el.scrollHeight + "px";
};

function Area({ field, data, onPatch, className = "", placeholder, rows = 2 }: {
  field: string; data: MoodNode["data"]; onPatch: Patch;
  className?: string; placeholder: string; rows?: number;
}) {
  return (
    <textarea
      ref={autosize}
      className={`bc-edit ${className}`}
      rows={rows}
      placeholder={placeholder}
      value={data[field] ?? ""}
      onChange={(e) => { onPatch({ [field]: e.target.value }); autosize(e.target); }}
    />
  );
}

function Line({ field, data, onPatch, className = "", placeholder, style }: {
  field: string; data: MoodNode["data"]; onPatch: Patch;
  className?: string; placeholder: string; style?: React.CSSProperties;
}) {
  return (
    <input
      type="text"
      className={`bc-edit ${className}`}
      placeholder={placeholder}
      value={data[field] ?? ""}
      onChange={(e) => onPatch({ [field]: e.target.value })}
      style={style}
    />
  );
}

// Click-to-upload image slot. The file goes to storage first; the node keeps only its URL,
// and only once the upload succeeds (a failure leaves the slot as it was).
function ImageSlot({ field, data, onPatch, className, empty }: {
  field: string; data: MoodNode["data"]; onPatch: Patch; className: string; empty: React.ReactNode;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState("");
  const src = data[field];
  const pick = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || status) return;
    setError("");
    try {
      onPatch({ [field]: await uploadImageFile(file, "moodboard", (s) => setStatus(s === "preparing" ? "preparing…" : "uploading…")) });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setStatus(null);
    }
  };
  return (
    <>
      <div className={`${className} ${src ? "loaded" : ""} ${status ? "uploading" : ""}`} aria-busy={!!status} onClick={() => input.current?.click()}>
        {src ? <img src={src} alt="" draggable={false} /> : empty}
        {(status || error) && (
          <span className={`bc-upload-status ${error ? "error" : ""}`} role={error ? "alert" : "status"}>
            &gt; {status ?? error}
          </span>
        )}
      </div>
      <input ref={input} type="file" accept="image/*" hidden onChange={pick} />
    </>
  );
}

const bubbleColor = (n: MoodNode) => n.data.color || "teal";
const bubbleStyle = (n: MoodNode) => n.data.bstyle || "pill";
const customColor = (n: MoodNode) => n.data.color || "teal";
const customIcon = (n: MoodNode) => n.data.icon || CUSTOM_ICONS[0];
const nextIcon = (n: MoodNode) =>
  CUSTOM_ICONS[(CUSTOM_ICONS.indexOf(customIcon(n) as (typeof CUSTOM_ICONS)[number]) + 1) % CUSTOM_ICONS.length];

// Only real web links become clickable (no javascript: and friends).
const safeHref = (url: string | undefined) => (url && /^https?:\/\//i.test(url) ? url : null);

function OpenLink({ url }: { url: string | undefined }) {
  const href = safeHref(url);
  if (!href) return null;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="bc-open-link">↗ Open</a>
  );
}

function Body({ node, onPatch }: { node: MoodNode; onPatch: Patch }) {
  const p = { data: node.data, onPatch };
  switch (node.type) {
    case "note":
      return <div className="bc-body"><Area {...p} field="text" placeholder="Write a note…" rows={4} /></div>;
    case "quote":
      return (
        <div className="bc-body">
          <Area {...p} field="text" className="quote" placeholder="A memorable line…" rows={3} />
          <Line {...p} field="source" className="src" placeholder="who said it / which episode" />
        </div>
      );
    case "image":
      return (
        <div className="bc-body" style={{ padding: 0 }}>
          <ImageSlot {...p} field="url" className="bc-image-slot" empty={<span>Click to upload image</span>} />
          <Line {...p} field="caption" className="caption" placeholder="Caption…" style={{ padding: ".45rem .6rem" }} />
        </div>
      );
    case "character":
      return (
        <div className="bc-body" style={{ padding: 0 }}>
          <ImageSlot {...p} field="image" className="bc-char-portrait" empty={<span className="char-placeholder" style={{ fontSize: "2.2rem" }}>👤</span>} />
          <div style={{ padding: ".5rem .65rem" }}>
            <Line {...p} field="name" className="name" placeholder="Name" />
            <Line {...p} field="role" className="role" placeholder="Role" />
            <Area {...p} field="desc" className="desc" placeholder="Short description…" rows={3} />
          </div>
        </div>
      );
    case "episode":
      return (
        <div className="bc-body">
          <div className="bc-ep-head">
            <Line {...p} field="number" className="epnum" placeholder="E1" />
            <Line {...p} field="title" className="eptitle" placeholder="Episode title" />
          </div>
          <Area {...p} field="notes" className="epnotes" placeholder="Thoughts on this episode…" rows={3} />
        </div>
      );
    case "bubble":
      // No header: the bubble's padding is its drag handle, Delete key removes it.
      return (
        <>
          <div className="bc-body" data-drag-handle>
            <Area {...p} field="text" placeholder="Label…" rows={1} />
          </div>
          <div className="bubble-controls">
            <div className="bubble-swatches">
              {BUBBLE_COLORS.map((c) => (
                <button key={c} type="button" className={`bc-color-sw ${bubbleColor(node) === c ? "active" : ""}`}
                  data-set-color={c} title={c} aria-label={c} onClick={() => onPatch({ color: c })}></button>
              ))}
            </div>
            <div className="bubble-divider"></div>
            <div className="bubble-styles">
              {BUBBLE_STYLES.map((st) => (
                <button key={st.id} type="button" className={`bc-style-btn ${bubbleStyle(node) === st.id ? "active" : ""}`}
                  title={st.label} onClick={() => onPatch({ bstyle: st.id })}>{st.icon}</button>
              ))}
            </div>
          </div>
        </>
      );
    case "custom":
      return (
        <>
          <div className="bc-body"><Area {...p} field="text" placeholder="Anything goes…" rows={3} /></div>
          <div className="custom-controls">
            <div className="custom-swatches">
              {CUSTOM_COLORS.map((c) => (
                <button key={c} type="button" className={`cc-sw ${customColor(node) === c ? "active" : ""}`}
                  data-set-color={c} title={c} aria-label={c} onClick={() => onPatch({ color: c })}></button>
              ))}
            </div>
            <div className="cc-divider"></div>
            <button type="button" className="cc-icon-btn" title="Next icon" onClick={() => onPatch({ icon: nextIcon(node) })}>Icon</button>
          </div>
        </>
      );
    case "link":
      return (
        <div className="bc-body">
          <Line {...p} field="title" className="linktitle" placeholder="Title…" />
          <Line {...p} field="url" className="linkurl" placeholder="https://…" />
          <OpenLink url={node.data.url} />
        </div>
      );
  }
}

function BoardNode({
  node, dx, dy, selected, dragging, connectTarget, onPatch, onDelete, registerEl,
}: {
  node: MoodNode;
  dx: number; dy: number;
  selected: boolean;
  dragging: boolean;
  connectTarget: boolean;
  onPatch: (id: string, patch: Record<string, string>) => void;
  onDelete: (id: string) => void;
  registerEl: (id: string, el: HTMLDivElement | null) => void;
}) {
  return (
    <div
      ref={(el) => registerEl(node.id, el)}
      className={`bc ${selected ? "selected" : ""} ${dragging ? "dragging" : ""} ${connectTarget ? "connect-target" : ""}`}
      data-type={node.type}
      data-node-id={node.id}
      data-color={node.type === "bubble" ? bubbleColor(node) : node.type === "custom" ? customColor(node) : undefined}
      data-bstyle={node.type === "bubble" ? bubbleStyle(node) : undefined}
      style={{ left: node.x + dx, top: node.y + dy }}
    >
      {node.type === "custom" ? (
        // Custom nodes name themselves: the header label is an editable field.
        <div className="bc-head">
          <span className="bc-custom-icon" title="Next icon" onClick={() => onPatch(node.id, { icon: nextIcon(node) })}>{customIcon(node)}</span>
          <input className="bc-head-input" placeholder="Custom" value={node.data.title ?? ""}
            onChange={(e) => onPatch(node.id, { title: e.target.value })} />
          <button className="bc-del" type="button" title="Delete" onClick={() => onDelete(node.id)}>✕</button>
        </div>
      ) : node.type !== "bubble" && (
        <div className="bc-head">
          <span className="bc-type-dot"></span>
          <span className="bc-type-label">{NODE_TYPES[node.type].label}</span>
          <button className="bc-del" type="button" title="Delete" onClick={() => onDelete(node.id)}>✕</button>
        </div>
      )}
      <Body node={node} onPatch={(patch) => onPatch(node.id, patch)} />
      {/* Edge handles: drag from one onto another node to wire them together */}
      {(["top", "right", "bottom", "left"] as const).map((edge) => (
        <div key={edge} className={`bc-anchor a-${edge}`} data-anchor title="Drag to connect"></div>
      ))}
    </div>
  );
}

export default memo(BoardNode);
