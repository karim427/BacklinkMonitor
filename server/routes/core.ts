import { Router, type Request, type Response, type NextFunction } from "express";
import { z } from "zod";
import { and, desc, eq, gte, inArray, isNotNull, lt } from "drizzle-orm";
import { db, schema as s } from "../db/index.js";
import {
  ANCHOR_TYPES, CLUSTERS, LINK_ACTIONS, SPAM_CODES, PLACEMENTS, REJECT_RULES, STAGES, VERDICTS, type AnchorBands, type AppSettings,
} from "../services/constants.js";
import { anchorMix, dueLabel, monthKey, stage1, targetProgress, validateBands, linkMonth } from "../services/rules.js";
import { getSettings, hostOf, runDueRechecks, runVerification, scheduleOnPlace } from "../services/linkService.js";
import { aiStatus } from "../services/ai.js";
import { given } from "../util.js";
import { ahrefsStatus, checkAhrefsKey, getAhrefsKey, setAhrefsKey } from "../services/secrets.js";
import { fetchDonorMetrics } from "../services/ahrefs.js";
import { autoLookupEnabled } from "../services/donorMetrics.js";

export const core = Router();

export const wrap = (fn: (req: Request, res: Response) => unknown) => async (req: Request, res: Response, next: NextFunction) => {
  try { res.json(await fn(req, res)); } catch (e) { next(e); }
};
export class HttpError extends Error { constructor(public status: number, msg: string) { super(msg); } }
const idOf = (req: Request) => { const n = Number(req.params.id); if (!Number.isInteger(n)) throw new HttpError(400, "Invalid id"); return n; };
const monthParam = (req: Request) => {
  const m = String(req.query.month ?? monthKey(new Date()));
  if (!/^\d{4}-\d{2}$/.test(m)) throw new HttpError(400, "month must be YYYY-MM");
  return m;
};
const addMonths = (m: string, n: number) => { const [y, mo] = m.split("-").map(Number); const d = new Date(Date.UTC(y, mo - 1 + n, 1)); return monthKey(d); };

/* ---------------- enrichment ---------------- */
export async function loadLinks() {
  const [rows, clientRows, donorRows, pageRows, errRuns] = await Promise.all([
    db.select().from(s.links).orderBy(desc(s.links.placedAt)), db.select().from(s.clients), db.select().from(s.donors), db.select().from(s.targetPages),
    db.select({ linkId: s.checkRuns.linkId, error: s.checkRuns.error }).from(s.checkRuns).where(isNotNull(s.checkRuns.error)).orderBy(desc(s.checkRuns.ranAt)).limit(300),
  ]);
  const lastError = new Map<number, string>();
  for (const r of errRuns) if (r.error && !lastError.has(r.linkId)) lastError.set(r.linkId, r.error);
  const cl = new Map(clientRows.map((c) => [c.id, c]));
  const dn = new Map(donorRows.map((d) => [d.id, d]));
  const tp = new Map(pageRows.map((t) => [t.id, t]));
  const now = new Date();
  return rows.map((l) => ({
    ...l,
    lastError: l.verificationStatus === "Error" ? lastError.get(l.id) ?? null : null,
    month: linkMonth({ verdict: l.verdict as any, placedAt: l.placedAt, createdAt: l.createdAt }),
    client: cl.get(l.clientId) ?? null, donor: dn.get(l.donorId) ?? null, targetPage: l.targetPageId ? tp.get(l.targetPageId) ?? null : null,
    due: dueLabel(l.nextCheckAt, now),
  }));
}

const monthTargetFor = (client: typeof s.clients.$inferSelect, overrides: (typeof s.clientMonthTargets.$inferSelect)[], month: string) => {
  const o = overrides.find((x) => x.clientId === client.id && x.month === month);
  return { target: o?.target ?? client.defaultMonthlyTarget, overridden: !!o };
};

