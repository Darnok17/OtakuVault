import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db, users, sessions, accounts, verifications } from "@/lib/db";
import { seedDemoEntries } from "@/lib/demo-entries";

const DAY = 60 * 60 * 24;

// Only register an OAuth provider once its credentials are filled in,
// so email/password works with blank OAuth env vars.
function oauth(prefix: string) {
  const clientId = process.env[`${prefix}_CLIENT_ID`];
  const clientSecret = process.env[`${prefix}_CLIENT_SECRET`];
  return clientId && clientSecret ? { clientId, clientSecret } : undefined;
}

const google = oauth("GOOGLE");
const discord = oauth("DISCORD");
const github = oauth("GITHUB");

// BETTER_AUTH_SECRET and BETTER_AUTH_URL are read from env automatically.
export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    usePlural: true,
    schema: { users, sessions, accounts, verifications },
  }),
  user: {
    fields: { name: "displayName", image: "avatar" },
  },
  session: {
    expiresIn: 30 * DAY, // also the session cookie's max-age
    updateAge: DAY, // slide the expiry forward at most once a day
  },
  emailAndPassword: { enabled: true },
  socialProviders: {
    ...(google && { google }),
    ...(discord && { discord }),
    ...(github && { github }),
  },
  databaseHooks: {
    user: {
      create: {
        after: async (user) => {
          // A failed seed shouldn't fail the signup; the user just starts empty.
          try {
            await seedDemoEntries(user.id);
          } catch (err) {
            console.error("Demo seed failed for", user.id, err);
          }
        },
      },
    },
  },
  // Must stay last so cookies set in server actions reach the browser.
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
