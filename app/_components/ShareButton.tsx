"use client";

import { useEffect, useRef, useState } from "react";
import Toast from "@/app/_components/Toast";

// Copies the current page's address (or `path` on this site) to the clipboard.
export default function ShareButton({ path, className = "btn btn-ghost", children = "Share" }: { path?: string; className?: string; children?: React.ReactNode }) {
  const [note, setNote] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const copy = async () => {
    const url = path ? new URL(path, window.location.origin).href : window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setNote("Link copied");
    } catch {
      setNote("Couldn't copy the link");
    }
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setNote(null), 2200);
  };

  return (
    <>
      <button type="button" className={className} onClick={copy}>{children}</button>
      <Toast message={note} />
    </>
  );
}