/* ---------------- dashboard ---------------- */
core.get("/dashboard", wrap(async (req) => {
  const month = monthParam(req);
  const [settings, links, clients, overrides, wsRows, pages] = await Promise.all([
    getSettings(), loadLinks(), db.select().from(s.clients), db.select().from(s.clientMonthTargets),
    db.select().from(s.workspaceMonthTargets).where(eq(s.workspaceMonthTargets.month, month)), db.select().from(s.targetPages),
  ]);
  const ws = wsRows[0];
  const target = ws?.target ?? clients.reduce((a, c) => a + monthTargetFor(c, overrides, month).target, 0);
  const inMonth = links.filter((l) => l.month === month);
  const prog = targetProgress(links as any, month, target);
  const clientsAtTarget = clients.filter((c) => {
    const p = targetProgress(links.filter((l) => l.clientId === c.id) as any, month, monthTargetFor(c, overrides, month).target);
    return p.target > 0 && p.relevant >= p.target;
  }).length;

  // anchor mix: rolling 3 months per target page that has links
  const start = addMonths(month, -2);
  const anchor = pages.map((p) => {
    const ls = links.filter((l) => l.targetPageId === p.id && l.month >= start && l.month <= month && l.verdict !== "Not relevant");
    return { targetPageId: p.id, client: clients.find((c) => c.id === p.clientId)?.name, keyword: p.keyword, linkCount: ls.length, ...anchorMix(ls, settings.anchorBands) };
  }).filter((a) => a.linkCount > 0);

  const now = new Date();
  const active = links.filter((l) => l.stage !== "Lost" && l.nextCheckAt);
  const dueList = active.filter((l) => l.nextCheckAt! <= now).sort((a, b) => a.nextCheckAt!.getTime() - b.nextCheckAt!.getTime());
  const next30 = active.filter((l) => l.nextCheckAt! > now && l.nextCheckAt!.getTime() - now.getTime() <= 30 * 86_400_000).length;
  const sixty = now.getTime() - 60 * 86_400_000;
  const lost = links.filter((l) => (l.stage === "Lost" || l.verdict === "Not relevant") && (l.lastCheckedAt ?? l.createdAt).getTime() >= sixty);

  return {
    month, target, recurringDefault: !ws, progress: prog, clientsAtTarget, clientCount: clients.length,
    chips: {
      unverified: inMonth.filter((l) => l.verificationStatus === "Unverified").length,
      awaitingIndex: inMonth.filter((l) => l.rejectReasons?.includes("quality_not_indexed")).length,
      partlyFixing: inMonth.filter((l) => l.verdict === "Partly relevant" && l.fixWindowEndsAt).length,
    },
    added: inMonth.length, rejected: inMonth.filter((l) => l.verdict === "Not relevant").length,
    overdue: { count: dueList.length, next30 },
    anchorMix: anchor, anchorInBand: anchor.filter((a) => a.inBand).length,
    rechecksDue: dueList.slice(0, 8), lostLinks: lost.slice(0, 8),
  };
}));
core.put("/dashboard/target", wrap(async (req) => {
  const b = z.object({ month: z.string().regex(/^\d{4}-\d{2}$/), target: z.number().int().min(0).nullable() }).parse(req.body);
  if (b.target === null) (await db.delete(s.workspaceMonthTargets).where(eq(s.workspaceMonthTargets.month, b.month)));
  else (await db.insert(s.workspaceMonthTargets).values({ month: b.month, target: b.target }).onConflictDoUpdate({ target: s.workspaceMonthTargets.month, set: { target: b.target } }));
  return { ok: true };
}));

/* ---------------- clients ---------------- */
const clientBody = z.object({
  name: z.string().min(1), domain: z.string().min(1), cluster: z.enum(CLUSTERS), city: z.string().nullish(), state: z.string().nullish(),
  isCashBuyer: z.boolean().default(false), defaultMonthlyTarget: z.number().int().min(0).default(4),
  gbpName: z.string().nullish(), gbpAddress: z.string().nullish(), gbpPhone: z.string().nullish(),
});
const slugify = (n: string) => n.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");

