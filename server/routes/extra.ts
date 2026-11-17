import { Router } from "express";
import { z } from "zod";
import { desc, eq } from "drizzle-orm";
import { db, schema as s } from "../db/index.js";
import { BANNED_VERTICALS, CLUSTERS, CLUSTER_SEED_KEYWORDS, NON_US_TLDS, SPAM_TLDS, type Cluster } from "../services/constants.js";
import { checkA, evaluateRejectRules } from "../services/rules.js";
import { fetchDonorMetrics } from "../services/ahrefs.js";
import { getAhrefsKey } from "../services/secrets.js";
import { syncDonor, syncMany } from "../services/donorMetrics.js";
import { toDonorMetrics, hostOf } from "../services/linkService.js";
import { aiConfigured, aiStatus, chat, extractJson } from "../services/ai.js";
import { HttpError, loadLinks, wrap } from "./core.js";
import { given } from "../util.js";

export const extra = Router();
const idOf = (p: unknown) => { const n = Number(p); if (!Number.isInteger(n)) throw new HttpError(400, "Invalid id"); return n; };

/* ---------------- donors ---------------- */
const donorBody = z.object({
  domain: z.string().min(3), name: z.string().nullish(), dr: z.number().int().min(0).max(100).default(0), usTrafficPct: z.number().int().min(0).max(100).default(0),
  organicTraffic: z.number().int().min(0).default(0), referringDomains: z.number().int().min(0).default(0), linkedDomains: z.number().int().min(0).default(0),
  cluster: z.enum(CLUSTERS), niche: z.string().nullish(), isLocal: z.boolean().default(false), localArea: z.string().nullish(),
  flags: z.record(z.string(), z.boolean()).nullish(),
});
const SIX_MO = 183 * 86_400_000;

extra.get("/donors", wrap(async (req) => {
  const previewClient = req.query.previewClient ? Number(req.query.previewClient) : null;
  const donors = (await db.select().from(s.donors).orderBy(desc(s.donors.dr)));
  const links = await loadLinks();
  const rows = donors.map((d) => {
    const used = links.filter((l) => l.donorId === d.id);
    const clientIds = new Set(used.map((l) => l.clientId));
    const reuse = previewClient ? used.some((l) => l.clientId === previewClient && l.verdict !== "Not relevant" && (l.placedAt ?? l.createdAt).getTime() >= Date.now() - SIX_MO) : false;
    return { ...d, clientsLinked: clientIds.size, linkCount: used.length, reuseWarning: clientIds.size > 3 || reuse, reuseForPreview: reuse, minTraffic: d.isLocal ? 300 : 1000 };
  });
  return {
    rows,
    totals: { donors: rows.length, avgDr: rows.length ? Math.round(rows.reduce((a, r) => a + r.dr, 0) / rows.length) : 0, local: rows.filter((r) => r.isLocal).length, reuseWarnings: rows.filter((r) => r.reuseWarning).length },
  };
}));
extra.get("/donors/:id", wrap(async (req) => {
  const id = idOf(req.params.id);
  const d = (await db.select().from(s.donors).where(eq(s.donors.id, id)))[0];
  if (!d) throw new HttpError(404, "Donor not found");
  const clusterFor = (req.query.cluster as Cluster) ?? (d.cluster as Cluster);
  return { donor: d, checkA: checkA(toDonorMetrics(d), clusterFor), links: (await loadLinks()).filter((l) => l.donorId === id) };
}));
extra.post("/donors", wrap(async (req, res) => { res.status(201); return (await db.insert(s.donors).values(donorBody.parse(req.body)).returning())[0]; }));
extra.put("/donors/:id", wrap(async (req) => (await db.update(s.donors).set(given(donorBody.partial().parse(req.body), req.body)).where(eq(s.donors.id, idOf(req.params.id))).returning())[0]));
extra.delete("/donors/:id", wrap(async (req) => { (await db.delete(s.donors).where(eq(s.donors.id, idOf(req.params.id)))); return { ok: true }; }));
/** Spends Ahrefs API units (about 5 calls per donor), so by default only donors that still have no numbers are looked up. `?all=1` refreshes everyone. */
extra.post("/donors/sync-ahrefs", wrap(async (req) => {
  const key = await getAhrefsKey();
  if (!key) throw new HttpError(400, "No Ahrefs API key. Add one in Settings, or enter the numbers by hand on the Donors page.");
  const all = (await db.select().from(s.donors));
  const todo = req.query.all === "1" ? all : all.filter((d) => !d.ahrefsSyncedAt && !d.dr && !d.usTrafficPct && !d.organicTraffic && !d.referringDomains);
  return { ...(await syncMany(todo, key)), skipped: all.length - todo.length, mock: false };
}));
extra.post("/donors/:id/sync-ahrefs", wrap(async (req) => {
  const key = await getAhrefsKey();
  if (!key) throw new HttpError(400, "No Ahrefs API key. Add one in Settings, or enter the numbers by hand.");
  const d = (await db.select().from(s.donors).where(eq(s.donors.id, idOf(req.params.id))))[0];
  if (!d) throw new HttpError(404, "Donor not found");
  try { return await syncDonor(d, key); } catch (e) { throw new HttpError(502, `Ahrefs lookup failed: ${(e as Error).message}`); }
}));

