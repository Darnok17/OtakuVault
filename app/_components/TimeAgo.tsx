"use client";

import { useSyncExternalStore } from "react";

// "2h ago", with the full date on hover. The relative text depends on the clock, so the server
// (and the first client render) show the date instead and the client swaps it in afterwards;
// it then refreshes once a minute.

const subscribe = (cb: () => void) => {
  const id = setInterval(cb, 60_000);
  return () => clearInterval(id);
};
const minuteNow = () => Math.floor(Date.now() / 60_000);

export function relativeTime(then: number, now: number) {
  const s = Math.max(0, Math.round((now - then) / 1000));
  if (s < 45) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d}d ago`;
  const mo = Math.round(d / 30.4);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.round(d / 365)}y ago`;
}

const ABSOLUTE = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeStyle: "short", timeZone: "UTC" });
const DAY = new Intl.DateTimeFormat("en-US", { dateStyle: "medium", timeZone: "UTC" });

export default function TimeAgo({ date, className }: { date: string | number | Date; className?: string }) {
  const then = new Date(date).getTime();
  const minute = useSyncExternalStore(subscribe, minuteNow, () => null);
  const iso = new Date(then).toISOString();
  return (
    <time className={className} dateTime={iso} title={`${ABSOLUTE.format(then)} UTC`}>
      {minute === null ? DAY.format(then) : relativeTime(then, minute * 60_000)}
    </time>
  );
}
