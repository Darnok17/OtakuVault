import { eq } from "drizzle-orm";
import { db, users } from "@/lib/db";
import { RESERVED_USERNAMES, USERNAME_MAX, USERNAME_MIN, slugifyUsername } from "@/lib/username";

// Server-only user helpers shared by the auth hooks and the profile/settings actions.

export async function isUsernameTaken(username: string) {
  const [row] = await db.select({ id: users.id }).from(users).where(eq(users.username, username)).limit(1);
  return !!row;
}

// A free username derived from `seeds` (tried in order: the name typed at signup, then the email
// prefix). Collisions and reserved names get a numeric suffix: "luffy", "luffy2", "luffy3"…
export async function generateUsername(...seeds: (string | null | undefined)[]) {
  let base = "";
  for (const seed of seeds) {
    base = slugifyUsername(seed ?? "");
    if (base.length >= USERNAME_MIN) break;
  }
  if (base.length < USERNAME_MIN) base = `user_${base}`.slice(0, USERNAME_MAX);
  for (let n = 1; n < 10_000; n++) {
    const suffix = n === 1 ? "" : String(n);
    const candidate = base.slice(0, USERNAME_MAX - suffix.length) + suffix;
    if (!RESERVED_USERNAMES.has(candidate) && !(await isUsernameTaken(candidate))) return candidate;
  }
  return `user_${crypto.randomUUID().slice(0, 8)}`;
}

// The avatar to show for a user: their upload, else the picture their OAuth provider gave us.
export const avatarOf = (u: { avatarUrl: string | null; avatar: string | null }) => u.avatarUrl ?? u.avatar ?? null;