core.get("/clients", wrap(async (req) => {
  const month = monthParam(req);
  const [clients, overrides, pages, links] = await Promise.all([
    db.select().from(s.clients).orderBy(s.clients.name), db.select().from(s.clientMonthTargets), db.select().from(s.targetPages), loadLinks(),
  ]);
  const rows = clients.map((c) => {
    const t = monthTargetFor(c, overrides, month);
    const p = targetProgress(links.filter((l) => l.clientId === c.id) as any, month, t.target);
    return { ...c, targetPages: pages.filter((x) => x.clientId === c.id).length, target: t.target, received: p.relevant, remaining: p.remaining, pending: p.pending };
  });
  return {
    month, rows,
    totals: {
      clients: rows.length, targetPages: pages.length, target: rows.reduce((a, r) => a + r.target, 0),
      received: rows.reduce((a, r) => a + r.received, 0), remaining: rows.reduce((a, r) => a + r.remaining, 0),
    },
  };
}));
core.post("/clients", wrap(async (req, res) => {
  const b = clientBody.parse(req.body);
  res.status(201);
  return (await db.insert(s.clients).values({ ...b, slug: slugify(b.name) }).returning())[0];
}));
core.put("/clients/:id", wrap(async (req) => {
  const b = given(clientBody.partial().parse(req.body), req.body);
  return (await db.update(s.clients).set(b).where(eq(s.clients.id, idOf(req))).returning())[0];
}));
core.delete("/clients/:id", wrap(async (req) => { (await db.delete(s.clients).where(eq(s.clients.id, idOf(req)))); return { ok: true }; }));

core.get("/clients/:id", wrap(async (req) => {
  const id = idOf(req);
  const client = (await db.select().from(s.clients).where(eq(s.clients.id, id)))[0];
  if (!client) throw new HttpError(404, "Client not found");
  const overrides = (await db.select().from(s.clientMonthTargets).where(eq(s.clientMonthTargets.clientId, id)));
  const links = (await loadLinks()).filter((l) => l.clientId === id);
  const cur = monthKey(new Date());
  const months = Array.from({ length: 13 }, (_, i) => addMonths(cur, i - 11)).reverse().map((m) => {
    const t = monthTargetFor(client, overrides, m);
    const p = targetProgress(links as any, m, t.target);
    return { month: m, ...t, received: p.relevant, remaining: p.remaining, total: p.received, status: m === cur ? "Current" : m > cur ? "Planned" : "Past" };
  });
  const last = months.find((m) => m.month === addMonths(cur, -1));
  return {
    client, months, links,
    cards: {
      thisMonth: months.find((m) => m.month === cur), lastMonth: last,
      allTime: links.filter((l) => l.verdict === "Relevant").length,
      targetPages: (await db.select().from(s.targetPages).where(eq(s.targetPages.clientId, id))).length,
      activeMonths: months.filter((m) => m.total > 0).length,
    },
  };
}));
core.put("/clients/:id/months/:month", wrap(async (req) => {
  const id = idOf(req); const month = String(req.params.month);
  const b = z.object({ target: z.number().int().min(0).nullable() }).parse(req.body);
  if (b.target === null) { (await db.delete(s.clientMonthTargets).where(and(eq(s.clientMonthTargets.clientId, id), eq(s.clientMonthTargets.month, month)))); return { ok: true, reset: true }; }
  (await db.insert(s.clientMonthTargets).values({ clientId: id, month, target: b.target })
    .onConflictDoUpdate({ target: [s.clientMonthTargets.clientId, s.clientMonthTargets.month], set: { target: b.target } }));
  return { ok: true };
}));

