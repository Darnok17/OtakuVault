import type { Entry } from "@/lib/types";

export default function ProgressBar({ entry }: { entry: Entry }) {
  const hasProgress = (entry.status === "watching" || entry.status === "dropped") && (entry.progressCurrent || entry.progressTotal);
  if (!hasProgress) return <div className="card-progress card-progress-empty" aria-hidden="true"></div>;
  const cur = entry.progressCurrent || 0;
  const total = entry.progressTotal || 0;
  const pct = total > 0 ? Math.min(100, (cur / total) * 100) : null;
  const label = total > 0 ? `${cur} / ${total}` : `${cur} done`;
  return (
    <div className="card-progress">
      <div className="card-progress-label">Progress: {label}</div>
      {pct !== null && (
        <div className="progress-bar-track">
          <div className="progress-bar-fill" style={{ width: `${pct}%` }}></div>
        </div>
      )}
    </div>
  );
}
