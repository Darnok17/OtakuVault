"use client";

import { createPortal } from "react-dom";

// A short status message at the bottom of the screen. Portalled to <body> because a transformed
// ancestor (cards animate with transforms) would otherwise capture its fixed positioning.
export default function Toast({ message }: { message: string | null }) {
  if (!message || typeof document === "undefined") return null;
  return createPortal(<span className="ov-toast visible" role="status" aria-live="polite">{message}</span>, document.body);
}
