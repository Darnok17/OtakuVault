import { uploadImageAction } from "@/app/actions/uploads";

// Client side of image uploads. The server (app/actions/uploads.ts) does the real resize and
// JPEG encode; the browser only shrinks files that wouldn't fit in a Server Action request.

const MAX_WIDTH = 1200; // matches the server's output width, so nothing is lost by shrinking first
const SEND_LIMIT = 900 * 1024; // under the 1MB Server Action body cap, leaving room for multipart overhead
// Formats the server accepts as-is; anything else the browser can decode is converted to JPEG first.
const SERVER_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);
// JPEG has no alpha; transparent areas get the card surface color instead of black.
const MATTE = "#12121a";

const loadImage = (file: File) =>
  new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Could not decode image")); };
    img.src = url;
  });

const toBlob = (canvas: HTMLCanvasElement, quality: number) =>
  new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not encode image"))), "image/jpeg", quality));

// Small enough files go up untouched; bigger ones are re-encoded as JPEG at most MAX_WIDTH wide.
async function fitForUpload(file: File): Promise<Blob> {
  if (file.size <= SEND_LIMIT && SERVER_TYPES.has(file.type)) return file;
  const img = await loadImage(file);
  const scale = Math.min(1, MAX_WIDTH / img.naturalWidth);
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(img.naturalWidth * scale);
  canvas.height = Math.round(img.naturalHeight * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas not supported");
  ctx.fillStyle = MATTE;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
  for (const q of [0.92, 0.85, 0.75, 0.6]) {
    const blob = await toBlob(canvas, q);
    if (blob.size <= SEND_LIMIT) return blob;
  }
  throw new Error("That image is too large.");
}

export type UploadStage = "preparing" | "uploading";

// Uploads an image file and resolves to its public URL. Rejects with a user-facing message.
export async function uploadImageFile(file: File, kind: "cover" | "moodboard", onStage?: (s: UploadStage) => void): Promise<string> {
  if (!file.type.startsWith("image/")) throw new Error("That file isn't an image.");
  onStage?.("preparing");
  let body: Blob;
  try {
    body = await fitForUpload(file);
  } catch (err) {
    throw new Error((err as Error).message === "That image is too large." ? "That image is too large." : "Couldn't read that image.");
  }
  onStage?.("uploading");
  const form = new FormData();
  form.append("file", body, body === file ? file.name : "image.jpg");
  form.append("kind", kind);
  let res;
  try {
    res = await uploadImageAction(form);
  } catch {
    throw new Error("Upload failed — check your connection.");
  }
  if (!res.ok) throw new Error(res.error);
  return res.url;
}

// Uploaded images (and legacy data URLs) are app-managed rather than user-pasted links.
export const isStoredImage = (url: string) => url.startsWith("data:") || url.startsWith("/uploads/") || /\.public\.blob\.vercel-storage\.com\//.test(url);
