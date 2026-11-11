import { Suspense } from "react";
import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db, users } from "@/lib/db";
import SettingsClient from "./SettingsClient";

export const metadata: Metadata = { title: "Settings · OtakuVault" };

// The proxy only checks that a session cookie exists; the page validates it.
async function SettingsData() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login?redirect=/settings");
  const [row] = await db
    .select({ name: users.displayName, email: users.email, username: users.username, isProfilePublic: users.isProfilePublic, createdAt: users.createdAt })
    .from(users).where(eq(users.id, session.user.id));
  if (!row) redirect("/login?redirect=/settings");
  return (
    <SettingsClient
      account={{ name: row.name, email: row.email, username: row.username ?? "", isProfilePublic: row.isProfilePublic, joined: row.createdAt.toISOString() }}
    />
  );
}

export default function SettingsPage() {
  return (
    <main className="ov-page">
      <div className="ov-page-head">
        <h1 className="ov-masthead">Settings</h1>
        <div className="ov-kanji" data-latin="Preferences">設定</div>
      </div>
      <Suspense fallback={<div className="ov-panel"><p className="ov-sub">Loading your settings…</p></div>}>
        <SettingsData />
      </Suspense>
    </main>
  );
}
