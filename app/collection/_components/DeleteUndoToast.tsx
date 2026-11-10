"use client";

import { useState } from "react";
import type { Entry } from "@/lib/types";

export const UNDO_MS = 5000;

export type PendingDelete = { entry: Entry; index: number; expiresAt: number };

export default function DeleteUndoToast({
  items, onUndo,
}: {
  items: PendingDelete[];
  onUndo: (id: string) => void;
}) {
  // Keep the last rows rendered while the toast slides back out.
  const [shown, setShown] = useState(items);
  if (items.length > 0 && items !== shown) setShown(items);
  const visible = items.length > 0;

  return (
    <div className={`undo-toast delete-toast ${visible ? "visible" : ""}`} role="status" aria-live="polite" inert={!visible}>
      {shown.map(({ entry, expiresAt }) => (
        <div className="delete-toast-item" key={entry.id}>
          <div className="toast-row">
            <span className="toast-dot"></span>
            <span className="toast-msg">Deleted <strong>{entry.title}</strong></span>
            <button className="toast-undo" type="button" onClick={() => onUndo(entry.id)}>Undo</button>
          </div>
          <div className="toast-progress-track">
            {/* Negative delay starts the drain part-way through, so the bar stays in step with the
                deadline if the page is hidden and shown again mid-countdown. */}
            <div
              className="toast-progress"
              style={{ animationDuration: `${UNDO_MS}ms` }}
              ref={(el) => { if (el) el.style.animationDelay = `${Math.min(0, expiresAt - Date.now() - UNDO_MS)}ms`; }}
            ></div>
          </div>
        </div>
      ))}
    </div>
  );
}
