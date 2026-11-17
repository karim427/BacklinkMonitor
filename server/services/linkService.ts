import { and, eq, ne, gte, inArray } from "drizzle-orm";
import { db, schema as s } from "../db/index.js";
import { CLUSTERS, DEFAULT_SETTINGS, PRE_LIVE, type AppSettings, type Cluster } from "./constants.js";
import { applyRecheck, evaluateRejectRules, fixWindowEnd, scheduleFirstCheck, verdictFor, type DonorMetrics, type LinkFacts } from "./rules.js";
import { verifyLink } from "./verifier.js";
import { ensureFreshMetrics } from "./donorMetrics.js";

export async function getSettings(): Promise<AppSettings> {
  const row = (await db.select().from(s.settings).where(eq(s.settings.key, "app")))[0];
  return { ...DEFAULT_SETTINGS, ...((row?.value as Partial<AppSettings>) ?? {}) };
}

export const toDonorMetrics = (d: typeof s.donors.$inferSelect): DonorMetrics => ({
  domain: d.domain, dr: d.dr, usTrafficPct: d.usTrafficPct, organicTraffic: d.organicTraffic, referringDomains: d.referringDomains,
  linkedDomains: d.linkedDomains, cluster: d.cluster, isLocal: d.isLocal, trafficHistory: d.trafficHistory ?? undefined,
  flags: d.flags ?? {}, niche: d.niche ?? undefined,
  metricsMissing: !d.ahrefsSyncedAt && !d.dr && !d.usTrafficPct && !d.organicTraffic && !d.referringDomains && !d.linkedDomains,
});

export const hostOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, "").toLowerCase(); } catch { return u.toLowerCase(); } };
const SIX_MONTHS = 183 * 86_400_000;

/** Contextual facts that need DB lookups: reuse + competing cash-buyer clients. */
export async function contextFacts(link: typeof s.links.$inferSelect, client: typeof s.clients.$inferSelect) {
  const others = (await db.select().from(s.links).where(and(eq(s.links.donorId, link.donorId), ne(s.links.id, link.id))));
  const clientIds = new Set(others.map((l) => l.clientId));
  clientIds.delete(link.clientId);
  const cutoff = Date.now() - SIX_MONTHS;
  const reusedSameClient6mo = others.some((l) => l.clientId === link.clientId && l.verdict !== "Not relevant" && (l.placedAt ?? l.createdAt).getTime() >= cutoff);
  let competing = false;
  if (client.isCashBuyer && others.length) {
    const cashClients = (await db.select().from(s.clients).where(and(eq(s.clients.isCashBuyer, true), inArray(s.clients.id, [...clientIds].length ? [...clientIds] : [-1]))));
    competing = cashClients.some((c) => c.city && client.city && c.city.toLowerCase() === client.city.toLowerCase()) ||
      others.some((l) => l.sourceUrl === link.sourceUrl && l.clientId !== link.clientId && cashClients.some((c) => c.id === l.clientId));
  }
  return { donorLinksToClients: clientIds.size, reusedSameClient6mo, competingCashClientSamePageOrCity: competing };
}

