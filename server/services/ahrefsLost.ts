import { eq } from "drizzle-orm";
import { db, schema as s } from "../db/index.js";
import { getAhrefsKey } from "./secrets.js";
import { hostOf } from "./linkService.js";

/** Links Ahrefs reports as lost for each client's domain. Cached in the settings table so viewing the dashboard costs no API units. */
import { fetchLostBacklinks, lostReasonLabel, sinceDate, type LostBacklink } from "./ahrefsLostApi.js";
interface Cache { fetchedAt: string; days: number; byClient: Record<string, { fetchedAt: string; target: string; rows: LostBacklink[]; error?: string }> }

async function readCache(): Promise<Cache> {
  const row = (await db.select().from(s.settings).where(eq(s.settings.key, "ahrefs_lost")))[0];
  return (row?.value as Cache) ?? { fetchedAt: "", days: 60, byClient: {} };
}

/** Looks up lost backlinks for clients (default: those that have at least one link in the app). Returns how many requests were made. */
export async function refreshLost(opts: { clientId?: number; days?: number } = {}, fetchImpl: typeof fetch = fetch) {
  const key = await getAhrefsKey();
  if (!key) throw new Error("No Ahrefs API key. Add one in Settings first.");
  const days = opts.days ?? 60;
  const clients = await db.select().from(s.clients);
  const withLinks = new Set((await db.select({ c: s.links.clientId }).from(s.links)).map((l) => l.c));
  const todo = clients.filter((c) => (opts.clientId ? c.id === opts.clientId : withLinks.has(c.id)));
  const cache = await readCache();
  cache.days = days; cache.fetchedAt = new Date().toISOString();
  let requests = 0; const errors: string[] = [];
  for (let i = 0; i < todo.length; i += 3) {
    await Promise.all(todo.slice(i, i + 3).map(async (c) => {
      const target = hostOf(c.domain); requests++;
      try { cache.byClient[String(c.id)] = { fetchedAt: new Date().toISOString(), target, rows: await fetchLostBacklinks(target, days, key, fetchImpl) }; }
      catch (e) { errors.push(`${c.name}: ${(e as Error).message}`); cache.byClient[String(c.id)] = { ...(cache.byClient[String(c.id)] ?? { rows: [] }), fetchedAt: new Date().toISOString(), target, error: (e as Error).message } as any; }
    }));
  }
  await db.insert(s.settings).values({ key: "ahrefs_lost", value: cache }).onConflictDoUpdate({ target: s.settings.key, set: { value: cache } });
  return { requests, clients: todo.length, errors };
}

const norm = (u: string) => { try { const x = new URL(u); return (x.hostname.replace(/^www\./, "") + x.pathname.replace(/\/+$/, "")).toLowerCase(); } catch { return u.toLowerCase(); } };

/** Cached lost backlinks for the last `days` days, flattened across clients and matched to links we placed. */
export async function listLost(days = 60) {
  const [cache, clients, links] = await Promise.all([readCache(), db.select().from(s.clients), db.select().from(s.links)]);
  const since = sinceDate(days);
  const rows = Object.entries(cache.byClient).flatMap(([cid, c]) => {
    const client = clients.find((x) => x.id === Number(cid));
    return c.rows.filter((r) => !r.lostAt || r.lostAt.slice(0, 10) >= since).map((r) => {
      const ours = links.find((l) => l.clientId === Number(cid) && norm(l.sourceUrl) === norm(r.urlFrom));
      return { ...r, clientId: Number(cid), client: client?.name ?? "Unknown", donor: hostOf(r.urlFrom), reasonLabel: lostReasonLabel(r.reason), ours: ours ? { linkId: ours.id, addedBy: ours.reviewer } : null };
    });
  }).sort((a, b) => (b.lostAt ?? "").localeCompare(a.lostAt ?? ""));
  const errors = Object.entries(cache.byClient).filter(([, c]) => c.error).map(([cid, c]) => `${clients.find((x) => x.id === Number(cid))?.name ?? cid}: ${c.error}`);
  return { fetchedAt: cache.fetchedAt || null, rows, errors, checkedClients: Object.keys(cache.byClient).length };
}
