# Database (Postgres + Drizzle)

Local Postgres 16 runs in Docker. The schema lives in `lib/db/schema.ts`, and the app talks to the database through `db` exported from `lib/db/index.ts`.

## First-time setup

```bash
cp .env.example .env   # DATABASE_URL=postgres://otaku:otaku@localhost:5432/otakuvault
pnpm install
pnpm db:up             # start Postgres (waits until healthy)
pnpm db:push           # create/update tables from schema.ts
```

## Daily commands

| Command            | What it does                                                         |
| ------------------ | -------------------------------------------------------------------- |
| `pnpm db:up`       | Start the Postgres container in the background                       |
| `pnpm db:down`     | Stop the container (your data is kept in the `pgdata` volume)        |
| `pnpm db:push`     | Sync `schema.ts` to the DB directly (fast; for local dev)            |
| `pnpm db:generate` | Write a SQL migration file to `./drizzle` from schema changes        |
| `pnpm db:studio`   | Open Drizzle Studio (DB browser) at https://local.drizzle.studio     |

Typical loop: edit `lib/db/schema.ts`, run `pnpm db:push`, then check the result in `pnpm db:studio`.

`db:push` asks before making destructive changes, like dropping a column. Read the prompt before you confirm.

## Push vs. generate

- **Local dev:** use `db:push`. No migration files are written.
- **Before deploying / sharing schema changes:** use `db:generate`, then commit the SQL in `./drizzle`. Apply it in production with `drizzle-kit migrate`.

## Useful extras

```bash
docker exec -it otakuvault-db psql -U otaku -d otakuvault   # psql shell
docker compose logs -f postgres                            # DB logs
docker compose down -v                                     # ⚠ stop AND wipe all data
```

## Using the client

```ts
import { db, entries } from "@/lib/db";
import { eq } from "drizzle-orm";

const mine = await db.select().from(entries).where(eq(entries.userId, userId));
```

Only import `@/lib/db` from server code (Server Components, Route Handlers, Server Actions). Never import it from `"use client"` files.

## Notes

- Money columns (`products.price`, `orders.total`, `order_items.price_at_purchase`) are stored as **integer cents**.
- `users` / `sessions` / `accounts` are stubs. When Better-Auth is added, run its schema generator and reconcile it with these tables.
- IDs are text UUIDs, generated in JS, so existing client ids such as `demo_0` can be imported unchanged.
