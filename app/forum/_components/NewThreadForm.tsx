"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import ThemedSelect from "@/app/_components/ThemedSelect";
import { createThread, type Attachable } from "@/app/actions/forum";
import { FORUM_CATEGORIES, THREAD_TITLE_MAX, type ForumCategoryId } from "@/lib/forum-shared";
import Composer from "./Composer";

const NONE = "none";
const CAT_OPTIONS = FORUM_CATEGORIES.map((c) => ({ value: c.id, label: c.label, hint: c.blurb }));

export default function NewThreadForm({ attachables, defaultCat }: { attachables: Attachable[]; defaultCat: ForumCategoryId }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [cat, setCat] = useState<ForumCategoryId>(defaultCat);
  const [body, setBody] = useState("");
  const [images, setImages] = useState<string[]>([]);
  const [entryId, setEntryId] = useState(NONE);
  const [boardId, setBoardId] = useState(NONE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const entryOptions = [{ value: NONE, label: "No title attached" }, ...attachables.map((a) => ({ value: a.id, label: a.title, hint: a.type }))];
  const boards = attachables.filter((a) => a.hasBoard);
  const boardOptions = [{ value: NONE, label: boards.length ? "No moodboard attached" : "You have no moodboards yet" }, ...boards.map((a) => ({ value: a.id, label: a.title, hint: "moodboard" }))];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return setError("Give the thread a title.");
    if (!body.trim()) return setError("Write something first.");
    setBusy(true); setError(null);
    const res = await createThread({
      title, body, cat, images,
      attachedEntryId: entryId === NONE ? null : entryId,
      attachedMoodboardEntryId: boardId === NONE ? null : boardId,
    }).catch(() => ({ ok: false as const, error: "Couldn't post the thread. Check your connection and try again." }));
    if (!res.ok) { setBusy(false); return setError(res.error); }
    router.push(`/forum/${res.threadId}`);
  };

  return (
    <form className="ov-panel nt" onSubmit={submit}>
      <div className="nt-top">
        <div className="ov-field">
          <div className="ov-row between">
            <label className="ov-label" htmlFor="nt-title">Title</label>
            <span className="ov-hint">{title.length}/{THREAD_TITLE_MAX}</span>
          </div>
          <input id="nt-title" className="ov-input" value={title} maxLength={THREAD_TITLE_MAX} placeholder="What do you want to talk about?" onChange={(e) => setTitle(e.target.value)} />
        </div>
        <div className="ov-field">
          <span className="ov-label" id="nt-cat-label">Category</span>
          <ThemedSelect variant="field" value={cat} onChange={setCat} options={CAT_OPTIONS} aria-labelledby="nt-cat-label" />
        </div>
      </div>

      <Composer id="nt-body" label="Post" value={body} onChange={setBody} images={images} onImages={setImages} rows={10}
        placeholder="Markdown works. No spoilers in the title; warn before them in here." />

      <div className="nt-attach">
        <div className="ov-field">
          <span className="ov-label" id="nt-entry-label">Attach a title from your collection</span>
          <ThemedSelect variant="field" value={entryId} onChange={setEntryId} options={entryOptions} aria-labelledby="nt-entry-label" />
          <span className="ov-hint">Shown under your post as a title card.</span>
        </div>
        <div className="ov-field">
          <span className="ov-label" id="nt-board-label">Share a moodboard</span>
          <ThemedSelect variant="field" value={boardId} onChange={setBoardId} options={boardOptions} disabled={!boards.length} aria-labelledby="nt-board-label" />
          <span className="ov-hint">Embedded read-only. Anyone who can read the thread can open the full board.</span>
        </div>
      </div>

      {error && <div className="ov-error" role="alert">{error}</div>}
      <div className="ov-row" style={{ marginTop: "1.2rem" }}>
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? "Posting…" : "Post thread"}</button>
        <Link className="btn btn-ghost" href="/forum">Cancel</Link>
      </div>
    </form>
  );
}
