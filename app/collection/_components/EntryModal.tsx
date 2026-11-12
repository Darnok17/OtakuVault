"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { getTitleByIdAction } from "@/app/actions/anilist";
import { entryLengthFor, titleHref, type Title } from "@/lib/anilist-shared";
import type { Entry, EntryStatus, EntryType } from "@/lib/types";
import AniListSearch from "./AniListSearch";
import CoverDropZone from "./CoverDropZone";
import StarRating from "./StarRating";
import ThemedSelect, { type SelectOption } from "@/app/_components/ThemedSelect";

const TYPE_OPTIONS: SelectOption<EntryType>[] = [
  { value: "anime", label: "Anime" }, { value: "manga", label: "Manga" },
  { value: "webtoon", label: "Webtoon" }, { value: "novel", label: "Novel" },
];
const STATUS_OPTIONS: SelectOption<EntryStatus>[] = [
  { value: "watching", label: "Watching / Reading" }, { value: "completed", label: "Completed" },
  { value: "on-hold", label: "On Hold" }, { value: "plan-to", label: "Plan To" }, { value: "dropped", label: "Dropped" },
];

export default function EntryModal({
  entry, onSave, onClose,
}: {
  entry: Entry | null;
  onSave: (e: Entry) => void;
  onClose: () => void;
}) {
  const isEdit = !!entry;
  // id and created are stamped in submit(); render must stay pure.
  const [form, setForm] = useState<Entry>(entry ?? {
    id: "",
    title: "", type: "anime", status: "watching",
    genre: "", totalEps: "", notes: "", rating: 0, imageUrl: "",
    progressCurrent: 0, progressTotal: 0, created: 0,
  });

  const [uploading, setUploading] = useState(false);
  const titleInput = useRef<HTMLInputElement>(null);
  // The title last picked from the AniList search, when AniList has no length for it.
  const [noLength, setNoLength] = useState<Title | null>(null);
  const pickId = useRef(0);

  // Functional update: the cover image is set asynchronously, after the upload finishes.
  const set = <K extends keyof Entry>(k: K, v: Entry[K]) => setForm((f) => ({ ...f, [k]: v }));

  // AniList autofill: fills the fields a title card needs; everything stays editable before saving.
  // anilistId is what links the saved card to the title's detail page.
  const fillFromAniList = (t: Title) => {
    const pick = ++pickId.current;
    const length = entryLengthFor(t);
    setNoLength(length.known ? null : t);
    setForm((f) => ({
      ...f,
      title: t.title,
      type: t.entryType,
      genre: t.genres.join(", "),
      totalEps: length.label,
      progressTotal: length.total,
      imageUrl: t.cover ?? "",
      status: "plan-to",
      anilistId: t.anilistId,
    }));
    // Search results can predate the aired-episode count; the title lookup has it. Only fills
    // the two length fields, and only if they are still as the pick left them.
    if (!length.known && t.entryType === "anime") {
      getTitleByIdAction(t.anilistId).then((full) => {
        const fresh = entryLengthFor(full);
        if (pick !== pickId.current || !fresh.known) return;
        setNoLength(null);
        setForm((f) => (f.anilistId === t.anilistId && !f.totalEps && !f.progressTotal ? { ...f, totalEps: fresh.label, progressTotal: fresh.total } : f));
      }).catch(() => {}); // the fields simply stay empty and editable
    }
  };

  // Changing the type by hand means the entry is no longer the picked AniList title.
  const setType = (type: EntryType) => {
    setNoLength(null);
    setForm((f) => ({ ...f, type, anilistId: !isEdit && type !== f.type ? undefined : f.anilistId }));
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    // Saving mid-upload would drop the new cover.
    if (!form.title.trim() || uploading) return;
    if (isEdit) return onSave(form);
    const now = Date.now();
    onSave({ ...form, id: "e_" + now, created: now });
  };

  return (
    // Swallow file drops that miss the zone so the browser doesn't navigate away and lose the form.
    <div className="modal-overlay open" onClick={onClose} onDragOver={(e) => e.preventDefault()} onDrop={(e) => e.preventDefault()}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 540 }}>
        <button className="close-modal" type="button" onClick={onClose}>✕</button>
        <div className="modal-title">{isEdit ? "Edit Entry" : "Add New Entry"}</div>

        <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: "1rem", marginTop: "1rem" }}>
          {/* Cover on the left; AniList search + title stacked on the right. */}
          <div style={{ display: "grid", gridTemplateColumns: "auto minmax(0, 1fr)", gap: "1rem", alignItems: "start" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: ".3rem" }}>
              <span style={labelStyle}>Cover image</span>
              <CoverDropZone value={form.imageUrl} onChange={(url) => set("imageUrl", url)} inputStyle={inputStyle} onBusyChange={setUploading} />
            </div>

            <div style={{ display: "flex", flexDirection: "column", gap: "1rem", minWidth: 0 }}>
              {!isEdit && (
                <AniListSearch onPick={fillFromAniList} onManual={() => titleInput.current?.focus()} inputStyle={inputStyle} labelStyle={labelStyle} />
              )}

              <label style={{ display: "flex", flexDirection: "column", gap: ".3rem" }}>
                <span style={labelStyle}>Title *</span>
                <input ref={titleInput} type="text" value={form.title} onChange={(e) => set("title", e.target.value)} required autoFocus style={inputStyle} />
              </label>
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: ".75rem" }}>
            <label style={{ display: "flex", flexDirection: "column", gap: ".3rem" }}>
              <span style={labelStyle}>Type</span>
              <ThemedSelect variant="field" value={form.type} onChange={setType} options={TYPE_OPTIONS} aria-label="Type" />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: ".3rem" }}>
              <span style={labelStyle}>Status</span>
              <ThemedSelect variant="field" value={form.status} onChange={(v) => set("status", v)} options={STATUS_OPTIONS} aria-label="Status" />
            </label>
          </div>

          <label style={{ display: "flex", flexDirection: "column", gap: ".3rem" }}>
            <span style={labelStyle}>Genre</span>
            <input type="text" value={form.genre} onChange={(e) => set("genre", e.target.value)} placeholder="Action, Fantasy" style={inputStyle} />
          </label>

          <label style={{ display: "flex", flexDirection: "column", gap: ".3rem" }}>
            <span style={labelStyle}>Total episodes/chapters</span>
            <input type="text" value={form.totalEps} onChange={(e) => set("totalEps", e.target.value)} placeholder="24 eps" style={inputStyle} />
            {noLength && !form.totalEps && (
              <span className="al-search-note al-length-note" role="status">
                &gt; AniList has no {noLength.entryType === "anime" ? "episode" : noLength.entryType === "novel" ? "volume" : "chapter"} count for this title yet{noLength.status === "RELEASING" ? " (still releasing)" : ""}. Enter it yourself.
              </span>
            )}
          </label>

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

          {form.anilistId && (
            <div style={{ display: "flex", flexDirection: "column", gap: ".3rem" }}>
              <span style={labelStyle}>AniList ID</span>
              <div style={{ display: "flex", gap: ".75rem", alignItems: "center" }}>
                <input type="text" value={form.anilistId} readOnly aria-label="AniList ID" style={{ ...inputStyle, flex: 1, opacity: .7 }} />
                <Link href={titleHref(form.type, form.anilistId)} className="btn btn-ghost btn-sm">View AniList page</Link>
              </div>
            </div>
          )}

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
  background: "rgb(from var(--shade) r g b / calc(.3 * var(--well-k)))",
  border: "1px solid var(--border)",
  borderRadius: "calc(6px * var(--r-k))",
  color: "var(--fg)",
  fontFamily: "var(--font-mono)",
  fontSize: "calc(.78rem * var(--label-scale))",
};
const labelStyle: React.CSSProperties = {
  fontFamily: "var(--font-mono)",
  fontSize: "calc(.65rem * var(--label-scale))",
  letterSpacing: "calc(.15em * var(--label-track))",
  color: "var(--fg-dim)",
  textTransform: "uppercase",
};