/** Run the verifier + rules for a link, persist a CheckRun and update the link. */
export async function runVerification(linkId: number, fetchImpl?: typeof fetch) {
  const link = (await db.select().from(s.links).where(eq(s.links.id, linkId)))[0];
  if (!link) throw new Error("Link not found");
  if (link.action === "REJECTED") return link; // turned down or dropped by hand: nothing to check
  const donor = await ensureFreshMetrics((await db.select().from(s.donors).where(eq(s.donors.id, link.donorId)))[0]!);
  const client = (await db.select().from(s.clients).where(eq(s.clients.id, link.clientId)))[0]!;
  const settings = await getSettings();
  (await db.update(s.links).set({ verificationStatus: "Checking" }).where(eq(s.links.id, linkId)));

  const competitorDomains = (await db.select().from(s.clients).where(and(eq(s.clients.cluster, client.cluster), ne(s.clients.id, client.id)))).map((c) => c.domain);
  const v = await verifyLink({ sourceUrl: link.sourceUrl, targetUrl: link.targetUrl, userAgent: settings.verifierUserAgent, competitorDomains }, fetchImpl);
  const now = new Date();

  if (!v.ok) {
    // Fetch failed: not a relevance failure. Mark Error and keep prior verdict; fall back to Ahrefs index (donor data) for rules.
    (await db.insert(s.checkRuns).values({ linkId, ranAt: now, httpStatus: v.httpStatus ?? null, result: "error", error: v.error }));
    (await db.update(s.links).set({ verificationStatus: "Error", lastCheckedAt: now }).where(eq(s.links.id, linkId)));
    return (await db.select().from(s.links).where(eq(s.links.id, linkId)))[0]!;
  }

  // Not live yet (Pending / In process): never judge. If the link is on the page now, it goes Live and is judged below; if not, just note that we looked.
  const preLive = PRE_LIVE.includes(link.action);
  if (preLive && !v.linkFound) {
    (await db.insert(s.checkRuns).values({ linkId, ranAt: now, httpStatus: v.httpStatus ?? null, linkFound: false, indexed: v.indexed, outboundLinks: v.outboundLinks, result: "not_live_yet" }));
    (await db.update(s.links).set({ verificationStatus: "Unverified", lastCheckedAt: now, verdict: "Not judged", rejectReasons: [], fixWindowEndsAt: null }).where(eq(s.links.id, linkId)));
    return (await db.select().from(s.links).where(eq(s.links.id, linkId)))[0]!;
  }

  const facts: LinkFacts = {
    donor: toDonorMetrics(donor), clientCluster: client.cluster as Cluster, sourceUrl: link.sourceUrl, clientId: client.id,
    linkFound: v.linkFound, rel: v.rel, placement: v.placement, outboundLinks: v.outboundLinks, targetMatched: v.targetMatched,
    indexed: v.indexed, competitorLinked: v.competitorLinked, ...(await contextFacts(link, client)),
  };
  const rejects = v.linkFound ? evaluateRejectRules(facts) : [];
  const isRecheck = !preLive && !!link.lastCheckedAt && link.stage !== "Intake";
  const patch: Partial<typeof s.links.$inferInsert> = { verificationStatus: "Verified", lastCheckedAt: now, rejectReasons: rejects };

  if (isRecheck && link.nextCheckKind) {
    Object.assign(patch, applyRecheck({ stage: link.stage, nextCheckKind: link.nextCheckKind }, { linkFound: !!v.linkFound, rejects }, now, settings));
  } else {
    const r = verdictFor(rejects);
    const existingWindow = link.fixWindowEndsAt && link.fixWindowEndsAt > now ? link.fixWindowEndsAt : fixWindowEnd(now, settings);
    const verdict = !v.linkFound ? (facts.donor.metricsMissing ? "Not judged" : "Partly relevant") : verdictFor(rejects, { fixWindowEndsAt: link.fixWindowEndsAt }).verdict;
    Object.assign(patch, {
      verdict, action: verdict === "Relevant" || verdict === "Not judged" ? "LIVE" : "REPLACE",
      fixWindowEndsAt: verdict === "Partly relevant" ? existingWindow : null,
      stage: link.stage === "Intake" && link.placedAt ? "Placed" : link.stage,
    });
    if (preLive) Object.assign(patch, { placedAt: link.placedAt ?? now, stage: "Placed", ...scheduleFirstCheck(link.placedAt ?? now, settings) }); // went live: the 30-day clock starts
    if (!link.nextCheckAt && !patch.nextCheckAt) Object.assign(patch, scheduleFirstCheck(link.placedAt ?? now, settings)); // e.g. set Live by hand: make sure it still gets rechecked
    if (!v.linkFound) patch.rejectReasons = facts.donor.metricsMissing ? ["link_wrong_target", "donor_metrics_missing"] : ["link_wrong_target"];
    void r;
  }
  (await db.insert(s.checkRuns).values({
    linkId, ranAt: now, httpStatus: v.httpStatus ?? null, linkFound: v.linkFound, rel: v.rel ?? [], anchorFound: v.anchorFound,
    targetMatched: v.targetMatched, indexed: v.indexed, placementDetected: v.placement, outboundLinks: v.outboundLinks,
    result: (patch.verdict as string) ?? "ok",
  }));
  (await db.update(s.links).set(patch).where(eq(s.links.id, linkId)));
  (await db.update(s.donors).set({ lastUsedAt: link.placedAt ?? now }).where(eq(s.donors.id, link.donorId)));
  return (await db.select().from(s.links).where(eq(s.links.id, linkId)))[0]!;
}

export async function scheduleOnPlace(placedAt: Date) {
  return { stage: "Placed", ...scheduleFirstCheck(placedAt, await getSettings()) };
}

export async function runDueRechecks(now = new Date()) {
  // Due rechecks, plus every "In process" link: it is looked at on each run until it shows up on the page and goes Live.
  const due = (await db.select().from(s.links).where(and(ne(s.links.stage, "Lost")))).filter((l) => l.action !== "REJECTED" && (l.action === "IN_PROCESS" || (l.nextCheckAt && l.nextCheckAt <= now && !PRE_LIVE.includes(l.action))));
  const out: { id: number; verdict: string; error?: boolean }[] = [];
  // A few at a time: each check can take up to 15s waiting on the donor site, and a serverless run has a hard time limit.
  const BATCH = 4;
  for (let i = 0; i < due.length; i += BATCH) {
    const done = await Promise.all(due.slice(i, i + BATCH).map(async (l) => {
      try { const r = await runVerification(l.id); return { id: l.id, verdict: r.verdict, error: r.verificationStatus === "Error" }; }
      catch { return { id: l.id, verdict: "Unknown", error: true }; }
    }));
    out.push(...done);
  }
  return out;
}

export const monthOf = (d: Date | null | undefined, fallback: Date) => {
  const x = d ?? fallback; return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, "0")}`;
};
export { CLUSTERS, gte };
