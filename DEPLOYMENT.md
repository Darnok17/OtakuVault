# Deployment

Production runs on **Vercel** (app + Blob image storage) with **Neon** (Postgres).
Vercel deploys automatically from GitHub: every push to `main` goes to production, every other branch/PR gets a preview deployment.
GitHub Actions (`.github/workflows/ci.yml`) only lints and builds; it never deploys.

No `vercel.json` is needed. Vercel detects Next.js and pnpm automatically.

---

## Environment variables

Set these in **Vercel → Project → Settings → Environment Variables**. Never commit real values; `.env*` is gitignored (except `.env.example`).

| Variable | Required | What it is | Where to get it |
| --- | --- | --- | --- |
| `DATABASE_URL` | Yes | Postgres connection string the app uses at runtime. Use Neon's **pooled** string (host contains `-pooler`). | Neon → project → **Connect** → "Connection pooling" on → copy. |
| `BETTER_AUTH_SECRET` | Yes | Signs session cookies and tokens. Changing it logs everyone out. | Generate: `openssl rand -base64 32` (see below). |
| `BETTER_AUTH_URL` | Yes | Public base URL of the site, no trailing slash, e.g. `https://otakuvault.vercel.app`. | Your Vercel production domain (or custom domain later). |
| `BLOB_READ_WRITE_TOKEN` | Yes | Vercel Blob token for cover/moodboard uploads. | Set **automatically** when you connect a Blob store to the project (see below). Don't copy it by hand. |
| `ENABLE_EXPERIMENTAL_COREPACK` | Recommended | Set to `1` so Vercel uses the exact pnpm version from `packageManager` in `package.json`. | Just the value `1`. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Optional | Google sign-in. Provider is disabled unless both are set. | Google Cloud Console → APIs & Services → Credentials → OAuth client (Web). |
| `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET` | Optional | Discord sign-in. | discord.com/developers → Applications → OAuth2. |
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | Optional | GitHub sign-in. | GitHub → Settings → Developer settings → OAuth Apps. |
| `ANILIST_API_URL` | No | Override for the AniList GraphQL endpoint. Leave unset in production. | n/a |
| `VERCEL_BLOB_READ_WRITE_TOKEN` | No | Takes precedence over `BLOB_READ_WRITE_TOKEN` if set. Not needed on Vercel. | n/a |
| `STORAGE_DRIVER` | No | `local` or `blob`; overrides the NODE_ENV default. Leave unset in production (defaults to `blob`). | n/a |

**OAuth callback URLs** (register these with each provider you enable):
`<BETTER_AUTH_URL>/api/auth/callback/google`, `.../callback/discord`, `.../callback/github`.

