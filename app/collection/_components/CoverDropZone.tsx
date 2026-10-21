"use client";

import { useRef, useState, type DragEvent } from "react";
import { compressImage } from "@/lib/image";

export default function CoverDropZone({
  value, onChange, inputStyle,
}: {
  value: string;
  onChange: (imageUrl: string) => void;
  inputStyle: React.CSSProperties;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);

  const isDataUrl = value.startsWith("data:");
  const showPreview = !!value && brokenSrc !== value;

  const takeFile = async (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("That file isn't an image."); return; }
    setError("");
    setBusy(true);
    try {
      onChange(await compressImage(file));
    } catch {
      setError("Couldn't read that image.");
    } finally {
      setBusy(false);
    }
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    takeFile(e.dataTransfer.files[0]);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: ".5rem" }}>
      <div style={{ display: "flex", alignItems: "flex-end", gap: ".75rem" }}>
        <div
          className={`cover-upload-area ${dragOver ? "drag-over" : ""}`}
          role="button" tabIndex={0}
          aria-label="Upload cover image"
          onClick={() => fileInput.current?.click()}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fileInput.current?.click(); }
          }}
          onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "copy"; setDragOver(true); }}
          onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(false); }}
          onDrop={onDrop}
        >
          {showPreview ? (
            <>
              <img src={value} alt="Cover preview" onError={() => setBrokenSrc(value)} />
              <div className="cover-upload-overlay">
                <span className="cover-upload-icon">⇪</span>
                <span className="cover-upload-text">Replace</span>
              </div>
            </>
          ) : (
            <div className="cover-placeholder-inner">
              <span>{busy ? "…" : "🖼"}</span>
              <span>{busy ? "Processing" : dragOver ? "Drop it" : "Drop or click"}</span>
            </div>
          )}
        </div>
        {/* Outside the zone so the programmatic click doesn't bubble back into its onClick */}
        <input
          ref={fileInput}
          type="file" accept="image/*" hidden
          onChange={(e) => { takeFile(e.target.files?.[0]); e.target.value = ""; }}
        />
        {value && (
          <button type="button" className="cover-remove-btn" onClick={() => { onChange(""); setError(""); }}>
            Remove
          </button>
        )}
      </div>

      {/* URL fallback. Uploaded images are data URLs, which aren't worth showing as text. */}
      <input
        type="url"
        value={isDataUrl ? "" : value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={isDataUrl ? "Uploaded image — or paste a URL to replace" : "…or paste an image URL"}
        style={inputStyle}
      />
      {error && <span className="cover-upload-error" role="alert">{error}</span>}
      {value && !isDataUrl && brokenSrc === value && (
        <span className="cover-upload-error">That URL didn&apos;t load as an image.</span>
      )}
    </div>
  );
}
