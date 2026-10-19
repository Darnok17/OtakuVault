export default function CoverPlaceholder() {
  return (
    <div className="card-cover-placeholder">
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="3" y="4" width="18" height="16" rx="2"/>
        <circle cx="16" cy="9" r="2" fill="currentColor" stroke="none"/>
        <path d="M3 17 L8 12 L12 15 L16 11 L21 16"/>
      </svg>
    </div>
  );
}
