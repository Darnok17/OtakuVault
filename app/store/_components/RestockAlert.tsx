"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { myRestockAlerts, setNotificationPreference, subscribeRestock, unsubscribeRestock } from "@/app/actions/notifications";
import { authClient } from "@/lib/auth-client";

// "Notify me when restocked" under a sold-out product or variant.
export default function RestockAlert({ productId, variantId }: { productId: string; variantId: string | null }) {
  const { data: session, isPending } = authClient.useSession();
  const signedIn = !!session;
  // Variant ids the member is waiting on for this product ("" = the product itself); null = loading.
  const [alerts, setAlerts] = useState<Set<string> | null>(null);
  const [busy, setBusy] = useState(false);
  const [restocksOff, setRestocksOff] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (!signedIn) return;
    let live = true;
    myRestockAlerts(productId).then(
      (r) => { if (live) { setAlerts(new Set(r.variantIds)); setRestocksOff(!r.restocksOn); } },
      () => { if (live) setAlerts(new Set()); },
    );
    return () => { live = false; };
  }, [productId, signedIn]);

  if (isPending) return null;
  if (!signedIn) {
    return (
      <p className="pd-restock ov-sub">
        Sold out. <Link className="ov-link" href={`/login?redirect=/store/${productId}`}>Log in</Link> to get a notification when it&apos;s back.
      </p>
    );
  }

  const key = variantId ?? "";
  const waiting = alerts?.has(key) ?? false;

  const subscribe = async () => {
    setBusy(true); setMessage(null);
    const res = await subscribeRestock(productId, variantId).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setMessage({ kind: "error", text: res && !res.ok ? res.error : "Couldn't save that. Try again." });
    setAlerts((a) => new Set(a).add(key));
    setRestocksOff(!res.restocksOn);
    setMessage({ kind: "ok", text: "We'll notify you when it's back in stock." });
  };

  const cancel = async () => {
    setBusy(true); setMessage(null);
    const res = await unsubscribeRestock(productId, variantId).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setMessage({ kind: "error", text: "Couldn't cancel the alert. Try again." });
    setAlerts((a) => { const next = new Set(a); next.delete(key); return next; });
    setMessage(null);
  };

  const turnOn = async () => {
    setBusy(true);
    const res = await setNotificationPreference("restocks", true).catch(() => null);
    setBusy(false);
    if (!res?.ok) return setMessage({ kind: "error", text: "Couldn't turn restock notifications on. Try again." });
    setRestocksOff(false);
    setMessage({ kind: "ok", text: "Store restock notifications are on. We'll notify you when it's back." });
  };

  return (
    <div className="pd-restock">
      {waiting
        ? <button type="button" className="btn btn-ghost" disabled={busy} onClick={cancel}>Cancel restock alert</button>
        : <button type="button" className="btn btn-ghost" disabled={busy || alerts === null} onClick={subscribe}>Notify me when restocked</button>}
      {message && <div className={message.kind === "ok" ? "ov-ok" : "ov-error"} role={message.kind === "ok" ? "status" : "alert"}>{message.text}</div>}
      {waiting && restocksOff && (
        <div className="ov-error" role="alert">
          Store restock notifications are switched off in your settings, so this alert won&apos;t reach you.{" "}
          <button type="button" className="ov-link pd-restock-on" disabled={busy} onClick={turnOn}>Turn them on</button>
        </div>
      )}
    </div>
  );
}
