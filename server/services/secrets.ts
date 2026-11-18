import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema as s } from "../db/index.js";

/** Integration keys entered in the UI. Stored encrypted (AES-256-GCM) in the settings table; the key never leaves the server. */
const encKey = () => crypto.createHash("sha256").update(process.env.SESSION_SECRET || process.env.CRON_SECRET || "local-dev-only").digest();

function encrypt(plain: string) {
  const iv = crypto.randomBytes(12); const c = crypto.createCipheriv("aes-256-gcm", encKey(), iv);
  const ct = Buffer.concat([c.update(plain, "utf8"), c.final()]);
  return [iv, c.getAuthTag(), ct].map((b) => b.toString("base64")).join(".");
}
function decrypt(blob: string): string | null {
  try {
    const [iv, tag, ct] = blob.split(".").map((p) => Buffer.from(p, "base64"));
    const d = crypto.createDecipheriv("aes-256-gcm", encKey(), iv); d.setAuthTag(tag);
    return Buffer.concat([d.update(ct), d.final()]).toString("utf8");
  } catch { return null; } // e.g. SESSION_SECRET changed
}

type Secrets = { ahrefs?: string; firecrawl?: string };
const readRow = async () => ((await db.select().from(s.settings).where(eq(s.settings.key, "secrets")))[0]?.value ?? {}) as Secrets;

let cache: { key: string | null; until: number } | null = null;
/** Key saved in Settings wins; falls back to the AHREFS_API_KEY env var. */
export async function getAhrefsKey(): Promise<string | null> {
  if (cache && cache.until > Date.now()) return cache.key;
  const row = await readRow();
  const key = (row.ahrefs ? decrypt(row.ahrefs) : null) || process.env.AHREFS_API_KEY || null;
  cache = { key, until: Date.now() + 30_000 };
  return key;
}

export async function ahrefsStatus() {
  const row = await readRow();
  const saved = row.ahrefs ? decrypt(row.ahrefs) : null;
  const key = saved || process.env.AHREFS_API_KEY || null;
  return { connected: !!key, source: saved ? "settings" : process.env.AHREFS_API_KEY ? "env" : null, last4: key ? key.slice(-4) : null };
}

export async function setAhrefsKey(key: string | null) {
  const row = await readRow();
  const next: Secrets = { ...row };
  if (key) next.ahrefs = encrypt(key); else delete next.ahrefs;
  await db.insert(s.settings).values({ key: "secrets", value: next }).onConflictDoUpdate({ target: s.settings.key, set: { value: next } });
  cache = null;
}

/** Cheap check that Ahrefs accepts the key (this endpoint costs no API units). */
export async function checkAhrefsKey(key: string): Promise<"valid" | "invalid" | "unknown"> {
  try {
    const r = await fetch("https://api.ahrefs.com/v3/subscription-info/limits-and-usage", { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" }, signal: AbortSignal.timeout(10_000) });
    if (r.ok) return "valid";
    return r.status === 401 || r.status === 403 ? "invalid" : "unknown";
  } catch { return "unknown"; }
}

/* ---- Firecrawl (reads donor sites, including pages that need JavaScript) ---- */
export async function getFirecrawlKey(): Promise<string | null> {
  const row = await readRow();
  return (row.firecrawl ? decrypt(row.firecrawl) : null) || process.env.FIRECRAWL_API_KEY || null;
}
export async function firecrawlStatus() {
  const row = await readRow(); const saved = row.firecrawl ? decrypt(row.firecrawl) : null; const key = saved || process.env.FIRECRAWL_API_KEY || null;
  return { connected: !!key, source: saved ? "settings" : process.env.FIRECRAWL_API_KEY ? "env" : null, last4: key ? key.slice(-4) : null };
}
export async function setFirecrawlKey(key: string | null) {
  const row = await readRow(); const next: Secrets = { ...row };
  if (key) next.firecrawl = encrypt(key); else delete next.firecrawl;
  await db.insert(s.settings).values({ key: "secrets", value: next }).onConflictDoUpdate({ target: s.settings.key, set: { value: next } });
}
