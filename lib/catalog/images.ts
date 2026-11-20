import { createHash } from "node:crypto";
import { and, eq, isNotNull, isNull, or, sql } from "drizzle-orm";
import { db, titles } from "@/lib/db";

// Copies provider cover and banner images into our media bucket (served from img.otakuvault.app)
// so pages don't hotlink AniList's CDN. Runs in the sync job (Node, sharp), never in the Worker.
//
// Keys are catalog/anilist/<id>/<cover|banner>-<hash of the source URL>.webp: a new source image
// gets a new key, so objects are immutable and cached for a year. User uploads live under
// uploads/, which is the only prefix the app ever deletes from.

export interface ImageStore {
  // Stores the bytes and returns the public URL.
  put(key: string, body: Uint8Array, contentType: string): Promise<string>;
}

// The bucket through Cloudflare's R2 REST API, with the same API token the deploys use.
export function r2RestStore(opts: { accountId: string; apiToken: string; bucket: string; publicBaseUrl: string }): ImageStore {
  const base = `https://api.cloudflare.com/client/v4/accounts/${opts.accountId}/r2/buckets/${opts.bucket}/objects/`;
  return {
    async put(key, body, contentType) {
      for (let attempt = 0; ; attempt++) {
        const res = await fetch(base + key.split("/").map(encodeURIComponent).join("/"), {
          method: "PUT",
          headers: {
            Authorization: `Bearer ${opts.apiToken}`,
            "Content-Type": contentType,
            "Cache-Control": "public, max-age=31536000, immutable",
          },
          body: Buffer.from(body),
          signal: AbortSignal.timeout(30_000),
        });
        if (res.ok) return `${opts.publicBaseUrl.replace(/\/$/, "")}/${key}`;
        if (attempt < 3 && (res.status === 429 || res.status >= 500)) {
          await new Promise((r) => setTimeout(r, 2000 * 2 ** attempt));
          continue;
        }
        throw new Error(`R2 upload failed: HTTP ${res.status} ${(await res.text()).slice(0, 200)}`);
      }
    },
  };
}

const SIZES = {
  cover: { width: 460, quality: 80 },
  banner: { width: 1600, quality: 78 },
} as const;

type Kind = keyof typeof SIZES;

export type ImageReport = { copied: number; gone: number; failed: number };

async function encode(input: Uint8Array, kind: Kind): Promise<Uint8Array> {
  const { default: sharp } = await import("sharp");
  const { width, quality } = SIZES[kind];
  return sharp(input).rotate().resize({ width, withoutEnlargement: true }).webp({ quality }).toBuffer();
}

export const imageKey = (anilistId: number, kind: Kind, sourceUrl: string) =>
  `catalog/anilist/${anilistId}/${kind}-${createHash("sha256").update(sourceUrl).digest("hex").slice(0, 12)}.webp`;

// Copies up to `limit` titles' missing images, most popular first.
export async function copyImages(store: ImageStore, limit: number, opts: { concurrency?: number; log?: (m: string) => void; fetchImage?: typeof fetch } = {}): Promise<ImageReport> {
  const log = opts.log ?? (() => {});
  const fetchImage = opts.fetchImage ?? fetch;
  const report: ImageReport = { copied: 0, gone: 0, failed: 0 };
  const todo = await db.select({
    id: titles.id, anilistId: titles.anilistId, coverSource: titles.coverSource, bannerSource: titles.bannerSource,
    needCover: sql<boolean>`${titles.cover} is null and ${titles.coverSource} is not null`,
    needBanner: sql<boolean>`${titles.banner} is null and ${titles.bannerSource} is not null`,
  }).from(titles)
    .where(and(isNotNull(titles.anilistId), or(
      and(isNull(titles.cover), isNotNull(titles.coverSource)),
      and(isNull(titles.banner), isNotNull(titles.bannerSource)),
    )))
    .orderBy(sql`${titles.popularity} desc nulls last`)
    .limit(limit);

  const jobs = todo.flatMap((t) => [
    ...(t.needCover ? [{ t, kind: "cover" as const, src: t.coverSource! }] : []),
    ...(t.needBanner ? [{ t, kind: "banner" as const, src: t.bannerSource! }] : []),
  ]);

  const copyOne = async ({ t, kind, src }: (typeof jobs)[number]) => {
    const col = kind === "cover" ? titles.cover : titles.banner;
    const srcCol = kind === "cover" ? titles.coverSource : titles.bannerSource;
    try {
      const res = await fetchImage(src, { signal: AbortSignal.timeout(20_000) });
      if (res.status === 404 || res.status === 410 || res.status === 403) {
        // The provider no longer has it: drop the image rather than retry every run. A later
        // sync that brings a new source URL brings the image back.
        await db.update(titles).set(kind === "cover" ? { coverSource: null, thumbSource: null } : { bannerSource: null })
          .where(and(eq(titles.id, t.id), eq(srcCol, src)));
        report.gone++;
        return;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const body = await encode(new Uint8Array(await res.arrayBuffer()), kind);
      const url = await store.put(imageKey(t.anilistId!, kind, src), body, "image/webp");
      // Only if the source is still the one we copied (a sync may have changed it meanwhile).
      await db.update(titles).set({ [kind]: url }).where(and(eq(titles.id, t.id), eq(srcCol, src), isNull(col)));
      report.copied++;
    } catch (err) {
      report.failed++;
      log(`image ${kind} of ${t.anilistId} failed: ${(err as Error).message}`);
    }
  };

  const queue = [...jobs];
  await Promise.all(Array.from({ length: opts.concurrency ?? 6 }, async () => {
    for (let job = queue.shift(); job; job = queue.shift()) await copyOne(job);
  }));
  return report;
}
