"use client";

import { useState } from "react";

const COLLAPSE_OVER = 400;
const COLLAPSED_LENGTH = 300;

export default function TitleDescription({ paragraphs }: { paragraphs: string[] }) {
  const [open, setOpen] = useState(false);
  const text = paragraphs.join("\n\n");
  const long = text.length > COLLAPSE_OVER;
  // Cut at the last word boundary so the preview doesn't end mid-word.
  const preview = `${text.slice(0, COLLAPSED_LENGTH).replace(/\s+\S*$/, "")}…`;
  const shown = long && !open ? preview.split("\n\n") : paragraphs;
  return (
    <>
      <div className="td-description">{shown.map((p, i) => <p key={i}>{p}</p>)}</div>
      {long && <button type="button" className="td-more" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? "Show less" : "Show more"}</button>}
    </>
  );
}
