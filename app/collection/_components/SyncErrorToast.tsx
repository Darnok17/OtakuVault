"use client";

import { useEffect } from "react";
import { useEntriesStore } from "@/lib/store";

const SHOW_MS = 3500;

// Surfaces a failed (and already reverted) entry write.
export default function SyncErrorToast() {
  const message = useEntriesStore((s) => s.syncError);
  const clear = useEntriesStore((s) => s.clearSyncError);

  useEffect(() => {
    if (!message) return;
    const t = setTimeout(clear, SHOW_MS);
    return () => clearTimeout(t);
  }, [message, clear]);

  return (
    <div className={`sync-toast ${message ? "visible" : ""}`} role="alert" aria-live="assertive">
      <span className="sync-toast-dot" />
      {message}
    </div>
  );
}
