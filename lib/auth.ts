import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db, users, sessions, accounts, verifications } from "@/lib/db";
import { seedStarterEntries } from "@/lib/starter-entries";
import { DEFAULT_THEME } from "@/lib/themes";
import { slugifyUsername, usernameProblem } from "@/lib/username";
import { generateUsername, isUsernameTaken } from "@/lib/users-db";

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

// Which OAuth buttons can work; the login and signup pages disable the rest.
export const oauthConfigured = { google: !!google, discord: !!discord, github: !!github };

export const TERMS_REQUIRED = "You must agree to the Terms and Privacy Policy";

// The signup form's extra fields. They ride along in the sign-up body under names Better-Auth
// doesn't know, are checked here before the account exists, and are applied in the create hook.
type SignupExtras = { agreedToTerms?: unknown; desiredUsername?: unknown };
const signupExtras = (ctx: { path?: string; body?: unknown } | null): SignupExtras | null =>
  ctx?.path === "/sign-up/email" ? ((ctx.body ?? {}) as SignupExtras) : null;

// BETTER_AUTH_SECRET and BETTER_AUTH_URL are read from env automatically.
export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    usePlural: true,
    schema: { users, sessions, accounts, verifications },
  }),
  user: {
    fields: { name: "displayName", image: "avatar" },
    // Columns of ours that travel with the session. None can be set through Better-Auth's own
    // sign-up/update endpoints (input: false); they change through our server actions only.
    additionalFields: {
      username: { type: "string", required: false, input: false },
      avatarUrl: { type: "string", required: false, input: false },
      preferredTheme: { type: "string", required: false, defaultValue: DEFAULT_THEME, input: false },
      isAdmin: { type: "boolean", required: false, defaultValue: false, input: false },
      agreedToTermsAt: { type: "date", required: false, input: false, returned: false },
    },
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
  hooks: {
    // Email signup: the Terms box must be ticked, and a typed username must be usable.
    before: createAuthMiddleware(async (ctx) => {
      const extras = signupExtras(ctx);
      if (!extras) return;
      if (extras.agreedToTerms !== true) throw new APIError("BAD_REQUEST", { message: TERMS_REQUIRED });
      if (typeof extras.desiredUsername === "string" && extras.desiredUsername.trim()) {
        const wanted = extras.desiredUsername.trim().toLowerCase();
        const problem = usernameProblem(wanted);
        if (problem) throw new APIError("BAD_REQUEST", { message: problem });
        if (await isUsernameTaken(wanted)) throw new APIError("UNPROCESSABLE_ENTITY", { message: "That username is taken" });
      }
    }),
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user, ctx) => {
          const extras = signupExtras(ctx);
          const wanted = typeof extras?.desiredUsername === "string" ? slugifyUsername(extras.desiredUsername.trim()) : "";
          // The username typed at signup (already validated above); OAuth signups and anything
          // unusable fall back to the email prefix.
          const username = wanted && !usernameProblem(wanted) && !(await isUsernameTaken(wanted))
            ? wanted
            : await generateUsername(user.email.split("@")[0]);
          return {
            data: {
              ...user,
              username,
              // Whoever creates the first account runs the place.
              isAdmin: (await db.$count(users)) === 0,
              // Email signups ticked the box (enforced above); OAuth buttons sit under the same notice.
              agreedToTermsAt: new Date(),
            },
          };
        },
        after: async (user) => {
          // A failed seed shouldn't fail the signup; it is retried when the collection first loads.
          try {
            await seedStarterEntries(user.id);
          } catch (err) {
            console.error("Starter seed failed for", user.id, err);
          }
        },
      },
    },
  },
  // Must stay last so cookies set in server actions reach the browser.
  plugins: [nextCookies()],
});

export type Session = typeof auth.$Infer.Session;
