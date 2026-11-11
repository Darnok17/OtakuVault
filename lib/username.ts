// Username rules, shared by the signup form, the profile editor and the server. Pure — no imports.

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 20;
export const USERNAME_CHANGE_DAYS = 30;

// Names that would collide with a route under /profile, or pass for staff.
// Keep in sync with the backfill in drizzle/0002_themes_community_store.sql.
export const RESERVED_USERNAMES = new Set([
  "admin", "administrator", "edit", "settings", "me", "new", "null", "undefined", "otakuvault", "support",
  "help", "api", "login", "signup", "deleted", "anonymous", "moderator", "mod", "staff", "system", "root", "official",
]);

// Lowercase letters, digits and underscores only; anything else is dropped.
export const slugifyUsername = (raw: string) =>
  raw.normalize("NFKD").toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, USERNAME_MAX);

// Why a username can't be used, or null when it is fine (availability is checked separately).
export function usernameProblem(name: string): string | null {
  if (name.length < USERNAME_MIN) return `Usernames need at least ${USERNAME_MIN} characters`;
  if (name.length > USERNAME_MAX) return `Usernames can be at most ${USERNAME_MAX} characters`;
  if (!/^[a-z0-9_]+$/.test(name)) return "Use lowercase letters, numbers and underscores only";
  if (RESERVED_USERNAMES.has(name)) return "That username is reserved";
  return null;
}
