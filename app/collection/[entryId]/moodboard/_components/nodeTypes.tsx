import type { ReactNode } from "react";
import type { MoodNodeType } from "@/lib/types";

type NodeTypeDef = {
  label: string;
  // Matches the .bc[data-type] width in globals.css; used to center freshly spawned nodes.
  width: number;
  icon: ReactNode;
};

const svg = (children: ReactNode) => (
  <svg viewBox="0 0 24 24" aria-hidden="true">{children}</svg>
);

// Palette order matches the original toolbar. Colors live in CSS (.bc[data-type] / .board-tool[data-tool]).
export const NODE_TYPES: Record<MoodNodeType, NodeTypeDef> = {
  note: {
    label: "Note", width: 220,
    icon: svg(<><path d="M5 3h10l4 4v14H5z" /><path d="M15 3v4h4" /><path d="M8 12h8M8 16h6" /></>),
  },
  image: {
    label: "Image", width: 220,
    icon: svg(<><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="15.5" cy="9" r="1.6" /><path d="M3 17l5-5 4 3 4-4 5 5" /></>),
  },
  quote: {
    label: "Quote", width: 260,
    icon: svg(<><path d="M5 17c0-4 1-7 5-9" /><path d="M5 17h4v-4H5" /><path d="M14 17c0-4 1-7 5-9" /><path d="M14 17h4v-4h-4" /></>),
  },
  link: {
    label: "Link", width: 240,
    icon: svg(<><path d="M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1" /><path d="M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1" /></>),
  },
  character: {
    label: "Character", width: 200,
    icon: svg(<><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></>),
  },
  episode: {
    label: "Episode", width: 240,
    icon: svg(<><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M8 2l4 4 4-4" /><path d="M10 10l4 2.5-4 2.5z" /></>),
  },
  bubble: {
    label: "Bubble", width: 180,
    icon: svg(<><path d="M4 5h16v11H9l-5 4z" /></>),
  },
  custom: {
    label: "Custom", width: 240,
    icon: svg(<><path d="M12 3l2.4 5.6L20 9.5l-4.3 3.9L17 19l-5-2.9L7 19l1.3-5.6L4 9.5l5.6-.9z" /></>),
  },
};

export const NODE_TYPE_ORDER = Object.keys(NODE_TYPES) as MoodNodeType[];

// Bubble and custom node theming, as in the original (keys match data-color in globals.css).
export const BUBBLE_COLORS = ["teal", "crimson", "violet", "gold", "azure", "orange"] as const;
export const BUBBLE_STYLES = [
  { id: "pill", icon: "●", label: "Pill" },
  { id: "tag", icon: "▭", label: "Tag" },
  { id: "banner", icon: "▶", label: "Banner" },
  { id: "minimal", icon: "—", label: "Minimal" },
] as const;
export const CUSTOM_COLORS = [...BUBBLE_COLORS, "rose", "lime"] as const;
export const CUSTOM_ICONS = ["✦", "★", "♥", "⚔", "☯", "♪", "☀", "☾", "⚡", "❀"] as const;

// Hex colors for wire gradients (the same hues as the CSS type accents and swatches).
const TYPE_COLORS: Record<MoodNodeType, string> = {
  note: "#00d4aa", image: "#e94560", quote: "#f5c842", link: "#9b73dc",
  character: "#5aa9e6", episode: "#f59e42", bubble: "#00d4aa", custom: "#00d4aa",
};
const SWATCH_HEX: Record<string, string> = {
  teal: "#00d4aa", crimson: "#e94560", violet: "#9b73dc", gold: "#f5c842",
  azure: "#5aa9e6", orange: "#f59e42", rose: "#ec7bb4", lime: "#9bdc5a",
};

export function nodeColor(node: { type: MoodNodeType; data: Record<string, string> }) {
  if (node.type === "bubble" || node.type === "custom") return SWATCH_HEX[node.data.color] ?? TYPE_COLORS[node.type];
  return TYPE_COLORS[node.type];
}