/* ---------------- prospects ---------------- */
const NOISE = [...SPAM_TLDS, ...NON_US_TLDS];
const GUEST_SIGNALS = ["write for us", "guest post", "contribute", "submit a guest", "become a contributor", "guest author"];

export function heuristicScore(p: { domain: string; title?: string; snippet?: string }, cluster: Cluster, city?: string | null, keywords: string[] = []) {
  const text = `${p.domain} ${p.title ?? ""} ${p.snippet ?? ""}`.toLowerCase();
  let score = 30; const why: string[] = [];
  if (NOISE.some((t) => p.domain.endsWith(t))) return { score: 5, label: "Not" as const, why: "Spam or non-US TLD" };
  if (BANNED_VERTICALS.some((v) => text.includes(v))) return { score: 8, label: "Not" as const, why: "Banned vertical" };
  const kw = keywords.filter((k) => text.includes(k.toLowerCase().split(String.fromCharCode(34)).join("")));
  if (kw.length) { score += Math.min(30, kw.length * 15); why.push(`${kw.length} keyword hit(s)`); }
  if (GUEST_SIGNALS.some((g) => text.includes(g))) { score += 20; why.push("guest-post page signals"); }
  if (city && text.includes(city.toLowerCase())) { score += 10; why.push("location match"); }
  const label = score >= 70 ? "Relevant" : score >= 50 ? "Partly" : "Not";
  return { score: Math.min(100, score), label: label as "Relevant" | "Partly" | "Not", why: why.join(", ") || "weak signals" };
}

extra.get("/prospects", wrap(async () => {
  const clients = new Map((await db.select().from(s.clients)).map((c) => [c.id, c]));
  return {
    rows: (await db.select().from(s.prospects).orderBy(desc(s.prospects.score))).map((p) => ({ ...p, client: clients.get(p.clientId) ?? null })),
    ai: aiStatus(), suggestedKeywords: CLUSTER_SEED_KEYWORDS,
  };
}));
const prospectBody = z.object({ clientId: z.number().int(), domain: z.string().min(3), pageTitle: z.string().nullish(), pageUrl: z.string().nullish(), snippet: z.string().nullish(), status: z.enum(["New", "Shortlisted", "Contacted", "Won", "Rejected"]).optional() });
extra.post("/prospects", wrap(async (req, res) => {
  const b = prospectBody.parse(req.body);
  const c = (await db.select().from(s.clients).where(eq(s.clients.id, b.clientId)))[0];
  const h = heuristicScore({ domain: b.domain, title: b.pageTitle ?? "", snippet: b.snippet ?? "" }, (c?.cluster ?? CLUSTERS[0]) as Cluster, c?.city);
  res.status(201);
  return (await db.insert(s.prospects).values({ ...b, score: h.score, label: h.label, whyItScored: h.why, scoreSource: "heuristic" }).returning())[0];
}));
extra.put("/prospects/:id", wrap(async (req) => (await db.update(s.prospects).set(given(prospectBody.partial().parse(req.body), req.body)).where(eq(s.prospects.id, idOf(req.params.id))).returning())[0]));
extra.delete("/prospects/:id", wrap(async (req) => { (await db.delete(s.prospects).where(eq(s.prospects.id, idOf(req.params.id)))); return { ok: true }; }));

