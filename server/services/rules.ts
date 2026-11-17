import {
  BANNED_VERTICALS, CLUSTER_NICHES, NON_US_TLDS, SPAM_TLDS, RULE_BY_CODE, DEFAULT_ANCHOR_BANDS,
  type AnchorBands, type AnchorType, type Cluster, type Verdict,
} from "./constants.js";

const DAY = 86_400_000;

/* ---------- Counting toward target ---------- */
export interface CountableLink { verdict: Verdict; placedAt?: Date | string | null; createdAt: Date | string }
export const monthKey = (d: Date | string) => {
  const x = typeof d === "string" ? new Date(d) : d;
  return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, "0")}`;
};
/** A link belongs to the month it was placed (fallback: created). */
export const linkMonth = (l: CountableLink) => monthKey(l.placedAt ?? l.createdAt);

export function targetProgress(links: CountableLink[], month: string, target: number) {
  const inMonth = links.filter((l) => linkMonth(l) === month);
  const relevant = inMonth.filter((l) => l.verdict === "Relevant").length;
  const pending = inMonth.filter((l) => l.verdict === "Partly relevant").length;
  const rejected = inMonth.filter((l) => l.verdict === "Not relevant").length;
  return { received: inMonth.length, relevant, pending, rejected, remaining: Math.max(0, target - relevant), target };
}

/* ---------- Stage 1: target page approval ---------- */
export const STAGE1_LINKS_PER_MONTH = 4;
export const STAGE1_MAX_MONTHS = 6;
export function stage1(rdsNeeded: number, currentRDs = 0, linksPerMonth = STAGE1_LINKS_PER_MONTH) {
  const linksNeeded = Math.max(0, Math.ceil(rdsNeeded)); // rdsNeeded is the RD gap; one link per RD
  const monthsToClose = Math.ceil(linksNeeded / linksPerMonth);
  const approve = monthsToClose <= STAGE1_MAX_MONTHS;
  return {
    currentRDs, linksNeeded, monthsToClose, suggestion: approve ? ("Approved" as const) : ("Rejected" as const),
    reason: approve ? undefined : "Pick an easier keyword/page",
  };
}

/* ---------- Check A: donor registry ---------- */
export interface DonorMetrics {
  domain: string; dr: number; usTrafficPct: number; organicTraffic: number; referringDomains: number;
  linkedDomains: number; cluster: Cluster | string; isLocal: boolean;
  trafficHistory?: number[]; // oldest -> newest, monthly
  flags?: { disavowed?: boolean; pbn?: boolean; expired?: boolean; hacked?: boolean; nonEnglish?: boolean; thinAi?: boolean; writeForUs?: boolean };
  niche?: string;
  /** True when no metrics were ever loaded for this donor (all zeros, never synced). Metric-based rules are skipped instead of failing on placeholder zeros. */
  metricsMissing?: boolean;
}
export interface CheckAResult { passed: boolean; criteria: { key: string; label: string; pass: boolean; detail: string }[] }

export function minTraffic(isLocal: boolean) { return isLocal ? 300 : 1000; }

export function checkA(d: DonorMetrics, clientCluster: Cluster, opts: { reusedSameClient6mo?: boolean } = {}): CheckAResult {
  const nicheOk = d.cluster === clientCluster ||
    (!!d.niche && CLUSTER_NICHES[clientCluster].some((n) => d.niche!.toLowerCase().includes(n.toLowerCase())));
  const min = minTraffic(d.isLocal);
  const rdsHealthy = d.linkedDomains <= d.referringDomains * 2;
  const criteria = [
    { key: "us", label: "US traffic ≥ 60%", pass: d.usTrafficPct >= 60, detail: `${d.usTrafficPct}%` },
    { key: "dr", label: "DR ≥ 20", pass: d.dr >= 20, detail: `DR ${d.dr}` },
    { key: "niche", label: "Niche fits client cluster", pass: nicheOk, detail: String(d.cluster) },
    { key: "traffic", label: `Organic traffic ≥ ${min.toLocaleString("en-US")}${d.isLocal ? " (local)" : ""}`, pass: d.organicTraffic >= min, detail: d.organicTraffic.toLocaleString("en-US") },
    { key: "rds", label: "Healthy referring domains", pass: rdsHealthy, detail: `${d.referringDomains} RDs / ${d.linkedDomains} linked` },
    { key: "reuse", label: "No reuse for same client in 6 months", pass: !opts.reusedSameClient6mo, detail: opts.reusedSameClient6mo ? "reused" : "ok" },
  ];
  return { passed: criteria.every((c) => c.pass), criteria };
}

/* ---------- Reject rules ---------- */
export interface LinkFacts {
  // from verifier (undefined = unknown / not checked yet)
  linkFound?: boolean; rel?: string[]; placement?: string; outboundLinks?: number; targetMatched?: boolean;
  indexed?: boolean; competitorLinked?: boolean; temporary?: boolean;
  // contextual
  donor: DonorMetrics; clientCluster: Cluster; sourceUrl: string;
  clientId?: number;
  donorLinksToClients?: number;          // distinct clients this donor already links to (excluding this one)
  reusedSameClient6mo?: boolean;
  competingCashClientSamePageOrCity?: boolean;
}

const hostOf = (u: string) => { try { return new URL(u).hostname.toLowerCase(); } catch { return u.toLowerCase(); } };

export function evaluateRejectRules(f: LinkFacts): string[] {
  const hit: string[] = [];
  const host = hostOf(f.sourceUrl || f.donor.domain);
  const d = f.donor;
  const text = `${host} ${d.niche ?? ""}`.toLowerCase();
  const add = (cond: unknown, code: string) => { if (cond) hit.push(code); };

  add(SPAM_TLDS.some((t) => host.endsWith(t)), "domain_spam_tld");
  add(NON_US_TLDS.some((t) => host.endsWith(t)), "domain_non_us");
  add(d.metricsMissing, "donor_metrics_missing");
  add(!d.metricsMissing && d.usTrafficPct < 60, "domain_low_us_traffic");
  add(d.flags?.nonEnglish, "domain_non_english");
  add(d.flags?.disavowed, "domain_disavowed");

  add(BANNED_VERTICALS.some((v) => text.includes(v)), "niche_vertical");
  const clusterFit = d.cluster === f.clientCluster ||
    (!!d.niche && CLUSTER_NICHES[f.clientCluster].some((n) => d.niche!.toLowerCase().includes(n.toLowerCase())));
  add(!clusterFit, "niche_cluster_mismatch");
  add(d.flags?.writeForUs, "niche_write_for_us");

  add(!d.metricsMissing && d.dr >= 40 && d.organicTraffic < 500, "quality_dr_traffic");
  const h = d.trafficHistory;
  if (!d.metricsMissing && h && h.length >= 2) {
    const peak = Math.max(...h.slice(0, -1)); const now = h[h.length - 1];
    add(peak > 0 && (peak - now) / peak > 0.5, "quality_traffic_drop");
  }
  add(!d.metricsMissing && d.referringDomains > 0 && d.linkedDomains > d.referringDomains * 2, "quality_linked_vs_rd");
  add(d.flags?.expired, "quality_expired");
  add(d.flags?.pbn, "quality_pbn");
  add(f.indexed === false, "quality_not_indexed");
  add(d.flags?.hacked, "quality_hacked");
  add(d.flags?.thinAi, "quality_thin_ai");

  add((f.rel ?? []).some((r) => ["nofollow", "sponsored", "ugc"].includes(r.toLowerCase())), "link_nofollow_paid");
  add(["Footer", "Sidebar", "Author bio"].includes(f.placement ?? ""), "link_footer_sidebar_bio");
  add((f.outboundLinks ?? 0) >= 50, "link_50_outbound");
  add(f.competitorLinked, "link_competitor");
  add(f.competingCashClientSamePageOrCity, "link_competing_cash_clients");
  add(f.linkFound === true && f.targetMatched === false, "link_wrong_target");
  add(f.temporary, "link_temporary");

  add(f.reusedSameClient6mo, "reuse_same_client_6mo");
  add((f.donorLinksToClients ?? 0) > 3, "reuse_more_than_3_clients");
  return hit;
}

/* ---------- Verdict ---------- */
export function verdictFor(rejects: string[], opts: { fixWindowEndsAt?: Date | null; now?: Date } = {}): { verdict: Verdict; fixable: string[]; hard: string[] } {
  const fixable = rejects.filter((c) => RULE_BY_CODE[c]?.fixable);
  const hard = rejects.filter((c) => !RULE_BY_CODE[c]?.fixable);
  if (hard.length) return { verdict: "Not relevant", fixable, hard };
  if (fixable.length) {
    const now = opts.now ?? new Date();
    if (opts.fixWindowEndsAt && opts.fixWindowEndsAt.getTime() < now.getTime()) return { verdict: "Not relevant", fixable, hard };
    return { verdict: "Partly relevant", fixable, hard };
  }
  return { verdict: "Relevant", fixable, hard };
}

/* ---------- Recheck scheduling ---------- */
export interface RecheckSettings { firstRecheckDays: number; nextRecheckDays: number; fixWindowDays: number }
export const DEFAULT_RECHECK: RecheckSettings = { firstRecheckDays: 30, nextRecheckDays: 90, fixWindowDays: 14 };

export function scheduleFirstCheck(placedAt: Date, s: RecheckSettings = DEFAULT_RECHECK) {
  return { nextCheckAt: new Date(placedAt.getTime() + s.firstRecheckDays * DAY), nextCheckKind: "30-day" as const };
}
export function scheduleNextCheck(from: Date, s: RecheckSettings = DEFAULT_RECHECK) {
  return { nextCheckAt: new Date(from.getTime() + s.nextRecheckDays * DAY), nextCheckKind: "90-day" as const };
}
export function fixWindowEnd(from: Date, s: RecheckSettings = DEFAULT_RECHECK) {
  return new Date(from.getTime() + s.fixWindowDays * DAY);
}
export function dueLabel(nextCheckAt: Date | null | undefined, now = new Date()) {
  if (!nextCheckAt) return { label: "Not scheduled", overdue: false, days: null as number | null };
  const days = Math.ceil((nextCheckAt.getTime() - now.getTime()) / DAY);
  if (days < 0) return { label: `${-days}d overdue`, overdue: true, days };
  if (days === 0) return { label: "due today", overdue: false, days };
  return { label: `in ${days}d`, overdue: false, days };
}

/** Outcome of a recheck run on a link. */
export function applyRecheck(
  prev: { stage: string; nextCheckKind?: string | null },
  r: { linkFound: boolean; rejects: string[] },
  now: Date, s: RecheckSettings = DEFAULT_RECHECK,
) {
  if (!r.linkFound) return { stage: "Lost" as const, verdict: "Not relevant" as Verdict, action: "LOST" as const, nextCheckAt: null, nextCheckKind: null, fixWindowEndsAt: null };
  const v = verdictFor(r.rejects);
  const stage = v.verdict === "Relevant" && prev.nextCheckKind === "30-day" ? "Confirmed" : prev.stage;
  const next = scheduleNextCheck(now, s);
  return {
    stage, verdict: v.verdict,
    action: (v.verdict === "Relevant" ? "LIVE" : "REPLACE") as "LIVE" | "REPLACE",
    ...next,
    fixWindowEndsAt: v.verdict === "Partly relevant" ? fixWindowEnd(now, s) : null,
  };
}

/* ---------- Anchor mix ---------- */
export function anchorMix(links: { anchorType: AnchorType | string }[], bands: AnchorBands = DEFAULT_ANCHOR_BANDS) {
  const total = links.length;
  const count = { Branded: 0, Partial: 0, Natural: 0, Exact: 0 } as Record<keyof AnchorBands, number>;
  for (const l of links) if (l.anchorType in count) count[l.anchorType as keyof AnchorBands]++;
  const rows = (Object.keys(bands) as (keyof AnchorBands)[]).map((k) => {
    const pct = total ? Math.round((count[k] / total) * 1000) / 10 : 0;
    return { type: k, count: count[k], pct, band: bands[k], inBand: total > 0 && pct >= bands[k].min && pct <= bands[k].max };
  });
  return { total, rows, inBand: total > 0 && rows.every((r) => r.inBand) };
}
export function validateBands(b: AnchorBands): string | null {
  for (const [k, v] of Object.entries(b)) {
    if (!(v.min >= 0 && v.max <= 100)) return `${k}: values must be between 0 and 100`;
    if (v.min > v.max) return `${k}: min must be ≤ max`;
  }
  return null;
}

/* ---------- Citation NAP ---------- */
const ABBR: Record<string, string> = {
  street: "st", st: "st", avenue: "ave", ave: "ave", road: "rd", rd: "rd", boulevard: "blvd", blvd: "blvd",
  drive: "dr", dr: "dr", suite: "ste", ste: "ste", lane: "ln", ln: "ln", north: "n", south: "s", east: "e", west: "w",
  court: "ct", ct: "ct", highway: "hwy", hwy: "hwy", place: "pl", pl: "pl",
};
export function normText(s: string) {
  return s.toLowerCase().replace(/[.,#'’"\-]/g, " ").replace(/&/g, " and ").split(/\s+/).filter(Boolean)
    .map((w) => ABBR[w] ?? w).join(" ");
}
export const normPhone = (p: string) => { const d = p.replace(/\D/g, ""); return d.length === 11 && d.startsWith("1") ? d.slice(1) : d; };
export function napMatch(c: { name: string; address: string; phone: string }, gbp: { name: string; address: string; phone: string }) {
  const fields = {
    name: normText(c.name) === normText(gbp.name),
    address: normText(c.address) === normText(gbp.address),
    phone: normPhone(c.phone) === normPhone(gbp.phone) && normPhone(c.phone) !== "",
  };
  return { fields, match: fields.name && fields.address && fields.phone ? ("Matched" as const) : ("Mismatch" as const) };
}
