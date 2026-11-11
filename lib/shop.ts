import { and, asc, desc, eq, gte, inArray, sql } from "drizzle-orm";
import { db, entries, orderItems, orders, productImages, productVariants, products, profilePins } from "@/lib/db";
import {
  isStoreCategory, type ProductDetail, type ProductView, type Recommended, type StoreCategoryId, type StoreSort,
} from "@/lib/store-shared";

// Server-only reads behind the store pages, including the recommendation ranking.

type ProductRow = typeof products.$inferSelect;
type VariantRow = typeof productVariants.$inferSelect;

// The catalogue is a small, hand-edited table, so it is read whole and ranked in memory.
async function catalogue() {
  const [rows, variants] = await Promise.all([
    db.select().from(products).orderBy(desc(products.createdAt), asc(products.id)),
    db.select().from(productVariants).orderBy(asc(productVariants.position)),
  ]);
  const byProduct = new Map<string, VariantRow[]>();
  for (const v of variants) byProduct.set(v.productId, [...(byProduct.get(v.productId) ?? []), v]);
  return { rows, byProduct };
}

function toView(p: ProductRow, variants: VariantRow[] = []): ProductView {
  const prices = variants.map((v) => v.price ?? p.price);
  return {
    id: p.id, title: p.title, brand: p.brand, series: p.series, price: prices.length ? Math.min(...prices) : p.price,
    hue: p.hue, glyph: p.glyph, badge: p.badge, cat: p.cat, imageUrl: p.imageUrl, featured: p.featured, hasVariants: variants.length > 0,
  };
}

export async function listProducts({ cat, sort = "featured" }: { cat?: StoreCategoryId; sort?: StoreSort } = {}): Promise<ProductView[]> {
  const { rows, byProduct } = await catalogue();
  const items = rows.filter((p) => !cat || p.cat === cat).map((p) => toView(p, byProduct.get(p.id)));
  if (sort === "price-asc") items.sort((a, b) => a.price - b.price);
  else if (sort === "price-desc") items.sort((a, b) => b.price - a.price);
  else if (sort === "featured") items.sort((a, b) => Number(b.featured) - Number(a.featured));
  return items; // "newest" is the catalogue order
}

export async function categoryCounts(): Promise<Record<string, number>> {
  const rows = await db.select({ cat: products.cat, n: sql<number>`count(*)::int` }).from(products).groupBy(products.cat);
  return Object.fromEntries(rows.filter((r) => isStoreCategory(r.cat)).map((r) => [r.cat, r.n]));
}

export async function getProduct(id: string): Promise<ProductDetail | null> {
  if (!id || id.length > 100) return null;
  const [p] = await db.select().from(products).where(eq(products.id, id)).limit(1);
  if (!p) return null;
  const [variants, images] = await Promise.all([
    db.select().from(productVariants).where(eq(productVariants.productId, id)).orderBy(asc(productVariants.position)),
    db.select().from(productImages).where(eq(productImages.productId, id)).orderBy(asc(productImages.order)),
  ]);
  return {
    ...toView(p, variants), description: p.description, basePrice: p.price, relatedAnilistIds: p.relatedAnilistIds,
    images: [...new Set([...(p.imageUrl ? [p.imageUrl] : []), ...images.map((i) => i.url)])],
    variants: variants.map((v) => ({ id: v.id, size: v.size, color: v.color, colorHex: v.colorHex, price: v.price ?? p.price, stock: v.stock })),
  };
}

