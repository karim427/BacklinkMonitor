import { eq } from "drizzle-orm";
import { db, schema as s } from "../db/index.js";
import { getAhrefsKey } from "./secrets.js";
import { cleanDomain, fetchRefDomains, type RefDomain } from "./ahrefsGapApi.js";
import { computeGap, gapScore, type GapRow } from "./competitorGap.js";
import { hostOf } from "./linkService.js";

/** Per client: the competitors you track and the last gap run. Kept in the settings table, so viewing is free; running spends Ahrefs units. */
interface Run { at: string; ourCount: number; rows: GapRow[]; errors: string[] }
type Store = Record<string, { competitors: string[]; run?: Run }>;

const read = async (): Promise<Store> => ((await db.select().from(s.settings).where(eq(s.settings.key, "opportunities")))[0]?.value as Store) ?? {};
const write = async (st: Store) => { await db.insert(s.settings).values({ key: "opportunities", value: st }).onConflictDoUpdate({ target: s.settings.key, set: { value: st } }); };

export async function getOpportunities(clientId: number) {
  const [st, donors, prospects] = await Promise.all([read(), db.select({ d: s.donors.domain }).from(s.donors), db.select({ d: s.prospects.domain }).from(s.prospects).where(eq(s.prospects.clientId, clientId))]);
  const mine = st[String(clientId)] ?? { competitors: [] };
  const donorSet = new Set(donors.map((x) => x.d)); const prospectSet = new Set(prospects.map((x) => x.d));
  return {
    clientId, competitors: mine.competitors,
    run: mine.run ? { ...mine.run, rows: mine.run.rows.map((r) => ({ ...r, isDonor: donorSet.has(r.domain), isProspect: prospectSet.has(r.domain) })) } : null,
  };
}

export async function setCompetitors(clientId: number, domains: string[]) {
  const st = await read(); const client = (await db.select().from(s.clients).where(eq(s.clients.id, clientId)))[0];
  const own = client ? hostOf(client.domain) : "";
  const clean = [...new Set(domains.map(cleanDomain).filter((d) => d && d.includes(".") && d !== own))].slice(0, 10);
  st[String(clientId)] = { ...(st[String(clientId)] ?? { competitors: [] }), competitors: clean };
  await write(st); return clean;
}

export async function runGap(clientId: number, fetchImpl: typeof fetch = fetch) {
  const key = await getAhrefsKey();
  if (!key) throw new Error("No Ahrefs API key. Add one in Settings first.");
  const client = (await db.select().from(s.clients).where(eq(s.clients.id, clientId)))[0];
  if (!client) throw new Error("Client not found");
  const st = await read(); const comps = st[String(clientId)]?.competitors ?? [];
  if (!comps.length) throw new Error("Add at least one competitor first.");
  const ours = await fetchRefDomains(hostOf(client.domain), key, fetchImpl);
  const errors: string[] = []; const refs: { domain: string; refs: RefDomain[] }[] = [];
  for (let i = 0; i < comps.length; i += 3) await Promise.all(comps.slice(i, i + 3).map(async (c) => {
    try { refs.push({ domain: c, refs: await fetchRefDomains(c, key, fetchImpl) }); } catch (e) { errors.push(`${c}: ${(e as Error).message}`); }
  }));
  if (!refs.length) throw new Error(errors[0] ?? "No competitor data came back.");
  const run: Run = { at: new Date().toISOString(), ourCount: ours.length, rows: computeGap(ours, refs).slice(0, 200), errors };
  st[String(clientId)] = { competitors: comps, run }; await write(st);
  return { requests: 1 + comps.length, ...run };
}

/** Puts chosen sites on the Prospects list so the team can reach out. Skips ones already there. */
export async function addToProspects(clientId: number, domains: string[]) {
  const st = await read(); const rows = st[String(clientId)]?.run?.rows ?? [];
  const have = new Set((await db.select({ d: s.prospects.domain }).from(s.prospects).where(eq(s.prospects.clientId, clientId))).map((x) => x.d));
  let added = 0; let skipped = 0;
  for (const d of [...new Set(domains.map(cleanDomain))]) {
    const r = rows.find((x) => x.domain === d);
    if (!r || have.has(d)) { skipped++; continue; }
    const score = gapScore(r);
    await db.insert(s.prospects).values({
      clientId, domain: d, pageTitle: `Links to ${r.competitorCount} of your competitors`, snippet: `Links to: ${r.competitors.join(", ")}`,
      score, label: score >= 70 ? "Relevant" : score >= 50 ? "Partly" : "Not", whyItScored: `Links to ${r.competitorCount} competitor${r.competitorCount === 1 ? "" : "s"} but not to you. DR ${r.dr ?? "?"}.`,
      sourceQuery: "Competitor gap", scoreSource: "ahrefs", status: "New",
    });
    added++;
  }
  return { added, skipped };
}