/* ---------------- target pages ---------------- */
const tpBody = z.object({
  clientId: z.number().int(), url: z.string().url(), keyword: z.string().min(1),
  currentRDs: z.number().int().min(0).default(0), rdsNeeded: z.number().int().min(0).default(0),
  status: z.enum(["Pending", "Approved", "Rejected"]).default("Pending"), approvalMonth: z.string().nullish(),
});
core.get("/target-pages", wrap(async () => {
  const [clientRows, pageRows] = await Promise.all([db.select().from(s.clients), db.select().from(s.targetPages).orderBy(desc(s.targetPages.id))]);
  const clients = new Map(clientRows.map((c) => [c.id, c]));
  const rows = pageRows.map((t) => ({ ...t, client: clients.get(t.clientId) ?? null }));
  return { rows, totals: { approved: rows.filter((r) => r.status === "Approved").length, pending: rows.filter((r) => r.status === "Pending").length, rejected: rows.filter((r) => r.status === "Rejected").length, linksNeeded: rows.filter((r) => r.status !== "Rejected").reduce((a, r) => a + r.linksNeeded, 0) } };
}));
core.post("/target-pages/preview", wrap(async (req) => stage1(z.object({ rdsNeeded: z.number().min(0), currentRDs: z.number().min(0).default(0) }).parse(req.body).rdsNeeded)));
core.post("/target-pages", wrap(async (req, res) => {
  const b = tpBody.parse(req.body); const r = stage1(b.rdsNeeded, b.currentRDs);
  res.status(201);
  return (await db.insert(s.targetPages).values({ ...b, linksNeeded: r.linksNeeded, monthsToClose: r.monthsToClose }).returning())[0];
}));
core.put("/target-pages/:id", wrap(async (req) => {
  const b = given(tpBody.partial().parse(req.body), req.body);
  const patch: Record<string, unknown> = { ...b };
  if (b.rdsNeeded !== undefined) { const r = stage1(b.rdsNeeded, b.currentRDs ?? 0); patch.linksNeeded = r.linksNeeded; patch.monthsToClose = r.monthsToClose; }
  if (b.status === "Approved" && !b.approvalMonth) patch.approvalMonth = monthKey(new Date());
  return (await db.update(s.targetPages).set(patch).where(eq(s.targetPages.id, idOf(req))).returning())[0];
}));
core.delete("/target-pages/:id", wrap(async (req) => { (await db.delete(s.targetPages).where(eq(s.targetPages.id, idOf(req)))); return { ok: true }; }));

