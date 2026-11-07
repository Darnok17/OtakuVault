"use client";

import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { authClient } from "@/lib/auth-client";
import { syncEntry } from "@/lib/store";
import { addToCollectionFromAnilist } from "@/app/actions/anilist";
import { badgeFor, glyphFor, hueFor, hueToVar, ratingFor, titleHref, type Title } from "@/lib/anilist-shared";
import { useIndex } from "./IndexProvider";

type AddState = "idle" | "adding" | "added";

function AddButton({ t }: { t: Title }) {
  const { data: session } = authClient.useSession();
  const { notify } = useIndex();
  const [state, setState] = useState<AddState>("idle");

  const add = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (state !== "idle") return;
    if (!session) return notify("Log in to start your collection", { login: true });
    setState("adding");
    try {
      const res = await addToCollectionFromAnilist(t.anilistId, t.entryType, "plan-to");
      if (res.status === "signin") {
        setState("idle");
        return notify("Your session expired — log in again", { login: true });
      }
      setState("added");
      if (res.status === "exists") return notify(`${t.title} is already in your collection`);
      // Keep an already-loaded collection in step so client navigation shows the new card.
      syncEntry(session.user.id, res.entry);
      notify(`Added ${t.title} to your collection`);
    } catch {
      setState("idle");
      notify("Couldn't add that title — try again");
    }
  };

  return (
    <button
      type="button"
      className="rec-poster-add"
      data-state={state}
      disabled={state === "adding"}
      aria-label={state === "added" ? `${t.title} is in your collection` : `Add ${t.title} to collection`}
      onClick={add}
    >
      {state === "added" ? "✓" : state === "adding" ? "…" : "+"}
      <span className="rec-poster-add-label">{state === "added" ? "In Collection" : state === "adding" ? "Adding" : "Add to Collection"}</span>
    </button>
  );
}

// Server-rendered covers can fail before hydration attaches onError; catch those on mount.
const hideIfBroken = (img: HTMLImageElement | null) => {
  if (img?.complete && !img.naturalWidth) img.style.display = "none";
};

export function PosterCard({ t, rank }: { t: Title; rank?: number }) {
  return (
    <div className="rec-poster" style={{ "--poster-accent": `var(--${hueToVar(hueFor(t))})` } as React.CSSProperties}>
      {/* A stretched link rather than a wrapping one: a button can't legally sit inside an <a>. */}
      <Link className="td-card-link" href={titleHref(t.entryType, t.anilistId)} aria-label={t.title} />
      <div className="rec-poster-cover">
        <div className="rec-poster-glyph">{glyphFor(t)}</div>
        {t.cover && (
          // eslint-disable-next-line @next/next/no-img-element -- remote AniList covers
          <img className="rec-poster-img" src={t.cover} alt="" loading="lazy" ref={hideIfBroken} onError={(e) => { e.currentTarget.style.display = "none"; }} />
        )}
      </div>
      {rank && rank <= 3 && <div className="rec-poster-rank">#{rank}</div>}
      <AddButton t={t} />
      <div className="rec-poster-info">
        <div className="rec-poster-title">{t.title}</div>
        <div className="rec-poster-meta">
          <span className="rec-poster-badge">{badgeFor(t)}</span>
          <span className="rec-poster-rating">{ratingFor(t)}</span>
        </div>
      </div>
    </div>
  );
}

// Scrolling rail with arrows. Renders poster cards from `items`, or `children` for other card
// types (pass their track class as scrollClassName).
export function RecRow({ items, accent, scrollClassName = "rec-row-scroll", ranked = true, children }: {
  items?: Title[]; accent: string; scrollClassName?: string; ranked?: boolean; children?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const by = () => Math.round((ref.current?.clientWidth || 600) * 0.75);
  return (
    <div className="rec-row" data-accent={accent}>
      <div className="rec-row-track">
        <button className="rec-row-nav rec-row-nav-prev" aria-label="Scroll left" onClick={() => ref.current?.scrollBy({ left: -by(), behavior: "smooth" })}>‹</button>
        <div className={scrollClassName} ref={ref}>
          {items?.map((t, i) => <PosterCard key={t.anilistId} t={t} rank={ranked ? i + 1 : undefined} />)}
          {children}
        </div>
        <button className="rec-row-nav rec-row-nav-next" aria-label="Scroll right" onClick={() => ref.current?.scrollBy({ left: by(), behavior: "smooth" })}>›</button>
      </div>
    </div>
  );
}
