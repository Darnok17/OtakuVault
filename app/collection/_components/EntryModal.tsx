"use client";

import { useState } from "react";
import type { Entry, EntryStatus, EntryType } from "@/lib/types";
import Stars from "./Stars";

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

  const set = <K extends keyof Entry>(k: K, v: Entry[K]) => setForm({ ...form, [k]: v });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) return;
    onSave(form);
  };

  return (
    <div className="modal-overlay" style={{ display: "flex" }} onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 540 }}>
        <button className="close-modal" type="button" onClick={onClose}>✕</button>
        <div className="modal-title">{isEdit ? "Edit Entry" : "Add New Entry"}</div>

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "1rem" }}>
          <label style={{ display: "flex", flexDirection: "column", gap: ".3rem" }}>
            <span style={labelStyle}>Title *</span>
            <input type="text" value={form.title} onChange={(e) => set("title", e.target.value)} required autoFocus style={inputStyle} />
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

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".75rem" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: ".3rem" }}>
              <span style={labelStyle}>Total episodes/chapters</span>
              <input type="text" value={form.totalEps} onChange={(e) => set("totalEps", e.target.value)} placeholder="24 eps" style={inputStyle} />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: ".3rem" }}>
              <span style={labelStyle}>Cover image URL</span>
              <input type="url" value={form.imageUrl} onChange={(e) => set("imageUrl", e.target.value)} placeholder="https://…" style={inputStyle} />
            </label>
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

          <label style={{ display: "flex", flexDirection: "column", gap: ".3rem" }}>
            <span style={labelStyle}>Rating (0–5, half stars allowed)</span>
            <div style={{ display: "flex", alignItems: "center", gap: ".5rem" }}>
              <input type="number" value={form.rating} min={0} max={5} step={0.5} onChange={(e) => set("rating", Number(e.target.value))} style={{ ...inputStyle, width: 100 }} />
              <Stars rating={form.rating} />
            </div>
          </label>

          <div style={{ display: "flex", gap: ".75rem", marginTop: ".5rem" }}>
            <button type="button" className="btn btn-ghost" onClick={onClose} style={{ flex: 1 }}>Cancel</button>
            <button type="submit" className="btn btn-primary" style={{ flex: 1 }}>{isEdit ? "Save Changes" : "Add Entry"}</button>
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
