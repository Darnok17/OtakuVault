"use server";

import { headers } from "next/headers";
import { auth } from "@/lib/auth";
import { normalizeImage, uploadImage, uploadName } from "@/lib/storage";

export type UploadResult = { ok: true; url: string } | { ok: false; error: string };

const KINDS = new Set(["cover", "moodboard"]);
const MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "image/gif", "image/avif"]);
// Server Action bodies are capped at 1MB (Next's default); the client downsizes before sending.
const MAX_BYTES = 1024 * 1024;

// Takes a FormData with `file` and `kind` ("cover" | "moodboard"). Returns a result object rather
// than throwing so the client gets a readable message (thrown errors are redacted in production).
export async function uploadImageAction(form: FormData): Promise<UploadResult> {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { ok: false, error: "Log in to upload images." };

  const file = form.get("file");
  const kind = form.get("kind");
  if (typeof kind !== "string" || !KINDS.has(kind)) return { ok: false, error: "Invalid upload." };
  if (!(file instanceof File)) return { ok: false, error: "No file received." };
  if (!MIME_TYPES.has(file.type)) return { ok: false, error: "Use a JPEG, PNG, WebP, GIF or AVIF image." };
  if (file.size === 0 || file.size > MAX_BYTES) return { ok: false, error: "That image is too large." };

  let jpeg: Buffer;
  try {
    // Decoding with sharp is the real check: the MIME type is only what the browser claims.
    jpeg = await normalizeImage(Buffer.from(await file.arrayBuffer()));
  } catch {
    return { ok: false, error: "That file isn't a readable image." };
  }
  try {
    return { ok: true, url: await uploadImage(jpeg, uploadName(kind), session.user.id) };
  } catch (err) {
    console.error("Image upload failed:", err);
    return { ok: false, error: "Upload failed — try again." };
  }
}
