"use client";

import { useRef, useState, type DragEvent } from "react";
import { isStoredImage, uploadImageFile, type UploadStage } from "@/lib/image";

const STAGE_LABEL: Record<UploadStage, string> = { preparing: "Preparing", uploading: "Uploading" };

export default function CoverDropZone({
  value, onChange, inputStyle, onBusyChange,
}: {
  value: string;
  onChange: (imageUrl: string) => void;
  inputStyle: React.CSSProperties;
  onBusyChange?: (busy: boolean) => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [stage, setStage] = useState<UploadStage | null>(null);
  const [error, setError] = useState("");
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);

  const busy = stage !== null;
  // Uploaded files (and pre-upload data URLs) aren't worth showing as text in the URL field.
  const isStored = isStoredImage(value);
  const showPreview = !!value && brokenSrc !== value;

  // The cover only changes once the upload succeeds, so a failure leaves the previous one in place.
  const takeFile = async (file: File | undefined) => {
    if (!file || busy) return;
    setError("");
    onBusyChange?.(true);
    try {
      onChange(await uploadImageFile(file, "cover", setStage));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setStage(null);
      onBusyChange?.(false);
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
          className={`cover-upload-area ${dragOver ? "drag-over" : ""} ${busy ? "uploading" : ""}`}
          aria-busy={busy}
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
                <span className="cover-upload-text">{stage ? `${STAGE_LABEL[stage]}…` : "Replace"}</span>
              </div>
            </>
          ) : (
            <div className="cover-placeholder-inner">
              <span>{busy ? "…" : "🖼"}</span>
              <span>{stage ? STAGE_LABEL[stage] : dragOver ? "Drop it" : "Drop or click"}</span>
            </div>
          )}
          {stage && <div className="cover-upload-progress" data-stage={stage} role="progressbar" aria-label={`${STAGE_LABEL[stage]} image`}><span /></div>}
        </div>
        {/* Outside the zone so the programmatic click doesn't bubble back into its onClick */}
        <input
          ref={fileInput}
          type="file" accept="image/*" hidden
          onChange={(e) => { takeFile(e.target.files?.[0]); e.target.value = ""; }}
        />
        {value && !busy && (
          <button type="button" className="cover-remove-btn" onClick={() => { onChange(""); setError(""); }}>
            Remove
          </button>
        )}
      </div>

      {/* URL fallback. Uploaded images show as a placeholder rather than their storage path. */}
      <input
        type="url"
        value={isStored ? "" : value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={isStored ? "Uploaded image — or paste a URL to replace" : "…or paste an image URL"}
        disabled={busy}
        style={inputStyle}
      />
      {error && <span className="cover-upload-error" role="alert">{error}</span>}
      {value && !isStored && brokenSrc === value && (
        <span className="cover-upload-error">That URL didn&apos;t load as an image.</span>
      )}
    </div>
  );
}
