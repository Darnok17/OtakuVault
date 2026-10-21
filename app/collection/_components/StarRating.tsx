"use client";

import { useState, type KeyboardEvent } from "react";

export default function StarRating({
  value, onChange, label = "Rating",
}: {
  value: number;
  onChange: (rating: number) => void;
  label?: string;
}) {
  const r = Number(value) || 0;
  const [hover, setHover] = useState<number | null>(null);
  const shown = hover ?? r;

  // Arrow keys step by half a star; Home/End jump to 0/5.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const next =
      e.key === "ArrowRight" || e.key === "ArrowUp"  ? Math.min(5, r + 0.5) :
      e.key === "ArrowLeft"  || e.key === "ArrowDown" ? Math.max(0, r - 0.5) :
      e.key === "Home" ? 0 :
      e.key === "End"  ? 5 : null;
    if (next === null) return;
    e.preventDefault();
    onChange(next);
  };

  return (
    <div className="star-rating-input">
      <div
        style={{ display: "flex", gap: 2, outline: "none" }}
        role="slider" tabIndex={0}
        aria-label={label} aria-valuemin={0} aria-valuemax={5} aria-valuenow={r}
        aria-valuetext={`${r} out of 5 stars`}
        onMouseLeave={() => setHover(null)}
        onKeyDown={onKeyDown}
      >
        {[1,2,3,4,5].map((i) => {
          const cls = shown >= i ? "full" : shown >= i - 0.5 ? "half" : "";
          return (
            <span key={i} className={`star-unit ${cls}`}>
              <span className="star-bg">★</span>
              <span className="star-on">★</span>
              {[i - 0.5, i].map((v) => (
                <span
                  key={v}
                  className={`zone ${v === i ? "r" : "l"}`}
                  onMouseEnter={() => setHover(v)}
                  onClick={() => onChange(v)}
                />
              ))}
            </span>
          );
        })}
      </div>
      <span className="rating-label">{shown ? `${shown} / 5` : "—"}</span>
      {r > 0 && (
        <button type="button" className="rating-clear" onClick={() => { setHover(null); onChange(0); }}>Clear</button>
      )}
    </div>
  );
}
