import Link from "next/link";
import BoardPreview from "@/app/_components/BoardPreview";
import { entryHref, type ProfileBoard, type ResolvedPin } from "@/lib/profile";
import type { Entry } from "@/lib/types";

const cssUrl = (url: string) => `url(${JSON.stringify(url)})`;
const stars = (rating: number) => (rating > 0 ? `★ ${rating % 1 ? rating.toFixed(1) : rating}` : "Unrated");

// A collection entry as a poster: the same card the Index uses, without the add button.
// Entries linked to AniList open their title page; hand-made ones are not clickable.
export function EntryPoster({ entry, progress = false }: { entry: Entry; progress?: boolean }) {
  const href = entryHref(entry);
  const pct = entry.progressTotal > 0 ? Math.min(100, Math.round((entry.progressCurrent / entry.progressTotal) * 100)) : null;
  return (
    <div className="rec-poster" style={{ "--poster-accent": `var(--${entry.type})` } as React.CSSProperties}>
      {href && <Link className="td-card-link" href={href} aria-label={entry.title} />}
      <div className="rec-poster-cover">
        <div className="rec-poster-glyph">{entry.title.charAt(0)}</div>
        {/* A background (not <img>) so a cover that fails to load leaves the glyph showing. */}
        {entry.imageUrl && <div className="rec-poster-img pf-poster-img" style={{ backgroundImage: cssUrl(entry.imageUrl) }} aria-hidden="true" />}
        {progress && pct !== null && <div className="pf-progress" aria-label={`${pct}% through`}><span style={{ width: `${pct}%` }} /></div>}
      </div>
      <div className="rec-poster-info">
        <div className="rec-poster-title">{entry.title}</div>
        <div className="rec-poster-meta">
          <span className="rec-poster-badge">{entry.type}</span>
          <span className="rec-poster-rating">{progress && entry.progressTotal > 0 ? `${entry.progressCurrent}/${entry.progressTotal}` : stars(entry.rating)}</span>
        </div>
      </div>
    </div>
  );
}

const KIND_LABEL: Record<ResolvedPin["kind"], string> = { entry: "Collection", moodboard: "Moodboard", forum_thread: "Thread", product: "Store" };

export function PinCard({ pin }: { pin: ResolvedPin }) {
  const body = (
    <>
      <div className="pf-pin-art">
        {pin.board ? <BoardPreview board={pin.board} compact />
          : pin.image ? <div className="pf-pin-img" style={{ backgroundImage: cssUrl(pin.image) }} aria-hidden="true" />
          : <span className="pf-pin-glyph ov-glyph" aria-hidden="true">{pin.glyph}</span>}
      </div>
      <div className="pf-pin-text">
        <span className="pf-pin-kind">{KIND_LABEL[pin.kind]}</span>
        <span className="pf-pin-title">{pin.title}</span>
        <span className="pf-pin-sub">{pin.sub}</span>
      </div>
    </>
  );
  const style = { "--pin-accent": `var(--${pin.accent})` } as React.CSSProperties;
  return pin.href
    ? <Link className="pf-pin" data-kind={pin.kind} href={pin.href} style={style}>{body}</Link>
    : <div className="pf-pin" data-kind={pin.kind} style={style}>{body}</div>;
}

export function BoardCard({ b }: { b: ProfileBoard }) {
  return (
    <Link className="pf-board" href={`/boards/${b.entryId}`}>
      <BoardPreview board={b.board} compact />
      <span className="pf-board-title">{b.title}</span>
      <span className="pf-board-sub">{b.board.nodes.length} node{b.board.nodes.length === 1 ? "" : "s"} · {b.type}</span>
    </Link>
  );
}