extra.post("/prospects/discover", wrap(async (req) => {
  const b = z.object({ clientId: z.number().int(), limit: z.number().int().min(1).max(50).default(10), perQuery: z.number().int().min(1).max(10).default(5), seeds: z.array(z.string()).default([]) }).parse(req.body);
  const client = (await db.select().from(s.clients).where(eq(s.clients.id, b.clientId)))[0];
  if (!client) throw new HttpError(404, "Client not found");
  const cluster = client.cluster as Cluster;
  const seeds = b.seeds.length ? b.seeds : CLUSTER_SEED_KEYWORDS[cluster];
  const existing = new Set([...(await db.select().from(s.donors)).map((d) => d.domain), ...(await db.select().from(s.prospects).where(eq(s.prospects.clientId, b.clientId))).map((p) => p.domain)]);
  type Cand = { domain: string; title?: string; snippet?: string; url?: string; score?: number; why?: string; query: string };
  let cands: Cand[] = []; let source: "ai" | "heuristic" = "heuristic"; let aiError: string | undefined;

  if (aiConfigured()) {
    try {
      for (const q of seeds) {
        const out = await chat([
          { role: "system", content: 'You find guest-post / link-building prospects with web search. Reply ONLY JSON: {"results":[{"domain":"","url":"","title":"","snippet":"","score":0-100,"why":"one line"}]}. Score relevance for the client cluster and niche; US-focused English sites only.' },
          { role: "user", content: `Client: ${client.name} (${client.domain}), cluster ${cluster}, ${client.city ?? ""} ${client.state ?? ""}. Query: ${q}. Return up to ${b.perQuery} results.` },
        ], { webSearch: true, json: true });
        const parsed = extractJson<{ results: any[] }>(out).results ?? [];
        cands.push(...parsed.slice(0, b.perQuery).map((r) => ({ domain: hostOf(r.domain || r.url || ""), title: r.title, snippet: r.snippet, url: r.url, score: Number(r.score), why: r.why, query: q })));
      }
      source = "ai";
    } catch (e) { aiError = (e as Error).message; cands = []; }
  }
  if (!cands.length) {
    // Deterministic fallback: no live search available — score manual seeds only (nothing to discover offline).
    cands = [];
  }
  const seen = new Set<string>();
  const kept = cands.filter((c) => c.domain && !seen.has(c.domain) && !existing.has(c.domain) && !NOISE.some((t) => c.domain.endsWith(t)) && !BANNED_VERTICALS.some((v) => c.domain.includes(v)) && (seen.add(c.domain), true)).slice(0, b.limit);
  const created = await Promise.all(kept.map(async (c) => {
    const h = heuristicScore({ domain: c.domain, title: c.title, snippet: c.snippet }, cluster, client.city, seeds);
    const useAi = source === "ai" && Number.isFinite(c.score);
    const score = useAi ? Math.max(0, Math.min(100, c.score!)) : h.score;
    return (await db.insert(s.prospects).values({
      clientId: client.id, domain: c.domain, pageUrl: c.url, pageTitle: c.title, snippet: c.snippet, score,
      label: score >= 70 ? "Relevant" : score >= 50 ? "Partly" : "Not", whyItScored: useAi ? c.why : h.why,
      matchedKeyword: seeds.find((k) => `${c.title} ${c.snippet}`.toLowerCase().includes(k.toLowerCase().split(String.fromCharCode(34)).join("").split(" ")[0])) ?? null,
      sourceQuery: c.query, scoreSource: useAi ? "ai" : "heuristic",
    }).returning())[0];
  }));
  return { created: created.length, source, aiError, note: created.length ? undefined : aiConfigured() ? "No new prospects found." : "AI is not configured (set AI_API_KEY). Add prospects manually — they are scored with the heuristic scorer." };
}));

