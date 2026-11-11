# OAuth setup (Google, Discord, GitHub)

The code side is done: `lib/auth.ts` registers a provider only when **both** of its env vars
are set, and the login/signup buttons for a provider without credentials render as
"Not configured" (greyed out, with a toast on click). Nothing crashes when a provider is
missing, so you can enable them one at a time.

What is left is creating an OAuth app in each provider's console and adding the credentials.

## Environment variables

| Variable | Provider |
| --- | --- |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Google |
| `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET` | Discord |
| `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET` | GitHub |

- **Local:** add them to `.env` and restart `pnpm dev`.
- **Vercel:** Project → Settings → Environment Variables (Production, and Preview if you want
  it there), then **redeploy** — the login pages are prerendered, so the buttons pick up the
  new state at build time.

`BETTER_AUTH_URL` must be the site's public origin in each environment (it is already set
locally to `http://localhost:3000`); the redirect URIs below are derived from it.

## Redirect URIs

Better-Auth's callback route is `/api/auth/callback/<provider>`. It is served by the existing
catch-all at `app/api/auth/[...all]/route.ts`; no extra route files are needed.

| Provider | Local | Production |
| --- | --- | --- |
| Google | `http://localhost:3000/api/auth/callback/google` | `https://<your-domain>/api/auth/callback/google` |
| Discord | `http://localhost:3000/api/auth/callback/discord` | `https://<your-domain>/api/auth/callback/discord` |
| GitHub | `http://localhost:3000/api/auth/callback/github` | `https://<your-domain>/api/auth/callback/github` |

Register the exact URLs (scheme, host and path); providers reject anything that differs.
Vercel preview deployments have changing hostnames, so either leave OAuth off on Preview or
point a stable preview domain at it and register that too.

## Google

1. <https://console.cloud.google.com/> → create or pick a project.
2. **APIs & Services → OAuth consent screen**: External, app name "OtakuVault", your support
   email, and the scopes `openid`, `email`, `profile` (the defaults; nothing sensitive).
   While the app is in "Testing", only the test users you list can sign in — publish it when
   you are ready.
3. **APIs & Services → Credentials → Create credentials → OAuth client ID**, type
   **Web application**.
   - Authorized JavaScript origins: `http://localhost:3000`, `https://<your-domain>`
   - Authorized redirect URIs: the two Google URLs above
4. Copy the client ID and secret into `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET`.

## Discord

1. <https://discord.com/developers/applications> → **New Application**.
2. **OAuth2 → Redirects**: add the two Discord URLs above.
3. Scopes used: `identify` and `email` (requested by Better-Auth; you don't select them in the
   console).
4. Copy **Client ID** and **Client Secret** (Reset Secret to reveal it) into
   `DISCORD_CLIENT_ID` / `DISCORD_CLIENT_SECRET`.

## GitHub

1. <https://github.com/settings/developers> → **OAuth Apps → New OAuth App** (an OAuth App, not
   a GitHub App).
   - Homepage URL: `https://<your-domain>`
   - Authorization callback URL: the GitHub URL above
2. A GitHub OAuth App accepts **one** callback URL, so create two apps: one for local
   development and one for production, each with its own ID/secret in the matching environment.
3. Scopes used: `read:user` and `user:email`. Users whose email is private still work — the
   `user:email` scope lets Better-Auth read their primary address.
4. Generate a client secret and copy both values into `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET`.

## What happens on first sign-in

- A new account is created with a username generated from the email prefix (changeable on the
  profile edit page), `agreed_to_terms_at` stamped (the signup page states that continuing with
  a provider means accepting the Terms and Privacy Policy), and the starter collection seeded.
- If an account with the same email already exists (e.g. created with a password),
  Better-Auth's default account linking applies: the provider is linked to that account when
  it reports the email as verified, and the sign-in is refused otherwise. Worth trying once
  per provider after setup.

## Checking it works

1. Set one provider's two variables and restart the dev server.
2. `/login` should show that provider's button without the "Not configured" tag.
3. Click it → provider consent screen → back on `/collection`, signed in.
