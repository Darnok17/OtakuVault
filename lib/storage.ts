import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { del, put } from "@vercel/blob";
import sharp from "sharp";

// Image storage. Dev writes to public/uploads/<userId>/<filename>, which `next dev` serves as
// /uploads/... (`next start` only serves public/ files that existed at build time, so the local
// driver is dev-only). Production uses Vercel Blob. STORAGE_DRIVER=local|blob overrides the
// NODE_ENV choice, e.g. STORAGE_DRIVER=blob to backfill the production store from a dev machine.
// Server-only: uses node:fs and sharp.

const driver = process.env.STORAGE_DRIVER ?? (process.env.NODE_ENV === "production" ? "blob" : "local");
// Vercel's Blob integration sets BLOB_READ_WRITE_TOKEN; VERCEL_BLOB_READ_WRITE_TOKEN takes precedence if set.
const blobToken = () => {
  const token = process.env.VERCEL_BLOB_READ_WRITE_TOKEN || process.env.BLOB_READ_WRITE_TOKEN;
  if (!token) throw new Error("VERCEL_BLOB_READ_WRITE_TOKEN is not set");
  return token;
};

const PUBLIC_DIR = path.join(process.cwd(), "public");
const LOCAL_PREFIX = "/uploads/";
const BLOB_HOST = /\.public\.blob\.vercel-storage\.com$/;

export const MAX_IMAGE_WIDTH = 1200;
const JPEG_QUALITY = 85;
// JPEG has no alpha; transparent areas get the card surface color instead of black.
const MATTE = "#12121a";

// Re-encodes any image sharp can read as a JPEG at most MAX_IMAGE_WIDTH wide (EXIF rotation applied,
// metadata stripped). Throws on anything that isn't a decodable image.
export async function normalizeImage(input: Buffer): Promise<Buffer> {
  return sharp(input, { limitInputPixels: 50_000_000 })
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
export async function uploadImage(buffer: Buffer, filename: string, userId: string): Promise<string> {
  if (!/^[\w.-]{1,120}$/.test(filename) || filename.startsWith(".")) throw new Error("Invalid filename");
  const key = `uploads/${userDir(userId)}/${filename}`;

  if (driver === "blob") {
    const blob = await put(key, buffer, {
      access: "public", contentType: "image/jpeg", addRandomSuffix: false, token: blobToken(),
    });
    return blob.url;
  }
  const file = path.join(PUBLIC_DIR, key);
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(file, buffer, { flag: "wx" }); // uuid names never collide; never overwrite
  return `/${key}`;
}

// True for URLs this module issued under the user's own folder (local or Blob).
export function isOwnedUpload(url: string, userId: string): boolean {
  const prefix = `${LOCAL_PREFIX}${userId}/`;
  if (url.startsWith(LOCAL_PREFIX)) return url.startsWith(prefix) && !url.includes("..");
  try {
    const u = new URL(url);
    return u.protocol === "https:" && BLOB_HOST.test(u.hostname) && u.pathname.startsWith(prefix);
  } catch {
    return false;
  }
}

// Removes a stored image. URLs that aren't ours (remote covers, AniList art) are ignored,
// as is a file that's already gone.
export async function deleteImage(url: string): Promise<void> {
  if (url.startsWith(LOCAL_PREFIX)) {
    const file = path.resolve(PUBLIC_DIR, "." + url);
    if (!file.startsWith(path.join(PUBLIC_DIR, "uploads") + path.sep)) return;
    await unlink(file).catch((err: NodeJS.ErrnoException) => { if (err.code !== "ENOENT") throw err; });
    return;
  }
  try {
    if (!BLOB_HOST.test(new URL(url).hostname)) return;
  } catch {
    return;
  }
  await del(url, { token: blobToken() });
}

const DATA_URL = /^data:image\/[\w.+-]+;base64,/;
export const isDataImage = (v: unknown): boolean => typeof v === "string" && DATA_URL.test(v);

// Turns a legacy base64 data URL into a stored upload; returns the new URL.
export async function uploadDataUrl(dataUrl: string, kind: string, userId: string): Promise<string> {
  const jpeg = await normalizeImage(Buffer.from(dataUrl.replace(DATA_URL, ""), "base64"));
  return uploadImage(jpeg, uploadName(kind), userId);
}
