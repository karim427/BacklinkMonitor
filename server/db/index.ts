import "dotenv/config";
import path from "node:path";
import fs from "node:fs";
import { drizzle as drizzlePg } from "drizzle-orm/postgres-js";
import { drizzle as drizzleLite } from "drizzle-orm/pglite";
import { migrate as migratePg } from "drizzle-orm/postgres-js/migrator";
import { migrate as migrateLite } from "drizzle-orm/pglite/migrator";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import postgres from "postgres";
import { PGlite } from "@electric-sql/pglite";
import * as schema from "./schema.js";

/**
 * DATABASE_URL set  -> Postgres (Supabase). Use the *pooler* connection string on Vercel.
 * DATABASE_URL empty -> embedded Postgres (PGlite) persisted in ./data/pglite, zero-setup local dev.
 */
const url = process.env.DATABASE_URL;
export const usingPglite = !url;
const migrationsFolder = path.resolve(process.cwd(), "server/db/migrations");

let _db: PgDatabase<PgQueryResultHKT, typeof schema>;
let _migrate: () => Promise<void>;
if (url) {
  const client = postgres(url, {
    prepare: false, max: process.env.VERCEL ? 3 : 5,
    // Serverless: sockets that sit idle get silently dropped, and the next query on a dead socket hangs until the function times out.
    // Close idle connections quickly and fail fast instead of hanging.
    idle_timeout: process.env.VERCEL ? 4 : 0, connect_timeout: 10, max_lifetime: process.env.VERCEL ? 300 : null,
    ssl: /localhost|127\.0\.0\.1/.test(url) ? false : "require" });
  _db = drizzlePg(client, { schema }) as any;
  _migrate = () => migratePg(_db as any, { migrationsFolder });
} else {
  const dir = process.env.PGLITE_DIR ?? "./data/pglite";
  if (dir !== "memory://") fs.mkdirSync(path.dirname(dir), { recursive: true });
  const lite = new PGlite(dir);
  _db = drizzleLite(lite, { schema }) as any;
  _migrate = () => migrateLite(_db as any, { migrationsFolder });
}
export const db = _db;
export const runMigrations = () => _migrate();
export { schema };
