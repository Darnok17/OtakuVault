import { and, eq, inArray, isNull, or } from "drizzle-orm";
import { db, productVariants, products, restockSubscriptions } from "@/lib/db";
import { createNotifications, notificationPrefsFor } from "@/lib/notifications";

// Server-only stock changes. There is no inventory admin or Stripe webhook yet; whatever ends
// up changing stock (an admin form, a Stripe/fulfilment webhook, a sync script) should go
// through setVariantStock / setProductStock so that a sold-out item coming back fires the
// restock alerts. A flow that changes stock some other way can call notifyRestock() itself.

export async function setVariantStock(variantId: string, stock: number): Promise<{ restocked: boolean; notified: number }> {
  if (!Number.isInteger(stock) || stock < 0) throw new Error("Stock must be a whole number ≥ 0");
  const before = await db.transaction(async (tx) => {
    const [row] = await tx.select({ productId: productVariants.productId, stock: productVariants.stock })
      .from(productVariants).where(eq(productVariants.id, variantId)).for("update");
    if (!row) throw new Error(`Unknown variant ${variantId}`);
    await tx.update(productVariants).set({ stock }).where(eq(productVariants.id, variantId));
    return row;
  });
  if (before.stock > 0 || stock <= 0) return { restocked: false, notified: 0 };
  return { restocked: true, notified: await notifyRestock(before.productId, variantId) };
}

// For products sold without variants. null stops tracking stock (always available).
export async function setProductStock(productId: string, stock: number | null): Promise<{ restocked: boolean; notified: number }> {
  if (stock !== null && (!Number.isInteger(stock) || stock < 0)) throw new Error("Stock must be a whole number ≥ 0, or null");
  const before = await db.transaction(async (tx) => {
    const [row] = await tx.select({ stock: products.stock }).from(products).where(eq(products.id, productId)).for("update");
    if (!row) throw new Error(`Unknown product ${productId}`);
    await tx.update(products).set({ stock }).where(eq(products.id, productId));
    return row;
  });
  const wasOut = before.stock !== null && before.stock <= 0;
  const nowIn = stock === null || stock > 0;
  if (!wasOut || !nowIn) return { restocked: false, notified: 0 };
  return { restocked: true, notified: await notifyRestock(productId, null) };
}

// Tells everyone waiting on this product (or this variant of it) that it's back, respecting their
// Store restocks switch. Alerts are one-shot: delivered ones are removed; alerts held back by a
// switched-off preference stay, so turning restocks on later still covers the next restock.
// variantId null = the product itself came back. Returns how many notifications were created.
export async function notifyRestock(productId: string, variantId: string | null = null): Promise<number> {
  const [product] = await db.select({ id: products.id, title: products.title }).from(products).where(eq(products.id, productId));
  if (!product) return 0;
  let label: string | null = null;
  if (variantId) {
    const [v] = await db.select({ size: productVariants.size, color: productVariants.color }).from(productVariants)
      .where(and(eq(productVariants.id, variantId), eq(productVariants.productId, productId)));
    if (!v) return 0;
    label = [v.color, v.size].filter(Boolean).join(" · ") || null;
  }

  // A variant restock also answers alerts set on the product as a whole.
  const subs = await db.select({ id: restockSubscriptions.id, userId: restockSubscriptions.userId }).from(restockSubscriptions)
    .where(and(
      eq(restockSubscriptions.productId, productId),
      variantId ? or(eq(restockSubscriptions.variantId, variantId), isNull(restockSubscriptions.variantId)) : isNull(restockSubscriptions.variantId),
    ));
  if (!subs.length) return 0;

  const created = await createNotifications(subs.map((s) => ({
    userId: s.userId,
    type: "restock" as const,
    title: `Back in stock: ${product.title}${label ? ` (${label})` : ""}`,
    body: "Something you asked about is available again. Stock can be limited.",
    link: `/store/${productId}`,
    dedupeKey: `restock:${s.id}`,
  })));

  // createNotifications skips members with restocks switched off; only consume delivered alerts.
  const prefs = await notificationPrefsFor(subs.map((s) => s.userId));
  const delivered = subs.filter((s) => prefs.get(s.userId)?.restocks).map((s) => s.id);
  if (delivered.length) await db.delete(restockSubscriptions).where(inArray(restockSubscriptions.id, delivered));
  return created;
}