extra.post("/prospects/:id/promote", wrap(async (req, res) => {
  const p = (await db.select().from(s.prospects).where(eq(s.prospects.id, idOf(req.params.id))))[0];
  if (!p) throw new HttpError(404, "Prospect not found");
  const client = (await db.select().from(s.clients).where(eq(s.clients.id, p.clientId)))[0]!;
  let donor = (await db.select().from(s.donors).where(eq(s.donors.domain, p.domain)))[0];
  if (!donor) donor = (await db.insert(s.donors).values({ domain: p.domain, name: p.pageTitle ?? p.domain, cluster: client.cluster }).returning())[0];
  (await db.update(s.prospects).set({ status: "Won" }).where(eq(s.prospects.id, p.id)));
  res.status(201);
  const check = checkA(toDonorMetrics(donor), client.cluster as Cluster);
  void evaluateRejectRules;
  return { donor, checkA: check, note: "Metrics are empty until you run 'Sync from Ahrefs' for this donor." };
}));

/* ---------------- HARO ---------------- */
function heuristicParse(raw: string) {
  const grab = (re: RegExp) => raw.match(re)?.[1]?.trim();
  const dl = grab(/deadline[:\s]+([^\n]+)/i); const inDays = raw.match(/in\s+(\d+)\s+days?/i);
  let deadline: Date | null = dl && !isNaN(Date.parse(dl)) ? new Date(dl) : inDays ? new Date(Date.now() + Number(inDays[1]) * 86_400_000) : null;
  return {
    outlet: grab(/outlet[:\s]+([^\n]+)/i) ?? null, journalist: grab(/(?:name|journalist|reporter)[:\s]+([^\n]+)/i) ?? null,
    category: grab(/category[:\s]+([^\n]+)/i) ?? null, title: grab(/summary[:\s]+([^\n]+)/i) ?? raw.split("\n")[0].slice(0, 100),
    question: grab(/(?:query|question)[:\s]+([^\n]+)/i) ?? raw.slice(0, 300), requirements: grab(/requirements?[:\s]+([^\n]+)/i) ?? null, deadline,
  };
}
const haroView = (r: typeof s.haroRequests.$inferSelect) => {
  const expired = r.deadline && r.deadline < new Date() && !["Responded", "Rejected"].includes(r.status);
  return { ...r, status: expired ? "Expired" : r.status };
};
extra.get("/haro", wrap(async () => ({ rows: (await db.select().from(s.haroRequests).orderBy(desc(s.haroRequests.updatedAt))).map(haroView), clients: (await db.select().from(s.clients)), ai: aiStatus() })));
extra.post("/haro", wrap(async (req, res) => {
  const b = z.object({ rawEmail: z.string().min(10).max(20_000), outlet: z.string().optional(), journalist: z.string().optional(), deadline: z.string().optional() }).parse(req.body);
  let parsed = heuristicParse(b.rawEmail); let source = "heuristic";
  if (aiConfigured()) {
    try {
      const out = await chat([{ role: "system", content: 'Parse a HARO email. Reply ONLY JSON: {"outlet","journalist","category","title","question","requirements","deadline"(ISO or null)}.' }, { role: "user", content: b.rawEmail }], { json: true });
      const j = extractJson<any>(out); parsed = { ...parsed, ...Object.fromEntries(Object.entries(j).filter(([, v]) => v)), deadline: j.deadline ? new Date(j.deadline) : parsed.deadline }; source = "ai";
    } catch { /* heuristic fallback */ }
  }
  res.status(201);
  const row = (await db.insert(s.haroRequests).values({
    rawEmail: b.rawEmail, ...parsed, outlet: b.outlet || parsed.outlet, journalist: b.journalist || parsed.journalist,
    deadline: b.deadline ? new Date(b.deadline) : parsed.deadline, matches: [], responses: [],
  } as any).returning())[0];
  return { ...haroView(row), parsedBy: source };
}));
extra.put("/haro/:id", wrap(async (req) => {
  const b = z.object({ status: z.enum(["New", "Matched", "Drafted", "Responded", "Expired", "Rejected"]).optional(), responses: z.array(z.object({ clientId: z.number(), draft: z.string(), sentAt: z.number().nullish() })).optional() }).parse(req.body);
  return (await db.update(s.haroRequests).set({ ...b, updatedAt: new Date() }).where(eq(s.haroRequests.id, idOf(req.params.id))).returning())[0];
}));
extra.delete("/haro/:id", wrap(async (req) => { (await db.delete(s.haroRequests).where(eq(s.haroRequests.id, idOf(req.params.id)))); return { ok: true }; }));

