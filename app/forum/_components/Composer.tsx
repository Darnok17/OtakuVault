"use client";

import { useRef, useState } from "react";
import { uploadImageFile } from "@/lib/image";
import { Markdown } from "@/lib/markdown";
import { POST_BODY_MAX, POST_IMAGES_MAX } from "@/lib/forum-shared";

const MAX_FILE_BYTES = 5 * 1024 * 1024;

type Props = {
  id: string; label: string; value: string; onChange: (v: string) => void;
  // Omit to make a text-only composer (editing a post keeps its pictures as they are).
  images?: string[]; onImages?: (v: string[]) => void;
  rows?: number; placeholder?: string; autoFocus?: boolean; disabled?: boolean;
};

const TOOLS: { key: string; label: string; title: string; wrap?: [string, string]; line?: string; sample: string }[] = [
  { key: "b", label: "B", title: "Bold", wrap: ["**", "**"], sample: "bold text" },
  { key: "i", label: "I", title: "Italic", wrap: ["*", "*"], sample: "italic text" },
  { key: "link", label: "Link", title: "Link", wrap: ["[", "](https://)"], sample: "link text" },
  { key: "code", label: "</>", title: "Code", wrap: ["`", "`"], sample: "code" },
  { key: "quote", label: "❝", title: "Quote", line: "> ", sample: "quote" },
];

// The post editor: a Markdown textarea with a small toolbar, a preview, and image attachments.
export default function Composer({ id, label, value, onChange, images, onImages, rows = 6, placeholder, autoFocus, disabled }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState(false);
  const [uploading, setUploading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const apply = (tool: (typeof TOOLS)[number]) => {
    const el = ref.current;
    if (!el) return;
    const { selectionStart: a, selectionEnd: b } = el;
    const picked = value.slice(a, b) || tool.sample;
    let next: string, from: number, to: number;
    if (tool.wrap) {
      const [open, close] = tool.wrap;
      next = value.slice(0, a) + open + picked + close + value.slice(b);
      from = a + open.length; to = from + picked.length;
    } else {
      const quoted = picked.split("\n").map((l) => tool.line + l).join("\n");
      const lead = a > 0 && value[a - 1] !== "\n" ? "\n" : "";
      next = value.slice(0, a) + lead + quoted + value.slice(b);
      from = a + lead.length + tool.line!.length; to = a + lead.length + quoted.length;
    }
    onChange(next.slice(0, POST_BODY_MAX));
    // Put the selection back on the text the tool wrapped, once React has written the new value.
    requestAnimationFrame(() => { el.focus(); el.setSelectionRange(from, to); });
  };

  const addFiles = async (files: FileList | null) => {
    if (!files?.length || !images || !onImages) return;
    setError(null);
    let list = images;
    for (const file of Array.from(files)) {
      if (list.length >= POST_IMAGES_MAX) { setError(`A post can have up to ${POST_IMAGES_MAX} images.`); break; }
      if (file.size > MAX_FILE_BYTES) { setError(`“${file.name}” is over 5 MB. Pick a smaller image.`); continue; }
      try {
        const url = await uploadImageFile(file, "forum", (s) => setUploading(s === "preparing" ? "Preparing…" : "Uploading…"));
        list = [...list, url];
        onImages(list);
      } catch (err) {
        setError((err as Error).message || "Upload failed. Try again.");
      }
    }
    setUploading(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <div className="fc">
      <div className="fc-bar">
        <label className="ov-label" htmlFor={id}>{label}</label>
        <div className="fc-tools" role="toolbar" aria-label="Formatting">
          {TOOLS.map((t) => (
            <button key={t.key} type="button" className={`fc-tool fc-tool-${t.key}`} title={t.title} aria-label={t.title} disabled={preview || disabled} onClick={() => apply(t)}>{t.label}</button>
          ))}
          {images && (
            <button type="button" className="fc-tool" title="Add images" disabled={disabled || !!uploading || images.length >= POST_IMAGES_MAX} onClick={() => fileRef.current?.click()}>
              {uploading ?? `Image ${images.length}/${POST_IMAGES_MAX}`}
            </button>
          )}
          <button type="button" className="fc-tool fc-preview" aria-pressed={preview} onClick={() => setPreview(!preview)}>{preview ? "Write" : "Preview"}</button>
        </div>
      </div>
      {preview
        ? <div className="ov-input fc-preview-pane">{value.trim() ? <Markdown text={value} /> : <span className="ov-hint">Nothing to preview yet.</span>}</div>
        : <textarea ref={ref} id={id} className="ov-input fc-text" rows={rows} value={value} maxLength={POST_BODY_MAX} placeholder={placeholder} autoFocus={autoFocus} disabled={disabled} onChange={(e) => onChange(e.target.value)} />}
      {images && (
        <>
          <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif,image/avif" multiple hidden onChange={(e) => addFiles(e.target.files)} />
          {images.length > 0 && (
            <ul className="fc-thumbs">
              {images.map((url) => (
                <li key={url} className="fc-thumb" style={{ backgroundImage: `url(${JSON.stringify(url)})` }}>
                  <button type="button" aria-label="Remove image" onClick={() => onImages?.(images.filter((u) => u !== url))}>✕</button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {error && <div className="ov-error" role="alert">{error}</div>}
    </div>
  );
}
