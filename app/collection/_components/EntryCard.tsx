"use client";

import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import { motion } from "framer-motion";
import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { Entry, EntryStatus } from "@/lib/types";
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

// The visual card. Also rendered on its own as the floating drag overlay.
export function CardFace({
  entry, rank, onEdit, onDelete, onOpen, handle, className = "",
}: CardProps & { onOpen?: () => void; handle?: ReactNode; className?: string }) {
  const isTop = rank <= 3 && entry.rating >= 4;
  const isPlanTo = entry.status === "plan-to";
  return (
    <div className={`card ${className}`} data-type={entry.type} data-id={entry.id}>
      {handle}
      <div className="card-cover-wrap" onClick={onOpen} title={onOpen ? "Open moodboard" : undefined}>
        {entry.imageUrl
          ? <img className="card-cover" src={entry.imageUrl} alt="" loading="lazy" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
          : <CoverPlaceholder />}
      </div>
      <div className="card-type-stripe"></div>
      <div className="card-actions">
        <button className="icon-btn" onClick={() => onEdit(entry.id)} title="Edit" type="button">✎</button>
        <button className="icon-btn del" onClick={() => onDelete(entry.id)} title="Delete" type="button">✕</button>
      </div>
      <div className="card-body">
        <div className="card-title" onClick={onOpen}>{entry.title}</div>
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
          onOpen={() => router.push(`/collection/${entry.id}/moodboard`)}
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
