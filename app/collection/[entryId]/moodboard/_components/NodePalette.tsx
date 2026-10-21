import type { MoodNodeType } from "@/lib/types";
import { NODE_TYPES, NODE_TYPE_ORDER } from "./nodeTypes";

export default function NodePalette({ onSpawn }: { onSpawn: (type: MoodNodeType) => void }) {
  return (
    <div className="board-toolbar" role="toolbar" aria-label="Add node">
      {NODE_TYPE_ORDER.map((t) => (
        <button key={t} className="board-tool" data-tool={t} type="button" title={`Add ${NODE_TYPES[t].label.toLowerCase()}`} onClick={() => onSpawn(t)}>
          <span className="tool-icon">{NODE_TYPES[t].icon}</span>
          <span className="tool-label">{NODE_TYPES[t].label}</span>
        </button>
      ))}
    </div>
  );
}
