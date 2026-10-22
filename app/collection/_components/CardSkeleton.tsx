// Placeholder grid shown while the collection loads from the server.
export default function CardSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div aria-busy="true" aria-label="Loading collection">
      <div className="section-header">
        <span className="skeleton-bar" style={{ width: 120 }} />
        <span className="section-line"></span>
      </div>
      <div className="card-grid">
        {Array.from({ length: count }, (_, i) => (
          <div className="card skeleton-card" key={i}>
            <div className="skeleton-cover" />
            <div className="skeleton-body">
              <span className="skeleton-bar" style={{ width: "80%" }} />
              <span className="skeleton-bar" style={{ width: "45%" }} />
              <span className="skeleton-bar" style={{ width: "60%" }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
