import { and, count, desc, eq, inArray, isNull } from "drizzle-orm";
import { db, notificationPreferences, notifications } from "@/lib/db";
import {
  DEFAULT_NOTIFICATION_PREFS, PREF_FOR_TYPE,
  type NotificationFeed, type NotificationPrefs, type NotificationType, type NotificationView,
} from "@/lib/notifications-shared";

// Server-only: creating and reading in-app notifications. Imports the db, and no Next.js APIs,
// so jobs and scripts (tsx) can use it too. Callers are responsible for authorization: every
// function here takes the user id it acts for, which must come from the session or a trusted job.

export type NewNotification = {
  userId: string;
  type: NotificationType;
  title: string;
  body?: string;
  link?: string | null;
  // Names the event so it can't notify the same member twice, e.g. "reply:<postId>".
  dedupeKey: string;
};

export async function getNotificationPrefs(userId: string): Promise<NotificationPrefs> {
  return (await notificationPrefsFor([userId])).get(userId) ?? DEFAULT_NOTIFICATION_PREFS;
}

// Preferences of several members at once; members without a saved row get the defaults.
export async function notificationPrefsFor(userIds: string[]): Promise<Map<string, NotificationPrefs>> {
  const ids = [...new Set(userIds)];
  if (!ids.length) return new Map();
  const rows = await db
    .select({ userId: notificationPreferences.userId, replies: notificationPreferences.replies, newEpisodes: notificationPreferences.newEpisodes, restocks: notificationPreferences.restocks })
    .from(notificationPreferences).where(inArray(notificationPreferences.userId, ids));
  const out = new Map<string, NotificationPrefs>(ids.map((id) => [id, DEFAULT_NOTIFICATION_PREFS]));
  for (const { userId, ...prefs } of rows) out.set(userId, prefs);
  return out;
}

export async function setNotificationPref(userId: string, key: keyof NotificationPrefs, enabled: boolean): Promise<NotificationPrefs> {
  const [row] = await db.insert(notificationPreferences)
    .values({ userId, ...DEFAULT_NOTIFICATION_PREFS, [key]: enabled })
    .onConflictDoUpdate({ target: notificationPreferences.userId, set: { [key]: enabled, updatedAt: new Date() } })
    .returning({ replies: notificationPreferences.replies, newEpisodes: notificationPreferences.newEpisodes, restocks: notificationPreferences.restocks });
  return row;
}

// Inserts the notifications whose recipients have that kind switched on. Events already
// delivered (same user + dedupe key) are skipped. Returns how many were actually created.
export async function createNotifications(list: NewNotification[]): Promise<number> {
  if (!list.length) return 0;
  const prefs = await notificationPrefsFor(list.map((n) => n.userId));
  const wanted = list.filter((n) => prefs.get(n.userId)?.[PREF_FOR_TYPE[n.type]]);
  if (!wanted.length) return 0;
  let created = 0;
  // Chunked so a big episode drop stays well under Postgres' parameter limit.
  for (let i = 0; i < wanted.length; i += 500) {
    const rows = await db.insert(notifications)
      .values(wanted.slice(i, i + 500).map((n) => ({
        userId: n.userId, type: n.type, title: n.title.slice(0, 200), body: (n.body ?? "").slice(0, 400), link: n.link ?? null, dedupeKey: n.dedupeKey,
      })))
      .onConflictDoNothing({ target: [notifications.userId, notifications.dedupeKey] })
      .returning({ id: notifications.id });
    created += rows.length;
  }
  return created;
}

// Checks the member's preferences before inserting. True if a notification was created.
export async function createNotification(n: NewNotification): Promise<boolean> {
  return (await createNotifications([n])) > 0;
}

/* ---------- Reading (always scoped to one member) ---------- */

export async function unreadCount(userId: string): Promise<number> {
  const [{ n }] = await db.select({ n: count() }).from(notifications).where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
  return n;
}

export async function listNotifications(userId: string, limit = 20): Promise<NotificationView[]> {
  const rows = await db.select().from(notifications)
    .where(eq(notifications.userId, userId))
    .orderBy(desc(notifications.createdAt), desc(notifications.id))
    .limit(Math.min(Math.max(limit, 1), 100));
  return rows.map((r) => ({
    id: r.id, type: r.type, title: r.title, body: r.body, link: r.link, read: r.readAt !== null, createdAt: r.createdAt.toISOString(),
  }));
}

export async function notificationFeed(userId: string, limit = 20): Promise<NotificationFeed> {
  const [unread, items] = await Promise.all([unreadCount(userId), listNotifications(userId, limit)]);
  return { unread, items };
}

export async function markRead(userId: string, ids: string[] | "all"): Promise<void> {
  const mine = and(eq(notifications.userId, userId), isNull(notifications.readAt));
  await db.update(notifications).set({ readAt: new Date() })
    .where(ids === "all" ? mine : and(mine, inArray(notifications.id, ids)));
}

// "Hello **world**" → "Hello world": a plain-text excerpt for a notification body.
export function excerpt(markdown: string, max = 140): string {
  const text = markdown
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[`*_~>#]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}
