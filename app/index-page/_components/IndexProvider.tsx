"use client";

import { createContext, use, useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";

// Shared state between the hero's search box and the browse grid that shows the results, plus
// the toast used by "Add to Collection". Lives in the layout, so both survive tab changes.

// `login` holds the page to come back to after logging in.
type Toast = { id: number; text: string; login?: string };

type IndexState = {
  query: string;
  setQuery: (q: string) => void;
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
  const [toast, setToast] = useState<Toast | null>(null);
  const [visible, setVisible] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const notify = useCallback((text: string, opts?: { login?: boolean }) => {
    clearTimeout(timer.current);
    // Read the address when the toast fires: a usePathname() here would block prerendering of
    // every /index-page route that has a dynamic segment.
    setToast({ id: Date.now(), text, login: opts?.login ? window.location.pathname : undefined });
    setVisible(true);
    timer.current = setTimeout(() => setVisible(false), TOAST_MS);
  }, []);

  useEffect(() => () => clearTimeout(timer.current), []);

  return (
    <IndexContext value={{ query, setQuery, notify }}>
      {children}
      <div className={`idx-toast ${visible ? "visible" : ""}`} role="status" aria-live="polite">
        {toast && <>
          <span className="idx-toast-text">{toast.text}</span>
          {toast.login && <Link href={`/login?redirect=${toast.login}`} className="idx-toast-link">Log In →</Link>}
        </>}
      </div>
    </IndexContext>
  );
}
