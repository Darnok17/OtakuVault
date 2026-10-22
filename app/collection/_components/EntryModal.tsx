"use client";

import { useRef, useState } from "react";
import { lengthFor, type Title } from "@/lib/anilist-shared";
import type { Entry, EntryStatus, EntryType } from "@/lib/types";
import AniListSearch from "./AniListSearch";
import CoverDropZone from "./CoverDropZone";
import StarRating from "./StarRating";

export default function EntryModal({
  entry, onSave, onClose,
}: {
  entry: Entry | null;
  onSave: (e: Entry) => void;
  onClose: () => void;
}) {
  const isEdit = !!entry;
  const [form, setForm] = useState<Entry>(entry ?? {
    id: "e_" + Date.now(),
    title: "", type: "anime", status: "watching",
    genre: "", totalEps: "", notes: "", rating: 0, imageUrl: "",
    progressCurrent: 0, progressTotal: 0, created: Date.now(),
  });

  const [uploading, setUploading] = useState(false);
  const titleInput = useRef<HTMLInputElement>(null);

  // Functional update: the cover image is set asynchronously, after the upload finishes.
  const set = <K extends keyof Entry>(k: K, v: Entry[K]) => setForm((f) => ({ ...f, [k]: v }));

  // AniList autofill: fills the fields a title card needs; everything stays editable before saving.
  const fillFromAniList = (t: Title) => {
    const length = lengthFor(t);
    setForm((f) => ({
      ...f,
      title: t.title,
      type: t.entryType,
      genre: t.genres.join(", "),
      totalEps: length.label,
      progressTotal: length.total,
      imageUrl: t.cover ?? "",
      status: "plan-to",
    }));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    // Saving mid-upload would drop the new cover.
    if (!form.title.trim() || uploading) return;
    onSave(form);
  };

  return (
    // Swallow file drops that miss the zone so the browser doesn't navigate away and lose the form.
    <div className="modal-overlay open" onClick={onClose} onDragOver={(e) => e.preventDefault()} onDrop={(e) => e.preventDefault()}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 540 }}>
        <button className="close-modal" type="button" onClick={onClose}>✕</button>
        <div className="modal-title">{isEdit ? "Edit Entry" : "Add New Entry"}</div>

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "1rem" }}>
          {!isEdit && (
            <AniListSearch onPick={fillFromAniList} onManual={() => titleInput.current?.focus()} inputStyle={inputStyle} labelStyle={labelStyle} />
          )}

          <label style={{ display: "flex", flexDirection: "column", gap: ".3rem" }}>
            <span style={labelStyle}>Title *</span>
            <input ref={titleInput} type="text" value={form.title} onChange={(e) => set("title", e.target.value)} required autoFocus style={inputStyle} />
          </label>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".75rem" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: ".3rem" }}>
              <span style={labelStyle}>Type</span>
              <select value={form.type} onChange={(e) => set("type", e.target.value as EntryType)} style={inputStyle}>
                <option value="anime">Anime</option>
                <option value="manga">Manga</option>
                <option value="webtoon">Webtoon</option>
                <option value="novel">Novel</option>
              </select>
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: ".3rem" }}>
              <span style={labelStyle}>Status</span>
              <select value={form.status} onChange={(e) => set("status", e.target.value as EntryStatus)} style={inputStyle}>
                <option value="watching">Watching / Reading</option>
                <option value="completed">Completed</option>
                <option value="on-hold">On Hold</option>
                <option value="plan-to">Plan To</option>
                <option value="dropped">Dropped</option>
              </select>
            </label>
          </div>

          <label style={{ display: "flex", flexDirection: "column", gap: ".3rem" }}>
            <span style={labelStyle}>Genre</span>
            <input type="text" value={form.genre} onChange={(e) => set("genre", e.target.value)} placeholder="Action, Fantasy" style={inputStyle} />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: ".3rem" }}>
            <span style={labelStyle}>Total episodes/chapters</span>
            <input type="text" value={form.totalEps} onChange={(e) => set("totalEps", e.target.value)} placeholder="24 eps" style={inputStyle} />
          </label>

          <div style={{ display: "flex", flexDirection: "column", gap: ".3rem" }}>
            <span style={labelStyle}>Cover image</span>
            <CoverDropZone value={form.imageUrl} onChange={(url) => set("imageUrl", url)} inputStyle={inputStyle} onBusyChange={setUploading} />
          </div>

          {(form.status === "watching" || form.status === "dropped") && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".75rem" }}>
              <label style={{ display: "flex", flexDirection: "column", gap: ".3rem" }}>
                <span style={labelStyle}>Progress — current</span>
                <input type="number" value={form.progressCurrent} min={0} onChange={(e) => set("progressCurrent", Number(e.target.value))} style={inputStyle} />
              </label>
              <label style={{ display: "flex", flexDirection: "column", gap: ".3rem" }}>
                <span style={labelStyle}>Progress — total</span>
                <input type="number" value={form.progressTotal} min={0} onChange={(e) => set("progressTotal", Number(e.target.value))} style={inputStyle} />
              </label>
            </div>
          )}

          <label style={{ display: "flex", flexDirection: "column", gap: ".3rem" }}>
            <span style={labelStyle}>Notes</span>
            <textarea value={form.notes} onChange={(e) => set("notes", e.target.value)} rows={3} style={{ ...inputStyle, resize: "vertical" }} />
          </label>

          <div style={{ display: "flex", flexDirection: "column", gap: ".3rem" }}>
            <span style={labelStyle}>Rating</span>
            <StarRating value={form.rating} onChange={(r) => set("rating", r)} />
          </div>

          <div style={{ display: "flex", gap: ".75rem", marginTop: ".5rem" }}>
            <button type="button" className="btn btn-ghost" onClick={onClose} style={{ flex: 1 }}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }} disabled={uploading}>{uploading ? "Uploading…" : isEdit ? "Save Changes" : "Add Entry"}</button>
          </div>
        </form>
      </div>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: ".65rem .8rem",
  background: "rgba(0,0,0,.3)",
  border: "1px solid var(--border)",
  borderRadius: "6px",
  color: "var(--text)",
  fontFamily: "var(--font-space-mono)",
  fontSize: ".78rem",
};
const labelStyle: React.CSSProperties = {
  fontFamily: "var(--font-space-mono)",
  fontSize: ".65rem",
  letterSpacing: ".15em",
  color: "var(--text-dim)",
  textTransform: "uppercase",
};