**Environments:** scope the variables above to **Production**. Preview deployments need their own `DATABASE_URL` to work at runtime; a Neon branch is the easy way (don't point previews at the production database). Sign-in on previews also needs `BETTER_AUTH_URL` to match the preview URL, so expect auth to be broken there unless you set that up.

### Generating `BETTER_AUTH_SECRET`

```bash
openssl rand -base64 32
```

Paste the output into Vercel as `BETTER_AUTH_SECRET` (Production). Use a different value from your local `.env`. Don't store it anywhere in the repo.

No `openssl`? `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"` does the same.

---

## Neon (Postgres)

1. Sign in at https://console.neon.tech.
2. **New Project** → name `otakuvault`, Postgres version: latest, **Region: AWS US East (N. Virginia)** (Vercel functions default to `iad1` in the same area, which keeps queries fast).
3. Open the project → **Connect**. Copy two strings:
   - **Pooled** (toggle "Connection pooling" on; host contains `-pooler`): this is `DATABASE_URL` in Vercel.
   - **Direct** (toggle off): use this only for running migrations from your machine.
4. Keep `?sslmode=require` at the end of both. If the string also has `&channel_binding=require` and you hit connection errors, remove that part.

---

## Database migrations

Schema lives in `lib/db/schema.ts`; SQL migrations are committed in `./drizzle`.

**Changing the schema:**

```bash
# 1. edit lib/db/schema.ts
pnpm db:generate --name <short_description>   # writes drizzle/NNNN_<name>.sql
# 2. review the SQL, commit it with the code change
```

**Applying to production** (from your machine, before or right after the deploy that needs it):

```bash
DATABASE_URL='<Neon DIRECT connection string>' pnpm db:migrate
```

- Use the **direct** (non-pooler) string for migrations.
- The inline `DATABASE_URL` wins over your local `.env` (dotenv doesn't override existing variables).
- Drizzle records applied migrations in the `drizzle.__drizzle_migrations` table, so re-running is safe.
- Never run `pnpm db:push` against production. It skips the migration history.
- Prefer additive changes (add column → deploy → backfill → drop old column later) so the old and new app versions both work during a deploy.

**First deploy:** run the command above once against the empty Neon database to create all tables from `drizzle/0000_init.sql`.

---

## Vercel Blob (image storage)

1. Vercel → your project → **Storage** → **Create Database** → **Blob** → name it (e.g. `otakuvault-images`). If asked for access, choose **Public** (the app stores covers as public URLs).
2. Connect it to the project for the **Production** environment (add Preview/Development too if you want uploads there).
3. Vercel adds `BLOB_READ_WRITE_TOKEN` to the project automatically. Redeploy so the running app picks it up.

To run the app locally against production Blob (e.g. for `pnpm db:migrate-images`), copy the token from the store's settings into your local `.env` and set `STORAGE_DRIVER=blob`. Don't commit it.

---

## First production deploy (checklist)

1. Push this repo to GitHub (`main`).
2. Create the Neon project (above) and run the first migration.
3. Vercel → **Add New → Project** → import `Darnok17/otakuvault`. Framework: Next.js (auto). Leave build/install commands at their defaults.
4. Before clicking Deploy, add `DATABASE_URL`, `BETTER_AUTH_SECRET`, `ENABLE_EXPERIMENTAL_COREPACK=1`, and any OAuth vars. Set `BETTER_AUTH_URL` to the URL Vercel will give you (`https://<project>.vercel.app`); you can correct it after the first deploy.
5. Deploy. Then create and connect the Blob store, check `BETTER_AUTH_URL` matches the real URL, and **Redeploy** (Deployments → ⋯ → Redeploy) so env changes take effect.
6. Smoke test: sign up, add an entry with an uploaded cover, reload and confirm it persists.

Environment variable changes never apply to existing deployments. Always redeploy after changing them.

---

## Rolling back

**App:** Vercel → project → **Deployments** → find the last good production deployment → **⋯ → Instant Rollback**. This switches traffic immediately, with no rebuild.
After an instant rollback Vercel stops auto-promoting new pushes to production. Once the fix is on `main`, open the new deployment and choose **Promote** to resume.

Alternative: `git revert <bad commit>` and push to `main`. Vercel builds and deploys the revert like any other commit.

**Database:** Drizzle migrations are forward-only; there's no automatic "down".
- If the bad deploy included a migration, write a new migration that undoes it and apply it with `pnpm db:migrate`.
- For data loss or corruption, use Neon's point-in-time restore: Neon console → project → **Backup & Restore** (or restore a branch to a timestamp). Check your plan's restore window; on the free tier it's short, so act quickly.
- Rolling the app back doesn't roll the schema back. That's why additive migrations matter.

---

## Custom domain (later)

1. Vercel → project → **Settings → Domains** → **Add** → enter `yourdomain.com` (Vercel offers to add `www` too).
2. At your registrar, add the DNS records Vercel shows (typically an `A` record for the apex and a `CNAME` for `www`). Or switch nameservers to Vercel. HTTPS certificates are issued automatically once DNS resolves.
3. Update `BETTER_AUTH_URL` to `https://yourdomain.com` and **redeploy**.
4. Add the new callback URLs (`https://yourdomain.com/api/auth/callback/<provider>`) in each OAuth provider's console.
5. Existing sessions are tied to the old domain's cookies, so users will need to sign in again.

---

## Stripe (not implemented yet)

There is no Stripe code in the app yet: no `stripe` dependency, no `/api/webhooks/stripe` route, no Stripe env vars. The `orders.stripe_session_id` column is ready for it. When checkout is built:

1. Add the route handler at `app/api/webhooks/stripe/route.ts` (verifies the signature with `STRIPE_WEBHOOK_SECRET`).
2. Stripe Dashboard → **Developers → Webhooks → Add endpoint** → URL `https://<your domain>/api/webhooks/stripe` → select events (at minimum `checkout.session.completed`).
3. Copy the endpoint's **Signing secret** (`whsec_...`) into Vercel as `STRIPE_WEBHOOK_SECRET`, plus `STRIPE_SECRET_KEY` (Developers → API keys). Use test-mode keys until you're ready to go live, then repeat with live-mode keys.
4. Redeploy, then use **Send test event** in the Stripe dashboard to confirm it returns 200.

Update the table at the top of this file when those variables exist.
