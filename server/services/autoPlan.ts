import { eq } from "drizzle-orm";
import { db, schema as s } from "../db/index.js";
import { AUTO_MAX_DIFFICULTY, AUTO_MIN_VOLUME, AUTO_PAGES_PER_MONTH } from "./constants.js";
import { keywordOverview, pageGap } from "./keywordMetrics.js";
import { monthKey, stage1 } from "./rules.js";
import { fetchSitemapUrls, suggestPages, usablePages, type PageSuggestion } from "./sitemap.js";
import { allMeta, pickAssignee, saveMeta } from "./targetMeta.js";

export interface Candidate extends PageSuggestion { volume: number | null; difficulty: number | null }
export interface Picked extends Candidate { currentRDs: number; rdsNeeded: number; linksNeeded: number; monthsToClose: number }

/** Easy wins first: a keyword people search for, that is not hard to rank for. Higher is better. */
export const score = (c: { volume: number | null; difficulty: number | null }) => (c.volume ?? 0) / ((c.difficulty ?? 100) + 10);
/** Keeps pages with a real keyword that is easy enough, best first. */
export const shortlist = (cands: Candidate[], limit: number, maxKd = AUTO_MAX_DIFFICULTY, minVol = AUTO_MIN_VOLUME) =>
  cands.filter((c) => c.difficulty != null && c.volume != null && c.difficulty <= maxKd && c.volume >= minVol).sort((a, b) => score(b) - score(a)).slice(0, limit);

export interface PlanResult { added: (Picked & { assigneeId: number | null })[]; considered: number; skipped: string[] }

/** Reads the client's sitemap, picks the easiest pages worth links, adds them as approved target pages with their numbers, and gives each to a teammate. */
export async function planClientPages(clientId: number, key: string, opts: { count?: number; country?: string } = {}, f: typeof fetch = fetch): Promise<PlanResult> {
  const client = (await db.select().from(s.clients).where(eq(s.clients.id, clientId)))[0];
  if (!client) throw new Error("Client not found");
  const month = monthKey(new Date());
  const [pages, meta] = await Promise.all([db.select().from(s.targetPages).where(eq(s.targetPages.clientId, clientId)), allMeta()]);
  const doneThisMonth = pages.filter((p) => p.approvalMonth === month && meta.get(p.id)?.auto).length;
  const want = Math.max(0, (opts.count ?? AUTO_PAGES_PER_MONTH) - doneThisMonth);
  const skipped: string[] = [];
  if (!want) return { added: [], considered: 0, skipped: [`Already picked ${doneThisMonth} pages for ${client.name} this month.`] };

  const all = await fetchSitemapUrls(client.domain, f);
  if (!all.length) throw new Error(`Couldn't find a sitemap for ${client.domain}. Add pages by hand with Add target page.`);
  const fresh = usablePages(all, client.domain, pages.map((p) => p.url));
  const picks = await suggestPages(client, fresh, f);
  if (!picks.length) return { added: [], considered: 0, skipped: ["The sitemap had no usable pages left."] };

  const ov = await keywordOverview(picks.map((p) => p.keyword), key, opts.country ?? "us", f);
  const withKw: Candidate[] = picks.map((p) => ({ ...p, ...(ov.get(p.keyword.toLowerCase()) ?? { volume: null, difficulty: null }) }));
  const short = shortlist(withKw, want * 2);
  if (!short.length) skipped.push(`None of the ${picks.length} pages had a keyword with difficulty ${AUTO_MAX_DIFFICULTY} or less and at least ${AUTO_MIN_VOLUME} searches a month.`);

  const chosen: Picked[] = [];
  for (const c of short) {
    if (chosen.length >= want) break;
    const g = await pageGap(c.url, c.keyword, key, opts.country ?? "us", f);
    const r = stage1(g.rdsNeeded, g.currentRDs);
    if (r.suggestion !== "Approved") { skipped.push(`${c.keyword}: needs ${g.rdsNeeded} more sites, too many to win in 6 months.`); continue; }
    chosen.push({ ...c, currentRDs: g.currentRDs, rdsNeeded: g.rdsNeeded, linksNeeded: r.linksNeeded, monthsToClose: r.monthsToClose });
  }

  // Give each new page to the teammate with the fewest open pages.
  const team = await db.select().from(s.users).where(eq(s.users.active, true)).orderBy(s.users.createdAt);
  const open = new Map<number, number>();
  for (const m of meta.values()) if (m.assigneeId) open.set(m.assigneeId, (open.get(m.assigneeId) ?? 0) + 1);
  const added: PlanResult["added"] = [];
  for (const c of chosen) {
    const row = (await db.insert(s.targetPages).values({ clientId, url: c.url, keyword: c.keyword, currentRDs: c.currentRDs, rdsNeeded: c.rdsNeeded, linksNeeded: c.linksNeeded, monthsToClose: c.monthsToClose, status: "Approved", approvalMonth: month }).returning())[0];
    const assigneeId = pickAssignee(team, open); if (assigneeId) open.set(assigneeId, (open.get(assigneeId) ?? 0) + 1);
    await saveMeta(row.id, { volume: c.volume, difficulty: c.difficulty, assigneeId, auto: true });
    added.push({ ...c, assigneeId });
  }
  return { added, considered: picks.length, skipped };
}

/** The monthly job: top every client up to its quota. One client failing never stops the rest. */
export async function planAllClients(key: string) {
  const clients = await db.select().from(s.clients);
  const out: { client: string; added: number; error?: string }[] = [];
  for (const c of clients) {
    try { out.push({ client: c.name, added: (await planClientPages(c.id, key)).added.length }); }
    catch (e) { out.push({ client: c.name, added: 0, error: (e as Error).message }); }
  }
  return out;
}