// "Goes with this": the same series first, then anything sharing an AniList title, then the
// same category.
export async function getRelatedProducts(product: ProductDetail, limit = 8): Promise<ProductView[]> {
  const { rows, byProduct } = await catalogue();
  const related = new Set(product.relatedAnilistIds);
  return rows
    .filter((p) => p.id !== product.id)
    .map((p) => ({ p, score: (p.series === product.series ? 4 : 0) + (p.relatedAnilistIds.some((id) => related.has(id)) ? 3 : 0) + (p.cat === product.cat ? 1 : 0) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(({ p }) => toView(p, byProduct.get(p.id)));
}

/* ---------- Recommendations ---------- */

const RECENT_DAYS = 60;
const PER_TITLE = 2;

// Which kinds of merch tend to go with which genres. A nudge (at most one point), never enough
// on its own to outrank a product for a title the member actually rated.
const GENRE_AFFINITY: Record<string, StoreCategoryId[]> = {
  action: ["figure", "apparel"], adventure: ["poster", "figure"], sports: ["apparel"], comedy: ["plush", "accessory"],
  "slice of life": ["plush", "artbook"], romance: ["accessory", "artbook"], fantasy: ["artbook", "poster"], "sci-fi": ["poster", "figure"],
  drama: ["artbook", "manga"], psychological: ["manga", "accessory"], mystery: ["manga", "accessory"], horror: ["apparel", "manga"],
  supernatural: ["apparel", "accessory"], thriller: ["manga", "poster"],
};

// Most ordered in the last 30 days, then newest. Used for signed-out visitors and to fill out
// a personal list that comes up short.
async function trendingOrder(rows: ProductRow[]): Promise<ProductRow[]> {
  const since = new Date(Date.now() - 30 * 86_400_000);
  const sold = await db
    .select({ productId: orderItems.productId, n: sql<number>`sum(${orderItems.quantity})::int` })
    .from(orderItems).innerJoin(orders, eq(orderItems.orderId, orders.id))
    .where(and(gte(orders.createdAt, since), inArray(orders.status, ["paid", "fulfilled"])))
    .groupBy(orderItems.productId);
  const count = new Map(sold.map((s) => [s.productId, s.n]));
  // rows arrive newest first; a stable sort keeps that order among products with equal sales.
  return [...rows].sort((a, b) => (count.get(b.id) ?? 0) - (count.get(a.id) ?? 0));
}

// The anime a product "belongs" to for the two-per-title cap.
const titleKey = (p: ProductRow) => (p.relatedAnilistIds.length ? `a:${Math.min(...p.relatedAnilistIds)}` : `s:${p.series}`);

function capped(ordered: ProductRow[], limit: number, taken: ProductRow[] = []): ProductRow[] {
  const out = [...taken];
  const perTitle = new Map<string, number>();
  for (const p of out) perTitle.set(titleKey(p), (perTitle.get(titleKey(p)) ?? 0) + 1);
  for (const p of ordered) {
    if (out.length >= limit) break;
    if (out.includes(p)) continue;
    const n = perTitle.get(titleKey(p)) ?? 0;
    if (n >= PER_TITLE) continue;
    perTitle.set(titleKey(p), n + 1);
    out.push(p);
  }
  return out;
}

// Up to `limit` products, at most two per title.
//   Signed in: products for titles the member rated 4+ (weighted by rating), is watching or
//   recently finished, or pinned to their profile; plus a small nudge towards the kinds of merch
//   that fit their most-collected genres. Short lists are filled out with trending products.
//   Signed out: trending (most ordered in the last 30 days, else newest).
export async function recommendProducts(userId: string | null, limit = 12): Promise<Recommended> {
  const { rows, byProduct } = await catalogue();
  const view = (list: ProductRow[]) => list.map((p) => toView(p, byProduct.get(p.id)));
  const trending = await trendingOrder(rows);
  if (!userId) return { items: view(capped(trending, limit)), personal: false, basis: [] };

  const [mine, pins] = await Promise.all([
    db.select().from(entries).where(eq(entries.userId, userId)),
    db.select().from(profilePins).where(eq(profilePins.userId, userId)),
  ]);

  const weight = new Map<number, number>();
  const titleOf = new Map<number, string>();
  const add = (anilistId: number | null, w: number, title: string) => {
    if (anilistId == null || w <= 0) return;
    weight.set(anilistId, (weight.get(anilistId) ?? 0) + w);
    titleOf.set(anilistId, title);
  };
  const recentCutoff = Date.now() - RECENT_DAYS * 86_400_000;
  const genreCount = new Map<string, number>();
  for (const e of mine) {
    if (e.rating >= 4) add(e.anilistId, 3 + (e.rating - 4) * 2, e.title); // 4★ → 3, 4.5★ → 4, 5★ → 5
    if ((e.status === "watching" || e.status === "completed") && e.updatedAt.getTime() >= recentCutoff) add(e.anilistId, e.status === "watching" ? 2 : 1.5, e.title);
    for (const g of e.genre.split(",")) {
      const key = g.trim().toLowerCase();
      if (key) genreCount.set(key, (genreCount.get(key) ?? 0) + 1);
    }
  }
  const entryById = new Map(mine.map((e) => [e.id, e]));
  const pinnedProductIds = new Set<string>();
  for (const pin of pins) {
    if (pin.kind === "entry" || pin.kind === "moodboard") {
      const e = entryById.get(pin.targetId);
      if (e) add(e.anilistId, pin.kind === "entry" ? 3 : 2, e.title);
    } else if (pin.kind === "product") pinnedProductIds.add(pin.targetId);
  }
  const pinnedSeries = new Set(rows.filter((p) => pinnedProductIds.has(p.id)).map((p) => p.series));

  // The member's three most-collected genres vote for categories: 1, 0.66 and 0.33 of a point.
  const catBoost = new Map<string, number>();
  [...genreCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).forEach(([genre], i) => {
    for (const cat of GENRE_AFFINITY[genre] ?? []) catBoost.set(cat, Math.max(catBoost.get(cat) ?? 0, 1 - i / 3));
  });

  const scored = rows
    .map((p) => {
      const title = p.relatedAnilistIds.reduce((sum, id) => sum + (weight.get(id) ?? 0), 0);
      const series = pinnedSeries.has(p.series) && !pinnedProductIds.has(p.id) ? 2 : 0;
      // Category affinity only breaks ties among products the member already has a reason to see.
      return { p, strong: title + series, score: title + series + (catBoost.get(p.cat) ?? 0) };
    })
    .filter((r) => r.strong > 0)
    .sort((a, b) => b.score - a.score);

  if (!scored.length) return { items: view(capped(trending, limit)), personal: false, basis: [] };
  const picked = capped(scored.map((r) => r.p), limit);
  const basis = [...weight.entries()]
    .filter(([id]) => picked.some((p) => p.relatedAnilistIds.includes(id)))
    .sort((a, b) => b[1] - a[1]).slice(0, 3).map(([id]) => titleOf.get(id)!);
  return { items: view(capped(trending, limit, picked)), personal: true, basis };
}
