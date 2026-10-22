"use client";

import { createContext, use, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import type { EntryType } from "@/lib/types";

// Shared state between the hero (search box + type chips) and the browse grid that shows
// the results, plus the toast used by "Add to Collection".

type Chip = EntryType | "all";
type Toast = { id: number; text: string; login?: boolean };

type IndexState = {
  query: string;
  setQuery: (q: string) => void;
  chip: Chip;
  setChip: (c: Chip) => void;
  notify: (text: string, opts?: { login?: boolean }) => void;
};

const IndexContext = createContext<IndexState | null>(null);

export function useIndex() {
  const ctx = use(IndexContext);
  if (!ctx) throw new Error("useIndex must be used inside <IndexProvider>");
  return ctx;
}

const TOAST_MS = 3200;

export default function IndexProvider({ children }: { children: ReactNode }) {
  const [query, setQuery] = useState("");
  const [chip, setChip] = useState<Chip>("all");
  const [toast, setToast] = useState<Toast | null>(null);
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const notify = useCallback((text: string, opts?: { login?: boolean }) => {
    clearTimeout(timer.current);
    setToast({ id: Date.now(), text, login: opts?.login });
    setVisible(true);
    timer.current = setTimeout(() => setVisible(false), TOAST_MS);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <IndexContext value={{ query, setQuery, chip, setChip, notify }}>
      {children}
      <div className={`idx-toast ${visible ? "visible" : ""}`} role="status" aria-live="polite">
        {toast && <>
          <span className="idx-toast-text">{toast.text}</span>
          {toast.login && <Link href="/login?redirect=/index-page" className="idx-toast-link">Log In →</Link>}
        </>}
      </div>
    </IndexContext>
  );
}
