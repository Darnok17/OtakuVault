import { Suspense } from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { auth } from "@/lib/auth";
import { listNotifications } from "@/lib/notifications";
import NotificationsClient from "./NotificationsClient";

export const metadata: Metadata = { title: "Notifications · OtakuVault" };

// The proxy only checks that a session cookie exists; the page validates it.
async function NotificationsData() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login?redirect=/notifications");
  return <NotificationsClient initial={await listNotifications(session.user.id, 100)} />;
}

export default function NotificationsPage() {
  return (
    <main className="ov-page narrow">
      <div className="ov-page-head">
        <h1 className="ov-masthead">Notifications</h1>
        <div className="ov-kanji" data-latin="Notices">通知</div>
      </div>
      <Suspense fallback={<div className="ov-panel"><p className="ov-sub">Loading your notifications…</p></div>}>
        <NotificationsData />
      </Suspense>
    </main>
  );
}
