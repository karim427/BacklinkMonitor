import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import * as schema from "./schema";

const file = process.env.DATABASE_URL ?? "./data/backlink-verify.db";
if (file !== ":memory:") fs.mkdirSync(path.dirname(file), { recursive: true });
export const sqlite = new Database(file);
sqlite.pragma("journal_mode = WAL");
sqlite.pragma("foreign_keys = ON");
export const db = drizzle(sqlite, { schema });
export const runMigrations = () => migrate(db, { migrationsFolder: path.resolve(import.meta.dirname, "migrations") });
export { schema };
