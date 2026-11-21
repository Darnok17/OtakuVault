import { getCloudflareContext } from "@opennextjs/cloudflare";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as schema from "./schema";

type Db = NodePgDatabase<typeof schema> & { $client: Pool };

// On Cloudflare Workers a socket opened by one request can't be used by another, so each request
// gets its own Pool on the HYPERDRIVE binding (Hyperdrive does the real pooling and keeps the
// Postgres connections warm), and a connection is never handed to a second query batch.
// Everywhere else (next dev, Vercel, tsx scripts, drizzle-kit) a single Pool on DATABASE_URL.
const onWorkers = typeof navigator !== "undefined" && navigator.userAgent === "Cloudflare-Workers";

const perRequest = new WeakMap<object, Db>();
const globalForDb = globalThis as unknown as { nodeDb?: Db };

export function getDb(): Db {
  if (onWorkers) {
    const { env, ctx } = getCloudflareContext();
    let db = perRequest.get(ctx);
    if (!db) {
      const pool = new Pool({ connectionString: env.HYPERDRIVE.connectionString, maxUses: 1 });
      db = drizzle(pool, { schema });
      perRequest.set(ctx, db);
    }
    return db;
  }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");
  // Reused across dev hot reloads so we don't leak connections.
  globalForDb.nodeDb ??= drizzle(new Pool({ connectionString: process.env.DATABASE_URL }), { schema });
  return globalForDb.nodeDb;
}

// The `db` the rest of the app imports: every property access resolves to this request's client,
// so no importer has to change.
export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    const real = getDb();
    const value = Reflect.get(real, prop, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

export * from "./schema";
