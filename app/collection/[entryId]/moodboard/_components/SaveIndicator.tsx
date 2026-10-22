"use client";

import { useEntriesStore } from "@/lib/store";

// Tiny save status in the canvas corner: "saving…" while a write is in flight, then
// "saved ✓" that fades out; a failed save stays up until a retry succeeds.
export default function SaveIndicator({ entryId }: { entryId: string }) {
  const save = useEntriesStore((s) => s.boardSave[entryId]);
  if (!save || save.status === "pending") return null;

  const label = save.status === "saving" ? "saving…" : save.status === "saved" ? "saved ✓" : "✕ not saved — retrying";
  return (
    // Keyed by the save count so each successful save replays the fade.
    <div key={save.status === "saved" ? save.savedCount : save.status} className="board-save-status" data-status={save.status} role="status" aria-live="polite">
      <span className="board-save-prompt" aria-hidden="true">&gt;</span> {label}
    </div>
  );
}
