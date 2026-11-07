"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { addToCollectionFromAnilist } from "@/app/actions/anilist";
import { updateEntryAction } from "@/app/actions/entries";
import { useIndex } from "@/app/index-page/_components/IndexProvider";
import { syncEntry } from "@/lib/store";
import type { Entry, EntryStatus, EntryType } from "@/lib/types";

const STATUSES: EntryStatus[] = ["plan-to", "watching", "completed", "on-hold", "dropped"];

function statusLabel(status: EntryStatus, type: EntryType) {
  const anime = type === "anime";
  return {
    "plan-to": anime ? "Plan to Watch" : "Plan to Read",
    watching: anime ? "Watching" : "Reading",
    completed: "Completed",
    "on-hold": "On Hold",
    dropped: "Dropped",
  }[status];
}

function StatusMenu({ label, type, current, busy, primary, onPick }: {
  label: string; type: EntryType; current?: EntryStatus; busy: boolean; primary?: boolean; onPick: (s: EntryStatus) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);

  return (
    <div className="td-menu" ref={ref}>
      <button type="button" className={`btn ${primary ? "btn-primary" : "btn-ghost"}`} aria-haspopup="menu" aria-expanded={open} disabled={busy} onClick={() => setOpen(!open)}>
        {busy ? "Saving…" : label} ▾
      </button>
      {open && (
        <div className="td-menu-list" role="menu">
          {STATUSES.filter((s) => s !== current).map((s) => (
            <button key={s} type="button" role="menuitem" className="td-menu-item" onClick={() => { setOpen(false); onPick(s); }}>{statusLabel(s, type)}</button>
          ))}
        </div>
      )}
    </div>
  );
}

// `userId` is null when signed out. The server works out the initial entry, so the row renders
// in its final state with no flash.
export default function TitleActions({ anilistId, type, title, userId, initialEntry }: {
  anilistId: number; type: EntryType; title: string; userId: string | null; initialEntry: Entry | null;
}) {
  const { notify } = useIndex();
  const [entry, setEntry] = useState(initialEntry);
  const [busy, setBusy] = useState(false);

  const add = async (status: EntryStatus) => {
    setBusy(true);
    try {
      const res = await addToCollectionFromAnilist(anilistId, type, status);
      if (res.status === "signin") return notify("Your session expired — log in again", { login: true });
      setEntry(res.entry);
      if (res.status === "exists") return notify(`${title} is already in your collection`);
      if (userId) syncEntry(userId, res.entry);
      notify(`Added ${title} to your collection`);
    } catch {
      notify("Couldn't add that title — try again");
    } finally {
      setBusy(false);
    }
  };

  const changeStatus = async (status: EntryStatus) => {
    if (!entry) return;
    setBusy(true);
    try {
      const saved = await updateEntryAction({ ...entry, status });
      setEntry(saved);
      if (userId) syncEntry(userId, saved);
      notify(`Moved to ${statusLabel(status, type)}`);
    } catch {
      notify("Couldn't update the status — try again");
    } finally {
      setBusy(false);
    }
  };

  const share = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      notify("Link copied to clipboard");
    } catch {
      notify("Couldn't copy the link");
    }
  };

  return (
    <div className="td-actions">
      {entry ? (
        <>
          <span className="td-in-collection">In Collection — {statusLabel(entry.status, type)}</span>
          <StatusMenu label="Change Status" type={type} current={entry.status} busy={busy} onPick={changeStatus} />
          <Link className="btn btn-ghost" href={`/collection?edit=${entry.id}`}>Edit</Link>
          <Link className="btn btn-ghost" href={`/collection/${entry.id}/moodboard`}>Open Moodboard</Link>
        </>
      ) : userId ? (
        <StatusMenu label="Add to Collection" type={type} busy={busy} primary onPick={add} />
      ) : (
        <button type="button" className="btn btn-primary" onClick={() => notify("Log in to track titles", { login: true })}>Add to Collection</button>
      )}
      <button type="button" className="btn btn-ghost" onClick={share}>Share</button>
    </div>
  );
}
