import { eq } from "drizzle-orm";
import { db, schema as s } from "../db/index.js";
import { fetchDonorMetrics } from "./ahrefs.js";
import { getAhrefsKey } from "./secrets.js";

type Donor = typeof s.donors.$inferSelect;
const STALE_MS = 30 * 86_400_000;

/** Pull real traffic / DR / referring domains from Ahrefs and store them on the donor. Throws if Ahrefs fails. */
export async function syncDonor(d: Donor, key: string): Promise<Donor> {
  const m = await fetchDonorMetrics(d.domain, key);
  const hist = [...(d.trafficHistory ?? []), m.organicTraffic].slice(-6);
  return (await db.update(s.donors).set({ dr: m.dr, usTrafficPct: m.usTrafficPct, organicTraffic: m.organicTraffic, referringDomains: m.referringDomains, linkedDomains: m.linkedDomains, trafficHistory: hist, ahrefsSyncedAt: new Date() }).where(eq(s.donors.id, d.id)).returning())[0];
}

/** Called before every verification: look up the donor's real numbers if we never did, or they're over 30 days old. Never blocks a check if Ahrefs is down. */
export async function ensureFreshMetrics(d: Donor): Promise<Donor> {
  const key = await getAhrefsKey();
  if (!key) return d;
  if (d.ahrefsSyncedAt && Date.now() - d.ahrefsSyncedAt.getTime() < STALE_MS) return d;
  try { return await syncDonor(d, key); } catch { return d; }
}

/** Sync many donors a few at a time. */
export async function syncMany(donors: Donor[], key: string, batch = 3) {
  let synced = 0; const errors: string[] = [];
  for (let i = 0; i < donors.length; i += batch) {
    await Promise.all(donors.slice(i, i + batch).map(async (d) => {
      try { await syncDonor(d, key); synced++; } catch (e) { errors.push(`${d.domain}: ${(e as Error).message}`); }
    }));
  }
  return { synced, total: donors.length, errors };
}
