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

export default function EntryCard({
  entry, rank, onEdit, onDelete,
}: {
  entry: Entry; rank: number;
  onEdit: (id: string) => void;
  onDelete: (id: string) => void;
}) {
  const isTop = rank <= 3 && entry.rating >= 4;
  const isPlanTo = entry.status === "plan-to";
  return (
    <div className="card" data-type={entry.type} data-id={entry.id}>
      {!isPlanTo && <div className="drag-handle" title="Drag to reorder" aria-label="Drag handle"></div>}
      <div className="card-cover-wrap">
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