/* ---------------- links ---------------- */
const linkBody = z.object({
  clientId: z.number().int(), targetPageId: z.number().int().nullish(), donorId: z.number().int().nullish(), donorDomain: z.string().nullish(),
  sourceUrl: z.string().url(), targetUrl: z.string().url(), anchorText: z.string().default(""),
  anchorType: z.enum(ANCHOR_TYPES).default("Natural"), placement: z.enum(PLACEMENTS).default("Unknown"),
  reviewer: z.string().nullish(), notes: z.string().nullish(),
  // A link can't have been placed in the future (14h slack covers every timezone).
  placedAt: z.string().nullish().refine((v) => !v || new Date(v).getTime() <= Date.now() + 14 * 3_600_000, "Placed date can't be in the future"),
  verdict: z.enum(VERDICTS).optional(), stage: z.enum(STAGES).optional(), action: z.enum(LINK_ACTIONS).optional(),
  autoVerify: z.boolean().default(false),
});
async function resolveDonor(b: { donorId?: number | null; donorDomain?: string | null; sourceUrl: string }, clientId: number) {
  if (b.donorId) return b.donorId;
  const domain = (b.donorDomain || hostOf(b.sourceUrl)).replace(/^www\./, "");
  const found = (await db.select().from(s.donors).where(eq(s.donors.domain, domain)))[0];
  if (found) return found.id;
  const client = (await db.select().from(s.clients).where(eq(s.clients.id, clientId)))[0];
  let metrics: Partial<typeof s.donors.$inferInsert> = {};
  const key = (await autoLookupEnabled()) ? await getAhrefsKey() : null;
  if (key) { // opt-in only (costs Ahrefs units); real numbers only: never invent metrics for a donor we know nothing about
    try { const m = await fetchDonorMetrics(domain, key); metrics = { dr: m.dr, usTrafficPct: m.usTrafficPct, organicTraffic: m.organicTraffic, referringDomains: m.referringDomains, linkedDomains: m.linkedDomains, ahrefsSyncedAt: new Date() }; } catch { /* leave empty: shows as "metrics not loaded" */ }
  }
  return (await db.insert(s.donors).values({ domain, name: domain, cluster: client?.cluster ?? CLUSTERS[0], ...metrics }).returning())[0].id;
}
core.get("/links", wrap(async () => {
  const all = await loadLinks();
  const count = (v: string) => all.filter((l) => l.verdict === v).length;
  const now = new Date();
  return { rows: all, totals: { total: all.length, relevant: count("Relevant"), partly: count("Partly relevant"), notRelevant: count("Not relevant"), dueRechecks: all.filter((l) => l.stage !== "Lost" && l.nextCheckAt && l.nextCheckAt <= now).length } };
}));
core.get("/links/export", async (req, res, next) => {
  try {
    const q = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const head = ["Client", "Source URL", "Target URL", "Anchor", "Anchor type", "Donor", "DR", "Verdict", "Stage", "Action", "Placed", "Last checked", "Next check", "Rejects"];
    const lines = (await loadLinks()).map((l) => [l.client?.name, l.sourceUrl, l.targetUrl, l.anchorText, l.anchorType, l.donor?.domain, l.donor?.dr, l.verdict, l.stage, l.action,
      l.placedAt?.toISOString().slice(0, 10), l.lastCheckedAt?.toISOString().slice(0, 10), l.nextCheckAt?.toISOString().slice(0, 10), (l.rejectReasons ?? []).join("|")].map(q).join(","));
    res.setHeader("content-type", "text/csv"); res.setHeader("content-disposition", 'attachment; filename="backlink-review-log.csv"');
    res.send([head.map(q).join(","), ...lines].join("\n"));
  } catch (e) { next(e); }
});
core.get("/links/:id", wrap(async (req) => {
  const l = (await loadLinks()).find((x) => x.id === idOf(req));
  if (!l) throw new HttpError(404, "Link not found");
  return { ...l, checkRuns: (await db.select().from(s.checkRuns).where(eq(s.checkRuns.linkId, l.id)).orderBy(desc(s.checkRuns.ranAt))) };
}));
async function createLink(b: z.infer<typeof linkBody>, userId?: number) {
  const donorId = await resolveDonor(b, b.clientId);
  const placedAt = b.placedAt ? new Date(b.placedAt) : null;
  const { autoVerify, donorDomain, donorId: _d, ...rest } = b;
  const values = { ...rest, donorId, placedAt, createdBy: userId || null, ...(placedAt ? await scheduleOnPlace(placedAt) : {}), verificationStatus: autoVerify ? "Queued" : "Unverified" } as typeof s.links.$inferInsert;
  const row = (await db.insert(s.links).values(values).returning())[0];
  if (autoVerify) return runVerification(row.id);
  return row;
}
core.post("/links", wrap(async (req, res) => { res.status(201); return createLink(linkBody.parse(req.body), req.user?.id); }));
core.put("/links/:id", wrap(async (req) => {
  const id = idOf(req); const b = given(linkBody.partial().parse(req.body), req.body);
  const { autoVerify, donorDomain, ...rest } = b;
  const patch: Record<string, unknown> = { ...rest };
  if (b.placedAt !== undefined) { const p = b.placedAt ? new Date(b.placedAt) : null; patch.placedAt = p; if (p) Object.assign(patch, await scheduleOnPlace(p)); }
  if (!b.donorId && donorDomain) patch.donorId = await resolveDonor({ donorDomain, sourceUrl: b.sourceUrl ?? "" }, b.clientId ?? 0);
  const row = (await db.update(s.links).set(patch).where(eq(s.links.id, id)).returning())[0];
  if (autoVerify) await runVerification(id);
  return row;
}));
core.delete("/links/:id", wrap(async (req) => { (await db.delete(s.links).where(eq(s.links.id, idOf(req)))); return { ok: true }; }));
core.post("/links/:id/verify", wrap(async (req) => runVerification(idOf(req))));

