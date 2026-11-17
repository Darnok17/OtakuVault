"use server";

import { headers } from "next/headers";
import { and, eq, isNull } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db, productVariants, products, restockSubscriptions } from "@/lib/db";
import { getNotificationPrefs, markRead, setNotificationPref } from "@/lib/notifications";
import { isPrefKey, type NotificationPrefs } from "@/lib/notifications-shared";

// Notification writes. The member is always taken from the session; ids sent by the browser
// only ever narrow what the member's own rows are touched.

export type NotifResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const SIGN_IN = "Log in to do that.";
const isId = (v: unknown): v is string => typeof v === "string" && v.length > 0 && v.length <= 100;

async function sessionUserId() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user.id ?? null;
}

// Settings → Notifications. Returns the saved preferences so the page can confirm them.
export async function setNotificationPreference(key: string, enabled: boolean): Promise<NotifResult<{ prefs: NotificationPrefs }>> {
  const userId = await sessionUserId();
  if (!userId) return { ok: false, error: SIGN_IN };
  if (!isPrefKey(key) || typeof enabled !== "boolean") return { ok: false, error: "Unknown setting." };
  return { ok: true, prefs: await setNotificationPref(userId, key, enabled) };
}

export async function markNotificationsRead(ids: string[]): Promise<NotifResult> {
  const userId = await sessionUserId();
  if (!userId) return { ok: false, error: SIGN_IN };
  if (!Array.isArray(ids) || !ids.length || ids.length > 100 || !ids.every(isId)) return { ok: false, error: "Nothing to mark." };
  await markRead(userId, ids);
  return { ok: true };
}

export async function markAllNotificationsRead(): Promise<NotifResult> {
  const userId = await sessionUserId();
  if (!userId) return { ok: false, error: SIGN_IN };
  await markRead(userId, "all");
  return { ok: true };
}

/* ---------- Restock alerts ---------- */

// "Notify me when restocked" on a sold-out product or variant. `restocksOn` tells the UI whether
// the member's Store restocks switch is on; when it's off the alert is kept but nothing is sent.
export async function subscribeRestock(productId: string, variantId: string | null): Promise<NotifResult<{ restocksOn: boolean }>> {
  const userId = await sessionUserId();
  if (!userId) return { ok: false, error: "Log in to get restock alerts." };
  if (!isId(productId) || (variantId !== null && !isId(variantId))) return { ok: false, error: "Product not found." };
  const [product] = await db.select({ id: products.id }).from(products).where(eq(products.id, productId));
  if (!product) return { ok: false, error: "Product not found." };
  if (variantId) {
    const [v] = await db.select({ id: productVariants.id }).from(productVariants)
      .where(and(eq(productVariants.id, variantId), eq(productVariants.productId, productId)));
    if (!v) return { ok: false, error: "That option isn't available." };
  }
  await db.insert(restockSubscriptions).values({ userId, productId, variantId }).onConflictDoNothing();
  return { ok: true, restocksOn: (await getNotificationPrefs(userId)).restocks };
}

export async function unsubscribeRestock(productId: string, variantId: string | null): Promise<NotifResult> {
  const userId = await sessionUserId();
  if (!userId) return { ok: false, error: SIGN_IN };
  if (!isId(productId) || (variantId !== null && !isId(variantId))) return { ok: false, error: "Product not found." };
  await db.delete(restockSubscriptions).where(and(
    eq(restockSubscriptions.userId, userId), eq(restockSubscriptions.productId, productId),
    variantId ? eq(restockSubscriptions.variantId, variantId) : isNull(restockSubscriptions.variantId),
  ));
  return { ok: true };
}

// The member's open restock alerts for one product, as variant ids ("" = the product itself),
// and whether their Store restocks switch is on.
export async function myRestockAlerts(productId: string): Promise<{ variantIds: string[]; restocksOn: boolean }> {
  const userId = await sessionUserId();
  if (!userId || !isId(productId)) return { variantIds: [], restocksOn: false };
  const [rows, prefs] = await Promise.all([
    db.select({ variantId: restockSubscriptions.variantId }).from(restockSubscriptions)
      .where(and(eq(restockSubscriptions.userId, userId), eq(restockSubscriptions.productId, productId))),
    getNotificationPrefs(userId),
  ]);
  return { variantIds: rows.map((r) => r.variantId ?? ""), restocksOn: prefs.restocks };
}
