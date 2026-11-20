import { randomUUID } from "node:crypto";
import { getCloudflareContext } from "@opennextjs/cloudflare";

// Image storage. Three drivers, picked by STORAGE_DRIVER (default: "blob" in production, else "local"):
//   r2    Cloudflare Workers. Normalized with the Images binding (env.IMAGES), stored in the MEDIA R2
//         bucket, served from MEDIA_BASE_URL (https://img.otakuvault.app). wrangler.jsonc sets it.
//   blob  Vercel (until the Cloudflare cutover; see docs/cloudflare-migration-guide.md Phase 14).
//         Normalized with sharp, stored in Vercel Blob.
//   local next dev. Normalized with sharp, written to public/uploads/<userId>/, which `next dev`
//         serves as /uploads/... (`next start` only serves files that existed at build time).
// sharp, @vercel/blob and node:fs are imported lazily so the Worker bundle never evaluates them
// (sharp is a native addon and can't run on Workers). Server-only.

type Driver = "r2" | "blob" | "local";
const driver = (process.env.STORAGE_DRIVER ?? (process.env.NODE_ENV === "production" ? "blob" : "local")) as Driver;

const LOCAL_PREFIX = "/uploads/";
const BLOB_HOST = /\.public\.blob\.vercel-storage\.com$/;

export const MAX_IMAGE_WIDTH = 1200;
const MAX_INPUT_PIXELS = 50_000_000;
const JPEG_QUALITY = 85;
// JPEG has no alpha; transparent areas get the card surface color instead of black.
const MATTE = "#12121a";

// Vercel's Blob integration sets BLOB_READ_WRITE_TOKEN; VERCEL_BLOB_READ_WRITE_TOKEN takes precedence if set.
const blobToken = () => {
  const token = process.env.VERCEL_BLOB_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) throw new Error("VERCEL_BLOB_READ_WRITE_TOKEN is not set");
  return token;
};

const mediaBase = () => {
  const base = process.env.MEDIA_BASE_URL;
  if (!base) throw new Error("MEDIA_BASE_URL is not set");
  return base.replace(/\/$/, "");
};

const streamOf = (bytes: Uint8Array) => new Blob([bytes as Uint8Array<ArrayBuffer>]).stream();

// Re-encodes any readable image as a JPEG at most MAX_IMAGE_WIDTH wide, on a matte background.
// Throws on anything that isn't a decodable image.
export async function normalizeImage(input: Uint8Array): Promise<Uint8Array> {
  if (driver === "r2") {
    const images = getCloudflareContext().env.IMAGES;
    if (!images) throw new Error("IMAGES binding is not configured");
    const info = await images.info(streamOf(input)); // free; throws on non-images
    if ("width" in info && info.width * info.height > MAX_INPUT_PIXELS) throw new Error("Image too large");
    const out = await images.input(streamOf(input))
      .transform({ width: MAX_IMAGE_WIDTH, fit: "scale-down", background: MATTE })
      .output({ format: "image/jpeg", quality: JPEG_QUALITY });
    return new Uint8Array(await out.response().arrayBuffer());
  }
  // EXIF rotation applied, metadata stripped.
  const { default: sharp } = await import("sharp");
  return sharp(input, { limitInputPixels: MAX_INPUT_PIXELS })
    .rotate()
    .resize({ width: MAX_IMAGE_WIDTH, withoutEnlargement: true })
    .flatten({ background: MATTE })
    .jpeg({ quality: JPEG_QUALITY, mozjpeg: true })
    .toBuffer();
}

// Unique, safe filename like "cover-<uuid>.jpg" for a kind such as "cover" or "moodboard".
export const uploadName = (kind: string) => `${kind.replace(/[^a-z0-9-]/gi, "")}-${randomUUID()}.jpg`;

const userDir = (userId: string) => {
  if (!/^[\w-]{1,100}$/.test(userId)) throw new Error("Invalid user id");
  return userId;
};

