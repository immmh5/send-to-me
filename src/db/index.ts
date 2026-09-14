import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL is required");
}

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
  __stsSchemaPromise?: Promise<void> | null;
};

/**
 * Managed Postgres (Neon, Supabase, Cloud SQL …) requires SSL; local dev
 * instances don't. Detected automatically from the hostname.
 */
function needsSsl(url: string): boolean {
  try {
    const u = new URL(url);
    if (["localhost", "127.0.0.1", "::1"].includes(u.hostname)) return false;
    if (u.searchParams.get("sslmode") === "disable") return false;
    return true;
  } catch {
    return false;
  }
}

export const pool =
  globalForDb.__arenaNextJsPostgresqlPool ??
  new Pool({
    connectionString: databaseUrl,
    ssl: needsSsl(databaseUrl) ? { rejectUnauthorized: false } : undefined,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

export const db = drizzle(pool);

/**
 * Idempotent boot guard: creates the tables on first DB touch if they are
 * missing, so a fresh deployment always comes up healthy — no manual migration
 * step can be forgotten. Runs once per process.
 */
export function ensureSchema(): Promise<void> {
  if (!globalForDb.__stsSchemaPromise) {
    globalForDb.__stsSchemaPromise = pool
      .query(`
        CREATE TABLE IF NOT EXISTS "config" (
          "id" text PRIMARY KEY,
          "salt" text NOT NULL,
          "password_hash" text NOT NULL,
          "secret" text NOT NULL,
          "password_changed" boolean NOT NULL DEFAULT false,
          "created_at" timestamptz NOT NULL DEFAULT now()
        );
        CREATE TABLE IF NOT EXISTS "items" (
          "id" text PRIMARY KEY,
          "text" text,
          "files" jsonb NOT NULL DEFAULT '[]'::jsonb,
          "created_at" timestamptz NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS "items_created_at_idx" ON "items" ("created_at" DESC);
      `)
      .then(() => undefined)
      .catch((err) => {
        globalForDb.__stsSchemaPromise = null; // retry on next request
        throw err;
      });
  }
  return globalForDb.__stsSchemaPromise;
}