/** CSV import: header row with columns client, sourceUrl, targetUrl, anchorText, anchorType, placement, reviewer, placedAt */
function parseCsv(text: string) {
  const rows: string[][] = []; let cur: string[] = []; let f = ""; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"' && text[i + 1] === '"') { f += '"'; i++; } else if (c === '"') q = false; else f += c; }
    else if (c === '"') q = true; else if (c === ",") { cur.push(f); f = ""; }
    else if (c === "\n" || c === "\r") { if (c === "\r" && text[i + 1] === "\n") i++; cur.push(f); f = ""; if (cur.some(Boolean)) rows.push(cur); cur = []; }
    else f += c;
  }
  cur.push(f); if (cur.some(Boolean)) rows.push(cur);
  return rows;
}
core.post("/links/import", wrap(async (req) => {
  const { csv } = z.object({ csv: z.string().min(1) }).parse(req.body);
  const [head, ...rows] = parseCsv(csv); const idx = (n: string) => head.findIndex((h) => h.trim().toLowerCase() === n.toLowerCase());
  const clients = (await db.select().from(s.clients));
  const result = { created: 0, errors: [] as { row: number; error: string }[] };
  for (const [i, r] of rows.entries()) {
    const get = (n: string) => (idx(n) >= 0 ? r[idx(n)]?.trim() : undefined) || undefined;
    const c = clients.find((x) => x.name.toLowerCase() === (get("client") ?? "").toLowerCase() || x.slug === get("client"));
    const parsed = linkBody.safeParse({
      clientId: c?.id, sourceUrl: get("sourceUrl"), targetUrl: get("targetUrl"), anchorText: get("anchorText") ?? "",
      anchorType: get("anchorType") ?? "Natural", placement: get("placement") ?? "Unknown", reviewer: get("reviewer"), placedAt: get("placedAt"),
    });
    if (!parsed.success) { result.errors.push({ row: i + 2, error: c ? parsed.error.issues[0].path.join(".") + ": " + parsed.error.issues[0].message : `Unknown client "${get("client")}"` }); continue; }
    await createLink(parsed.data, req.user?.id); result.created++;
  }
  return result;
}));

/* ---------------- rechecks ---------------- */
/** Per-client check results for one month: links confirmed indexed, spam links picked up, and links lost. */
core.get("/rechecks/summary", wrap(async (req) => {
  const month = monthParam(req);
  const start = new Date(`${month}-01T00:00:00Z`); const end = new Date(`${addMonths(month, 1)}-01T00:00:00Z`);
  const [links, runs, clients] = await Promise.all([
    loadLinks(),
    db.select().from(s.checkRuns).where(and(gte(s.checkRuns.ranAt, start), lt(s.checkRuns.ranAt, end))).orderBy(desc(s.checkRuns.ranAt)),
    db.select().from(s.clients).orderBy(s.clients.name),
  ]);
  const latest = new Map<number, (typeof runs)[number]>(); const checked = new Set<number>();
  for (const r of runs) { checked.add(r.linkId); if (!latest.has(r.linkId) && r.result !== "error") latest.set(r.linkId, r); }
  const inMonth = (d: Date | null | undefined) => !!d && d >= start && d < end;
  const spamOf = (l: (typeof links)[number]) => (l.rejectReasons ?? []).filter((c) => SPAM_CODES.includes(c));
  const rows = clients.map((c) => {
    const mine = links.filter((l) => l.clientId === c.id);
    const detail = mine.map((l) => {
      const run = latest.get(l.id);
      const added = l.month === month; const lost = l.stage === "Lost" && inMonth(l.lastCheckedAt);
      const indexed = run && run.linkFound !== false ? (run.indexed ?? null) : null;
      const spam = added ? spamOf(l) : [];
      return { id: l.id, sourceUrl: l.sourceUrl, donor: l.donor?.domain ?? null, anchorText: l.anchorText, verdict: l.verdict, stage: l.stage, addedBy: l.reviewer, placedAt: l.placedAt,
        added, checked: checked.has(l.id), indexed, spam, lost, lostAt: lost ? l.lastCheckedAt : null, due: !!l.nextCheckAt && l.stage !== "Lost" && l.nextCheckAt <= new Date() };
    }).filter((d) => d.added || d.checked || d.lost);
    return {
      clientId: c.id, name: c.name, domain: c.domain, cluster: c.cluster,
      added: detail.filter((d) => d.added).length, checked: detail.filter((d) => d.checked).length,
      indexed: detail.filter((d) => d.indexed === true).length, notIndexed: detail.filter((d) => d.indexed === false).length,
      spam: detail.filter((d) => d.spam.length).length, lost: detail.filter((d) => d.lost).length, due: detail.filter((d) => d.due).length,
      links: detail,
    };
  }).filter((r) => r.links.length > 0);
  const sum = (k: "added" | "checked" | "indexed" | "notIndexed" | "spam" | "lost" | "due") => rows.reduce((a, r) => a + r[k], 0);
  return { month, rows, totals: { added: sum("added"), checked: sum("checked"), indexed: sum("indexed"), notIndexed: sum("notIndexed"), spam: sum("spam"), lost: sum("lost"), due: sum("due") } };
}));
core.get("/rechecks", wrap(async () => {
  const now = new Date();
  const rows = (await loadLinks()).filter((l) => l.stage !== "Lost" && l.nextCheckAt).sort((a, b) => a.nextCheckAt!.getTime() - b.nextCheckAt!.getTime());
  const due = rows.filter((l) => l.nextCheckAt! <= now);
  const domains = new Map<string, number>();
  for (const l of due) if (l.donor) domains.set(l.donor.domain, (domains.get(l.donor.domain) ?? 0) + 1);
  return {
    rows,
    counts: { due: due.length, overdue: due.filter((l) => l.due.overdue).length, d30: rows.filter((l) => l.nextCheckKind === "30-day").length, d90: rows.filter((l) => l.nextCheckKind === "90-day").length, all: rows.length },
    domains: [...domains].map(([domain, count]) => ({ domain, count })),
  };
}));
core.post("/rechecks/run-due", wrap(async () => ({ results: await runDueRechecks() })));

