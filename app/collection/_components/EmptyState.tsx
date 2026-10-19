import CoverPlaceholder from "./CoverPlaceholder";

export default function EmptyState({ variant }: { variant: "empty" | "no-results" }) {
  if (variant === "empty") {
    return (
      <div className="empty-state" style={{ marginTop: "3rem" }}>
        <div className="empty-icon"><CoverPlaceholder /></div>
        <div className="empty-title">Your vault is empty</div>
        <div className="empty-sub">Hit "+ Add Entry" and start building your collection!</div>
      </div>
    );
  }

  return (
    <div className="empty-state" style={{ marginTop: "3rem" }}>
      <div className="empty-icon">
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <circle cx="10" cy="10" r="7"/>
          <line x1="15.5" y1="15.5" x2="21" y2="21"/>
          <line x1="10" y1="7" x2="10" y2="13"/>
          <line x1="7" y1="10" x2="13" y2="10"/>
        </svg>
      </div>
      <div className="empty-title">No Results Found</div>
      <div className="empty-sub">Try a different search or filter.</div>
    </div>
  );
}
