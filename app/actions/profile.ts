"use server";

import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db, users } from "@/lib/db";
import { deleteImage, isOwnedUpload } from "@/lib/storage";
import { DEFAULT_PUBLIC_FIELDS, type PublicFields } from "@/lib/types";
import { USERNAME_CHANGE_DAYS, slugifyUsername, usernameProblem } from "@/lib/username";
import { isUsernameTaken } from "@/lib/users-db";

export type ProfileResult<T = object> = ({ ok: true } & T) | { ok: false; error: string };

const BIO_MAX = 1000;
const PRONOUNS_MAX = 50;
const NAME_MAX = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

async function sessionUserId() {
  const session = await auth.api.getSession({ headers: await headers() });
  return session?.user.id ?? null;
}

export type ProfileInput = {
  displayName: string; bio: string; pronouns: string; isProfilePublic: boolean; publicFields: PublicFields;
};

export async function saveProfile(input: ProfileInput): Promise<ProfileResult> {
  const userId = await sessionUserId();
  if (!userId) return { ok: false, error: "Your session expired. Log in again." };
  if (!input || typeof input !== "object") return { ok: false, error: "Nothing to save." };
  const displayName = typeof input.displayName === "string" ? input.displayName.trim() : "";
  const bio = typeof input.bio === "string" ? input.bio.replace(/\r\n?/g, "\n").trim() : "";
  const pronouns = typeof input.pronouns === "string" ? input.pronouns.trim() : "";
  if (!displayName) return { ok: false, error: "Add a display name." };
  if (displayName.length > NAME_MAX) return { ok: false, error: `Display names can be at most ${NAME_MAX} characters.` };
  if (bio.length > BIO_MAX) return { ok: false, error: `Bios can be at most ${BIO_MAX} characters.` };
  if (pronouns.length > PRONOUNS_MAX) return { ok: false, error: `Pronouns can be at most ${PRONOUNS_MAX} characters.` };
  const publicFields = { ...DEFAULT_PUBLIC_FIELDS };
  for (const key of Object.keys(DEFAULT_PUBLIC_FIELDS) as (keyof PublicFields)[]) publicFields[key] = input.publicFields?.[key] !== false;

  await db.update(users).set({
    displayName, bio: bio || null, pronouns: pronouns || null, isProfilePublic: input.isProfilePublic !== false, publicFields,
  }).where(eq(users.id, userId));
  return { ok: true };
}

// A username can be changed once every 30 days (the one given at signup doesn't count).
export async function changeUsername(raw: string): Promise<ProfileResult<{ username: string }>> {
  const userId = await sessionUserId();
  if (!userId) return { ok: false, error: "Your session expired. Log in again." };
  const username = slugifyUsername(typeof raw === "string" ? raw.trim() : "");
  if (typeof raw !== "string" || username !== raw.trim().toLowerCase()) return { ok: false, error: "Use lowercase letters, numbers and underscores only." };
  const problem = usernameProblem(username);
  if (problem) return { ok: false, error: `${problem}.` };

  const [me] = await db.select({ username: users.username, changedAt: users.usernameChangedAt }).from(users).where(eq(users.id, userId));
  if (!me) return { ok: false, error: "Account not found." };
  if (me.username === username) return { ok: true, username };
  if (me.changedAt) {
    const next = me.changedAt.getTime() + USERNAME_CHANGE_DAYS * DAY_MS;
    if (next > Date.now()) {
      const date = new Intl.DateTimeFormat("en-US", { dateStyle: "long", timeZone: "UTC" }).format(next);
      return { ok: false, error: `You changed your username recently. You can change it again on ${date}.` };
    }
  }
  if (await isUsernameTaken(username)) return { ok: false, error: "That username is taken." };
  try {
    await db.update(users).set({ username, usernameChangedAt: new Date() }).where(eq(users.id, userId));
  } catch {
    // The unique index is the real guard against two people claiming a name at once.
    return { ok: false, error: "That username is taken." };
  }
  return { ok: true, username };
}

// Sets the profile picture to an image uploaded with uploadImageAction (kind "avatar"),
// or removes it with null. The previous upload is deleted.
export async function setAvatar(url: string | null): Promise<ProfileResult<{ avatar: string | null }>> {
  const userId = await sessionUserId();
  if (!userId) return { ok: false, error: "Your session expired. Log in again." };
  if (url !== null && (typeof url !== "string" || !isOwnedUpload(url, userId))) return { ok: false, error: "That picture can't be used." };
  const [me] = await db.select({ avatarUrl: users.avatarUrl, avatar: users.avatar }).from(users).where(eq(users.id, userId));
  if (!me) return { ok: false, error: "Account not found." };
  await db.update(users).set({ avatarUrl: url }).where(eq(users.id, userId));
  if (me.avatarUrl && me.avatarUrl !== url && isOwnedUpload(me.avatarUrl, userId)) {
    await deleteImage(me.avatarUrl).catch((err) => console.error("Couldn't delete the old avatar:", err));
  }
  return { ok: true, avatar: url ?? me.avatar ?? null };
}
