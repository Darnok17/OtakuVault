"use server";

import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { auth } from "@/lib/auth";
import { db, users } from "@/lib/db";
import { isThemeId, type ThemeId } from "@/lib/themes";

async function requireUserId() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) throw new Error("Not signed in");
  return session.user.id;
}

// Remembers the theme on the account so it follows the user to their other devices.
export async function saveThemePreference(theme: ThemeId): Promise<void> {
  if (!isThemeId(theme)) throw new Error("Unknown theme");
  const userId = await requireUserId();
  await db.update(users).set({ preferredTheme: theme }).where(eq(users.id, userId));
}

// Settings → Privacy. Per-section visibility lives on the profile edit page.
export async function setProfilePublic(isPublic: boolean): Promise<void> {
  if (typeof isPublic !== "boolean") throw new Error("Invalid value");
  const userId = await requireUserId();
  await db.update(users).set({ isProfilePublic: isPublic }).where(eq(users.id, userId));
}