// Stores an already-processed image and returns its public URL.
export async function uploadImage(bytes: Uint8Array, filename: string, userId: string): Promise<string> {
  if (!/^[\w.-]{1,120}$/.test(filename) || filename.startsWith(".")) throw new Error("Invalid filename");
  const key = `uploads/${userDir(userId)}/${filename}`;

  if (driver === "r2") {
    const { env } = getCloudflareContext();
    // uuid names never collide; never overwrite.
    const stored = await env.MEDIA.put(key, bytes, {
      httpMetadata: { contentType: "image/jpeg", cacheControl: "public, max-age=31536000, immutable" },
      onlyIf: { etagDoesNotMatch: "*" },
    });
    if (!stored) throw new Error("Upload key already exists");
    return `${mediaBase()}/${key}`;
  }
  if (driver === "blob") {
    const { put } = await import("@vercel/blob");
    const blob = await put(key, Buffer.from(bytes), {
      access: "public", contentType: "image/jpeg", addRandomSuffix: false, token: blobToken(),
    });
    return blob.url;
  }
  const { mkdir, writeFile } = await import("node:fs/promises");
  const path = await import("node:path");
  const file = path.join(process.cwd(), "public", key);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, bytes, { flag: "wx" });
  return `/${key}`;
}

// The R2 key for a URL issued by the r2 driver, or null if the URL isn't ours.
function mediaKey(url: string): string | null {
  if (!process.env.MEDIA_BASE_URL) return null;
  try {
    const base = new URL(mediaBase());
    const u = new URL(url);
    if (u.protocol !== "https:" || u.host !== base.host) return null;
    return decodeURIComponent(u.pathname.slice(1));
  } catch {
    return null;
  }
}

function blobPath(url: string): string | null {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && BLOB_HOST.test(u.hostname) ? u.pathname : null;
  } catch {
    return null;
  }
}

// True for URLs this module issued under the user's own folder (local, R2 or Blob).
export function isOwnedUpload(url: string, userId: string): boolean {
  const prefix = `${LOCAL_PREFIX}${userId}/`;
  if (url.includes("..")) return false;
  if (url.startsWith(LOCAL_PREFIX)) return url.startsWith(prefix);
  const key = mediaKey(url);
  if (key) return `/${key}`.startsWith(prefix);
  return blobPath(url)?.startsWith(prefix) ?? false;
}

// Removes a stored image. URLs that aren't ours (remote covers, AniList art) are ignored, as is a
// file that's already gone. Each driver only deletes from its own store.
export async function deleteImage(url: string): Promise<void> {
  if (url.startsWith(LOCAL_PREFIX)) {
    if (driver !== "local") return;
    const { unlink } = await import("node:fs/promises");
    const path = await import("node:path");
    const publicDir = path.join(process.cwd(), "public");
    const file = path.resolve(publicDir, "." + url);
    if (!file.startsWith(path.join(publicDir, "uploads") + path.sep)) return;
    await unlink(file).catch((err: NodeJS.ErrnoException) => { if (err.code !== "ENOENT") throw err; });
    return;
  }
  if (driver === "r2") {
    const key = mediaKey(url);
    if (key?.startsWith("uploads/")) await getCloudflareContext().env.MEDIA.delete(key);
    return;
  }
  if (driver === "blob" && blobPath(url)) {
    const { del } = await import("@vercel/blob");
    await del(url, { token: blobToken() });
  }
}

const DATA_URL = /^data:image\/[\w.+-]+;base64,/;
export const isDataImage = (v: unknown): boolean => typeof v === "string" && DATA_URL.test(v);

// Turns a legacy base64 data URL into a stored upload; returns the new URL.
export async function uploadDataUrl(dataUrl: string, kind: string, userId: string): Promise<string> {
  const bytes = Uint8Array.from(atob(dataUrl.replace(DATA_URL, "")), (c) => c.charCodeAt(0));
  return uploadImage(await normalizeImage(bytes), uploadName(kind), userId);
}