/* ---------------- settings ---------------- */
core.get("/settings", wrap(async () => ({
  settings: await getSettings(), rejectRules: REJECT_RULES, ai: aiStatus(),
  ahrefs: {
    ...(await (async () => { const st = await ahrefsStatus(); return { credentialLoaded: st.connected, mock: !st.connected, source: st.source, last4: st.last4 }; })()),
    donorsSynced: (await db.select().from(s.donors)).filter((d) => d.ahrefsSyncedAt).length, donorsTotal: (await db.select().from(s.donors)).length,
    lastSync: (await db.select().from(s.donors)).reduce<Date | null>((a, d) => (d.ahrefsSyncedAt && (!a || d.ahrefsSyncedAt > a) ? d.ahrefsSyncedAt : a), null),
  },
})));
const bandSchema = z.object({ min: z.number(), max: z.number() });
/** Admin-only (the gate blocks non-GET for users). The key is write-only: it is never returned, only its last 4 characters. */
core.put("/settings/ahrefs-key", wrap(async (req) => {
  const { key } = z.object({ key: z.string().trim().min(8).max(500).nullable() }).parse(req.body);
  if (key === null) { await setAhrefsKey(null); return { ok: true, removed: true }; }
  const check = await checkAhrefsKey(key);
  if (check === "invalid") throw new HttpError(400, "Ahrefs rejected this key. Check that you copied the whole API key.");
  await setAhrefsKey(key);
  return { ok: true, verified: check === "valid" };
}));
core.put("/settings", wrap(async (req) => {
  const b = z.object({
    verifierUserAgent: z.string().min(1), firstRecheckDays: z.number().int().min(1), nextRecheckDays: z.number().int().min(1),
    fixWindowDays: z.number().int().min(1), defaultMonthlyTarget: z.number().int().min(0), ahrefsAutoLookup: z.boolean(),
    anchorBands: z.object({ Branded: bandSchema, Partial: bandSchema, Natural: bandSchema, Exact: bandSchema }),
  }).partial().parse(req.body);
  if (b.anchorBands) { const err = validateBands(b.anchorBands as AnchorBands); if (err) throw new HttpError(400, err); }
  const next: AppSettings = { ...(await getSettings()), ...b } as AppSettings;
  (await db.insert(s.settings).values({ key: "app", value: next }).onConflictDoUpdate({ target: s.settings.key, set: { value: next } }));
  return next;
}));
void inArray;
