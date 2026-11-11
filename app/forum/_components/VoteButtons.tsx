"use client";

import { useEffect, useRef, useState } from "react";
import Toast from "@/app/_components/Toast";
import { votePost } from "@/app/actions/forum";

const Arrow = ({ down }: { down?: boolean }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" style={down ? { transform: "rotate(180deg)" } : undefined}>
    <path d="M12 19V5" /><path d="M5 12l7-7 7 7" />
  </svg>
);

// Up/down vote with the score between. Clicking your current vote again clears it. The count
// changes at once and is corrected (or rolled back, with a message) when the server answers.
export default function VoteButtons({ postId, score, myVote, disabled = false, row = false }: { postId: string; score: number; myVote: number; disabled?: boolean; row?: boolean }) {
  const [state, setState] = useState({ score, myVote });
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);

  const cast = async (v: 1 | -1) => {
    if (busy || disabled) return;
    const before = state;
    const next = before.myVote === v ? 0 : v;
    setState({ score: before.score - before.myVote + next, myVote: next });
    setBusy(true);
    const res = await votePost(postId, next).catch(() => ({ ok: false as const, error: "That vote didn't register. Try again." }));
    setBusy(false);
    if (res.ok) return setState({ score: res.score, myVote: res.myVote });
    setState(before);
    clearTimeout(timer.current);
    setNote(res.error);
    timer.current = setTimeout(() => setNote(null), 2600);
  };

  return (
    <div className={`vote${row ? " row" : ""}`} data-vote={state.myVote || undefined}>
      <button type="button" className="vote-btn up" aria-pressed={state.myVote === 1} aria-label="Upvote" disabled={disabled} onClick={() => cast(1)}><Arrow /></button>
      <span className="vote-score" aria-label={`${state.score} point${state.score === 1 ? "" : "s"}`}>{state.score}</span>
      <button type="button" className="vote-btn down" aria-pressed={state.myVote === -1} aria-label="Downvote" disabled={disabled} onClick={() => cast(-1)}><Arrow down /></button>
      <Toast message={note} />
    </div>
  );
}
