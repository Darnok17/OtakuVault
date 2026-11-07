"use client";

import { Children, useState, type ReactNode } from "react";

// A grid that shows its first `initial` children and reveals the rest on demand.
export default function ShowMore({ initial, label, className, children }: {
  initial: number; label: string; className: string; children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const items = Children.toArray(children);
  return (
    <>
      <div className={className}>{open ? items : items.slice(0, initial)}</div>
      {items.length > initial && (
        <button type="button" className="td-more" aria-expanded={open} onClick={() => setOpen(!open)}>
          {open ? "Show less" : `${label} (${items.length - initial})`}
        </button>
      )}
    </>
  );
}
