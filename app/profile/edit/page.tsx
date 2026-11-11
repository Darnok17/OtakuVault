import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db, users } from "@/lib/db";
import { getResolvedPins, usernameLockedUntil } from "@/lib/profile";
import { publicFieldsOf } from "@/lib/types";
import { USERNAME_CHANGE_DAYS } from "@/lib/username";
import { avatarOf } from "@/lib/users-db";
import ProfileEditClient from "./ProfileEditClient";

export const metadata: Metadata = { title: "Edit profile · OtakuVault" };

// The proxy only checks that a session cookie exists; the page validates it.
async function EditData() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) redirect("/login?redirect=/profile/edit");
  const [u] = await db.select().from(users).where(eq(users.id, session.user.id));
  if (!u) redirect("/login?redirect=/profile/edit");
  const pins = await getResolvedPins(u.id);
  return (
    <ProfileEditClient
      profile={{
        username: u.username ?? "", displayName: u.displayName, bio: u.bio ?? "", pronouns: u.pronouns ?? "",
        avatar: avatarOf(u), hasUpload: !!u.avatarUrl, isProfilePublic: u.isProfilePublic, publicFields: publicFieldsOf(u.publicFields),
        usernameLockedUntil: usernameLockedUntil(u.usernameChangedAt, USERNAME_CHANGE_DAYS),
      }}
      pins={pins.map(({ board, ...p }) => ({ ...p, nodes: board?.nodes.length ?? null }))}
    />
  );
}

export default function ProfileEditPage() {
  return (
    <main className="ov-page narrow">
      <div className="ov-page-head">
        <nav className="ov-crumbs" aria-label="Breadcrumb">
          <Link href="/settings">Settings</Link><span aria-hidden="true">/</span><span aria-current="page">Edit profile</span>
        </nav>
        <h1 className="ov-masthead">Edit profile</h1>
        <div className="ov-kanji" data-latin="Your profile">プロフィール</div>
      </div>
      <Suspense fallback={<div className="ov-panel" aria-busy="true"><p className="ov-sub">Loading your profile…</p></div>}>
        <EditData />
      </Suspense>
    </main>
  );
}