const CAT_CLUSTER: [RegExp, Cluster][] = [[/tech|saas|app|ai|software|startup/i, "Tech / SaaS"], [/auto|car|vehicle|moving|logistic/i, "Auto logistics"], [/construction|trade|freight|truck|staff|labor/i, "Trades / freight"], [/real estate|home|house|property|mortgage|foreclos|probate|financ/i, "Cash home buyers"]];
extra.post("/haro/:id/match", wrap(async (req) => {
  const r = (await db.select().from(s.haroRequests).where(eq(s.haroRequests.id, idOf(req.params.id))))[0];
  if (!r) throw new HttpError(404, "Request not found");
  const clients = (await db.select().from(s.clients));
  const text = `${r.category} ${r.title} ${r.question} ${r.requirements}`;
  let matches: { clientId: number; score: number; why: string }[] = [];
  if (aiConfigured()) {
    try {
      const out = await chat([{ role: "system", content: 'Rank which clients could credibly answer this journalist query. Reply ONLY JSON: {"matches":[{"clientId":number,"score":0-100,"why":"short"}]} (top 5).' },
        { role: "user", content: JSON.stringify({ request: text, clients: clients.map((c) => ({ id: c.id, name: c.name, cluster: c.cluster, city: c.city })) }) }], { json: true });
      matches = extractJson<{ matches: typeof matches }>(out).matches;
    } catch { matches = []; }
  }
  if (!matches.length) {
    const cl = CAT_CLUSTER.filter(([re]) => re.test(text)).map(([, c]) => c);
    matches = clients.filter((c) => cl.includes(c.cluster as Cluster)).map((c) => ({ clientId: c.id, score: 60, why: `Cluster fit: ${c.cluster}` })).slice(0, 5);
  }
  return (await db.update(s.haroRequests).set({ matches, status: matches.length && r.status === "New" ? "Matched" : r.status, updatedAt: new Date() }).where(eq(s.haroRequests.id, r.id)).returning())[0];
}));
extra.post("/haro/:id/draft", wrap(async (req) => {
  const { clientId } = z.object({ clientId: z.number().int() }).parse(req.body);
  const r = (await db.select().from(s.haroRequests).where(eq(s.haroRequests.id, idOf(req.params.id))))[0];
  const c = (await db.select().from(s.clients).where(eq(s.clients.id, clientId)))[0];
  if (!r || !c) throw new HttpError(404, "Not found");
  let draft = "";
  if (aiConfigured()) {
    try { draft = await chat([{ role: "system", content: "Write a concise, expert, quotable HARO response (under 150 words), first person, no fluff, no invented statistics." }, { role: "user", content: `Question: ${r.question}\nRequirements: ${r.requirements}\nExpert from: ${c.name} (${c.cluster}, ${c.city ?? ""}).` }]); } catch { draft = ""; }
  }
  if (!draft) draft = `Hi ${r.journalist ?? "there"},\n\nRe: ${r.question}\n\n[Add 2–3 concrete, first-hand points from ${c.name}'s experience in ${c.cluster.toLowerCase()}.]\n\nBest,\n[Name], ${c.name} (${c.domain})`;
  const responses = [...(r.responses ?? []).filter((x) => x.clientId !== clientId), { clientId, draft, sentAt: null }];
  return (await db.update(s.haroRequests).set({ responses, status: "Drafted", updatedAt: new Date() }).where(eq(s.haroRequests.id, r.id)).returning())[0];
}));
