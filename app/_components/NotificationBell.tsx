"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { markAllNotificationsRead, markNotificationsRead } from "@/app/actions/notifications";
import { NOTIFICATIONS_CHANGED, type NotificationFeed, type NotificationView } from "@/lib/notifications-shared";
import TimeAgo from "./TimeAgo";

const POLL_MS = 60_000;

export function BellIcon() {
  return (
    <svg className="nav-notif-icon" viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
      <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
      <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
    </svg>
  );
}

// null when signed out or offline: the bell keeps showing what it had.
const fetchFeed = (): Promise<NotificationFeed | null> =>
  fetch("/api/notifications", { cache: "no-store" }).then((r) => (r.ok ? r.json() : null), () => null);

// Tells other parts of this tab (the bell, the notifications page) to re-read the feed.
export const announceNotificationsChanged = () => window.dispatchEvent(new Event(NOTIFICATIONS_CHANGED));

// The bell in the nav: unread count, the latest ten, mark one or all as read. The feed comes from
// GET /api/notifications, re-read every minute while the tab is visible, on focus and whenever
// this tab changes notification state.
export default function NotificationBell() {
  const [feed, setFeed] = useState<NotificationFeed | null>(null);
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const load = useCallback(() => fetchFeed().then((f) => { if (f) setFeed(f); }), []);

  useEffect(() => {
    void load();
    const tick = () => { if (document.visibilityState === "visible") void load(); };
    const id = setInterval(tick, POLL_MS);
    window.addEventListener("focus", tick);
    window.addEventListener(NOTIFICATIONS_CHANGED, tick);
    return () => {
      clearInterval(id);
      window.removeEventListener("focus", tick);
      window.removeEventListener(NOTIFICATIONS_CHANGED, tick);
    };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("pointerdown", onDown); document.removeEventListener("keydown", onKey); };
  }, [open]);

  const unread = feed?.unread ?? 0;

  const markOne = async (n: NotificationView) => {
    setOpen(false);
    if (n.read) return;
    setFeed((f) => f && { unread: Math.max(f.unread - 1, 0), items: f.items.map((x) => (x.id === n.id ? { ...x, read: true } : x)) });
    const res = await markNotificationsRead([n.id]).catch(() => null);
    if (!res?.ok) void load();
    else announceNotificationsChanged();
  };

  const markAll = async () => {
    const before = feed;
    setError(null);
    setFeed((f) => f && { unread: 0, items: f.items.map((x) => ({ ...x, read: true })) });
    const res = await markAllNotificationsRead().catch(() => null);
    if (!res?.ok) { setFeed(before); setError("Couldn't mark them read. Try again."); }
    else announceNotificationsChanged();
  };

  return (
    <div className="nav-user nav-notif" ref={ref}>
      <button
        type="button" className="nav-user-trigger nav-notif-trigger" aria-haspopup="true" aria-expanded={open}
        aria-label={unread ? `Notifications, ${unread} unread` : "Notifications"}
        onClick={() => { setOpen(!open); setError(null); if (!open) void load(); }}
      >
        <BellIcon />
        {unread > 0 && <span className="nav-notif-count" aria-hidden="true">{unread > 99 ? "99+" : unread}</span>}
      </button>
      {open && (
        <div className="nav-user-menu nav-notif-menu" role="dialog" aria-label="Notifications">
          <div className="nav-notif-head">
            <span className="nav-notif-heading">Notifications</span>
            <button type="button" className="nav-notif-markall" disabled={!unread} onClick={markAll}>Mark all read</button>
          </div>
          {error && <p className="nav-notif-error" role="alert">{error}</p>}
          {!feed ? (
            <p className="nav-notif-empty">Loading…</p>
          ) : feed.items.length === 0 ? (
            <p className="nav-notif-empty">Nothing yet. Replies to your posts, new episodes of what you&apos;re watching and restocks you asked about show up here.</p>
          ) : (
            <ul className="nav-notif-list">
              {feed.items.map((n) => (
                <li key={n.id}>
                  <Link href={n.link ?? "/notifications"} className={`nav-notif-item${n.read ? "" : " unread"}`} onClick={() => void markOne(n)}>
                    <span className="nav-notif-title">{n.title}</span>
                    {n.body && <span className="nav-notif-body">{n.body}</span>}
                    <TimeAgo className="nav-notif-time" date={n.createdAt} />
                  </Link>
                </li>
              ))}
            </ul>
          )}
          <div className="nav-notif-foot">
            <Link href="/notifications" className="nav-user-item" onClick={() => setOpen(false)}>See all</Link>
            <Link href="/settings#notifications" className="nav-user-item" onClick={() => setOpen(false)}>Settings</Link>
          </div>
        </div>
      )}
    </div>
  );
}
