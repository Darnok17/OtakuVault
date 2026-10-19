export default function Stars({ rating }: { rating: number }) {
  const r = Number(rating) || 0;
  return (
    <span className="stars-display">
      {[1,2,3,4,5].map((i) => {
        const cls = r >= i ? "full" : r >= i - 0.5 ? "half" : "";
        return (
          <span key={i} className={`star-cell ${cls}`}>
            <span className="star-bg">★</span>
            <span className="star-on">★</span>
          </span>
        );
      })}
    </span>
  );
}
