// Notification constants and view models shared by server and client. Pure — no imports.

export type NotificationType = "reply" | "new_episode" | "restock";

// One switch per kind of notification (Settings → Notifications).
export type NotificationPrefs = { replies: boolean; newEpisodes: boolean; restocks: boolean };
export type NotificationPrefKey = keyof NotificationPrefs;

export const DEFAULT_NOTIFICATION_PREFS: NotificationPrefs = { replies: true, newEpisodes: true, restocks: false };

export const PREF_FOR_TYPE: Record<NotificationType, NotificationPrefKey> = {
  reply: "replies", new_episode: "newEpisodes", restock: "restocks",
};

export const NOTIFICATION_PREFS: { key: NotificationPrefKey; title: string; desc: string }[] = [
  { key: "replies", title: "Replies", desc: "Someone replies to a thread you started or to one of your posts in the forum." },
  { key: "newEpisodes", title: "New episodes", desc: "A new episode airs for an anime you've marked as Watching in your collection." },
  { key: "restocks", title: "Store restocks", desc: "A sold-out store item you asked about (\"Notify me when restocked\") is back in stock." },
];

export const isPrefKey = (v: unknown): v is NotificationPrefKey => NOTIFICATION_PREFS.some((p) => p.key === v);

export type NotificationView = {
  id: string; type: NotificationType; title: string; body: string; link: string | null;
  read: boolean; createdAt: string; // ISO
};

export type NotificationFeed = { unread: number; items: NotificationView[] };

// Fired on window whenever this tab changes notification state, so the bell and the
// notifications page stay in step without another request.
export const NOTIFICATIONS_CHANGED = "ov:notifications-changed";
