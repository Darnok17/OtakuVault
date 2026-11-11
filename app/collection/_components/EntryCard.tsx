"use client";

import type { MouseEvent, ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { titleHref } from "@/lib/anilist-shared";
import type { Entry, EntryStatus } from "@/lib/types";
import PinButton from "@/app/_components/PinButton";
import CoverPlaceholder from "./CoverPlaceholder";
import ProgressBar from "./ProgressBar";
import Stars from "./Stars";

const STATUS_LABELS: Record<EntryStatus, string> = {
  completed: "Completed",
  watching: "Watching/Reading",
  "on-hold": "On Hold",
  "plan-to": "Plan To",
  dropped: "Dropped",
};

type CardProps = {
  entry: Entry; rank: number;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
};

// Icon buttons sit beside (not inside) the card link, but still swallow the event
// so nothing underneath ever treats the click as a moodboard open.
const guard = (fn: () => void) => (e: MouseEvent) => { e.preventDefault(); e.stopPropagation(); fn(); };

function InfoIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </svg>
  );
}

// The visual card. Also rendered on its own as the floating drag overlay.
export function CardFace({
  entry, rank, onEdit, onDelete, moodboardHref, onInfo, handle, className = "",
}: CardProps & { moodboardHref?: string; onInfo?: () => void; handle?: ReactNode; className?: string }) {
  const isTop = rank <= 3 && entry.rating >= 4;
  const isPlanTo = entry.status === "plan-to";
  const linked = entry.anilistId != null;
  return (
    <div className={`card ${className}`} data-type={entry.type} data-id={entry.id}>
      {/* Stretched link: the whole card is one tab stop that opens the moodboard.
          Action buttons are siblings layered above it, so the markup stays valid. */}
      {moodboardHref && (
        <Link href={moodboardHref} className="card-link" aria-label={`Open moodboard for ${entry.title}`} />
      )}
      {handle}
      <div className="card-cover-wrap">
        {entry.imageUrl
          // eslint-disable-next-line @next/next/no-img-element -- user-supplied URLs from any host; next/image would need every host allow-listed
          ? <img className="card-cover" src={entry.imageUrl} alt="" loading="lazy" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
          : <CoverPlaceholder />}
      </div>
      <div className="card-type-stripe"></div>
      <div className="card-actions">
        <button
          className={`icon-btn ${linked ? "" : "is-disabled"}`}
          onClick={guard(() => { if (linked) onInfo?.(); })}
          title={linked ? "View title details" : "Not linked to AniList"}
          aria-label={linked ? `View details for ${entry.title}` : "Title details unavailable: not linked to AniList"}
          aria-disabled={!linked || undefined}
          type="button"
        ><InfoIcon /></button>
        <PinButton kind="entry" targetId={entry.id} label={entry.title} className="icon-btn" />
        <button className="icon-btn" onClick={guard(() => onEdit(entry.id))} title="Edit" aria-label={`Edit ${entry.title}`} type="button">✎</button>
        <button className="icon-btn del" onClick={guard(() => onDelete(entry.id))} title="Delete" aria-label={`Delete ${entry.title}`} type="button">✕</button>
      </div>
      <div className="card-body">
        <div className="card-title">{entry.title}</div>
        <div className="card-meta">
          <span className={`badge badge-type-${entry.type}`}>{entry.type}</span>
          <span className="badge badge-status">{STATUS_LABELS[entry.status]}</span>
          {entry.genre && <span className="badge badge-genre">{entry.genre}</span>}
        </div>
        {entry.totalEps && <div className="card-eps">{entry.totalEps}</div>}
        <ProgressBar entry={entry} />
        {entry.notes && <div className="card-notes">{entry.notes}</div>}
        {!isPlanTo && (
          <div className="card-footer">
            <div className="stars"><Stars rating={entry.rating} /></div>
            <span className={`rank-badge ${isTop ? "top" : ""}`}>#{rank}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default function EntryCard({
  draggable, ...props
}: CardProps & { draggable: boolean }) {
  const { entry } = props;
  const router = useRouter();
  const {
    attributes, listeners, setNodeRef, setActivatorNodeRef, transform, isDragging,
  } = useSortable({
    id: entry.id,
    data: { tier: entry.rating },
    disabled: !draggable,
    // Framer Motion animates the settle after a drop; dnd-kit's own would fight it.
    animateLayoutChanges: () => false,
  });

  // dnd-kit moves the outer slot; the inner motion layer FLIPs between those positions.
  return (
    <div ref={setNodeRef} className="card-slot" style={{ transform: CSS.Translate.toString(transform) }}>
      <motion.div
        className="card-motion"
        layout="position"
        initial={{ opacity: 0, scale: 0.92 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.92, transition: { duration: 0.18 } }}
        transition={{ type: "spring", stiffness: 500, damping: 40 }}
      >
        <CardFace
          {...props}
          moodboardHref={`/collection/${entry.id}/moodboard`}
          onInfo={() => { if (entry.anilistId != null) router.push(titleHref(entry.type, entry.anilistId)); }}
          className={isDragging ? "drag-source" : ""}
          handle={draggable && (
            <div
              ref={setActivatorNodeRef}
              className="drag-handle"
              title="Drag to reorder"
              {...attributes}
              {...listeners}
              aria-label={`Reorder ${entry.title}`}
            ></div>
          )}
        />
      </motion.div>
    </div>
  );
}
