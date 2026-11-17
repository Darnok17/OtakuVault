"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { markAllNotificationsRead, markNotificationsRead } from "@/app/actions/notifications";
import { announceNotificationsChanged } from "@/app/_components/NotificationBell";
import TimeAgo from "@/app/_components/TimeAgo";
import { NOTIFICATIONS_CHANGED, type NotificationType, type NotificationView } from "@/lib/notifications-shared";

const KIND: Record<NotificationType, string> = { reply: "Reply", new_episode: "New episode", restock: "Restock" };

export default function NotificationsClient({ initial }: { initial: NotificationView[] }) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [onlyUnread, setOnlyUnread] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // New server data (router.refresh after the bell changed something) replaces the local copy.
  const [seen, setSeen] = useState(initial);
  if (seen !== initial) { setSeen(initial); setItems(initial); }

  useEffect(() => {
    const refresh = () => router.refresh();
    window.addEventListener(NOTIFICATIONS_CHANGED, refresh);
    return () => window.removeEventListener(NOTIFICATIONS_CHANGED, refresh);
  }, [router]);

  const unread = items.filter((n) => !n.read).length;
  const shown = onlyUnread ? items.filter((n) => !n.read) : items;

  const mark = async (ids: string[] | "all") => {
    const before = items;
    setError(null);
    setItems((list) => list.map((n) => (ids === "all" || ids.includes(n.id) ? { ...n, read: true } : n)));
    const res = await (ids === "all" ? markAllNotificationsRead() : markNotificationsRead(ids)).catch(() => null);
    if (!res?.ok) { setItems(before); setError("Couldn't save that. Try again."); return; }
    // Keeps the bell's count in step (this page hears it too and refreshes to the saved state).
    announceNotificationsChanged();
  };

  return (
    <section className="ov-panel">
      <div className="ov-row between" style={{ marginBottom: "1rem" }}>
        <div className="ov-chips" role="group" aria-label="Show">
          <button type="button" className="ov-chip" aria-pressed={!onlyUnread} onClick={() => setOnlyUnread(false)}>All</button>
          <button type="button" className="ov-chip" aria-pressed={onlyUnread} onClick={() => setOnlyUnread(true)}>Unread · {unread}</button>
        </div>
        <div className="ov-row">
          <Link className="ov-link" href="/settings#notifications">Notification settings</Link>
          <button type="button" className="btn btn-ghost" disabled={!unread} onClick={() => void mark("all")}>Mark all read</button>
        </div>
      </div>
      {error && <div className="ov-error" role="alert" style={{ marginBottom: "1rem" }}>{error}</div>}
      {shown.length === 0 ? (
        <div className="ov-empty">
          <strong>{onlyUnread ? "All caught up" : "No notifications yet"}</strong>
          Replies to your posts, new episodes of what you&apos;re watching and restocks you asked about show up here.
        </div>
      ) : (
        <ul className="nt-list">
          {shown.map((n) => (
            <li key={n.id} className={`nt-item${n.read ? "" : " unread"}`}>
              <div className="nt-main">
                <span className="ov-meta">{KIND[n.type]} · <TimeAgo date={n.createdAt} /></span>
                {n.link
                  ? <Link className="nt-title" href={n.link} onClick={() => { if (!n.read) void mark([n.id]); }}>{n.title}</Link>
                  : <span className="nt-title">{n.title}</span>}
                {n.body && <p className="nt-body">{n.body}</p>}
              </div>
              {!n.read && <button type="button" className="ov-chip" onClick={() => void mark([n.id])}>Mark read</button>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
