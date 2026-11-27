import type { Tone } from "@/lib/title-graph";
import type { EntryStatus, EntryType, ListMark } from "@/lib/types";

// How the title world shows a title that's in the signed-in user's collection: a status ring
// around its disc (WorldScene), a short glyph line under its label, and a line on its focus card.
// Every colour is a theme tone, and each status also differs in shape (full ring, progress arc,
// bare track) and glyph, so they stay apart on Matrix, where every tone is a green.

export const STATUS_TONE: Record<EntryStatus, Tone> = {
  completed: "acc-3", watching: "azure", "on-hold": "orange", "plan-to": "violet", dropped: "rose",
};

const GLYPH: Record<EntryStatus, string> = { completed: "✓", watching: "▶", "on-hold": "‖", "plan-to": "◇", dropped: "✕" };
export const statusGlyph = (status: EntryStatus) => GLYPH[status];

// A saved collection entry as a mark, for live updates from the HUD's list actions.
export const entryMark = (e: { status: EntryStatus; rating: number; progressCurrent: number; progressTotal: number }): ListMark =>
  ({ status: e.status, rating: e.rating, progress: e.progressCurrent, total: e.progressTotal });

export function statusText(status: EntryStatus, type: EntryType) {
  const anime = type === "anime";
  return {
    completed: "Completed", watching: anime ? "Watching" : "Reading", "on-hold": "On hold",
    "plan-to": anime ? "Plan to watch" : "Plan to read", dropped: "Dropped",
  }[status];
}

// How much of the ring is drawn: all of it once completed; progress while watching, on hold or
// dropped (a sliver when progress is unknown, so the arc still reads as started); none if planned.
export function markFraction(m: ListMark) {
  if (m.status === "completed") return 1;
  if (m.status === "plan-to") return 0;
  if (m.total > 0) return Math.min(Math.max(m.progress / m.total, 0.08), 0.95);
  return m.progress > 0 ? 0.25 : 0.08;
}

// Under the label: "✓ ★4.5", "▶ 3/12", "◇".
export function markGlyphs(m: ListMark) {
  const progress = m.status === "watching" || m.status === "on-hold" ? (m.total > 0 ? `${m.progress}/${m.total}` : m.progress > 0 ? `${m.progress}` : "") : "";
  return [GLYPH[m.status], progress, m.rating > 0 ? `★${m.rating}` : ""].filter(Boolean).join(" ");
}

// The focus card's line: "Completed · ★ 4.5 · 24 / 24".
export function markLine(m: ListMark, type: EntryType) {
  return [
    `${GLYPH[m.status]} ${statusText(m.status, type)}`,
    m.rating > 0 ? `★ ${m.rating}` : null,
    m.total > 0 ? `${m.progress} / ${m.total}` : m.progress > 0 ? `${m.progress} so far` : null,
  ].filter(Boolean).join(" · ");
}
