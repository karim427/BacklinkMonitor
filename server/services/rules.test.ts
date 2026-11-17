import { describe, expect, it } from "vitest";
import {
  anchorMix, applyRecheck, checkA, dueLabel, evaluateRejectRules, napMatch, scheduleFirstCheck, scheduleNextCheck,
  stage1, targetProgress, validateBands, verdictFor, type DonorMetrics, type LinkFacts,
} from "./rules.js";
import { REJECT_RULES, DEFAULT_ANCHOR_BANDS } from "./constants.js";

const donor: DonorMetrics = { domain: "goodblog.com", dr: 45, usTrafficPct: 80, organicTraffic: 5000, referringDomains: 300, linkedDomains: 200, cluster: "Tech / SaaS", isLocal: false };
const base = (o: Partial<LinkFacts> = {}, d: Partial<DonorMetrics> = {}): LinkFacts => ({
  donor: { ...donor, ...d }, clientCluster: "Tech / SaaS", sourceUrl: "https://goodblog.com/post", linkFound: true, targetMatched: true, indexed: true, rel: [], placement: "Body", outboundLinks: 10, ...o,
});

describe("donor with no metrics loaded", () => {
  const zero = { ...donor, dr: 0, usTrafficPct: 0, organicTraffic: 0, referringDomains: 0, linkedDomains: 0, metricsMissing: true };
  it("is flagged as a data gap, not rejected for 0% US traffic", () => {
    const r = evaluateRejectRules({ ...base(), donor: zero });
    expect(r).toEqual(["donor_metrics_missing"]);
    expect(verdictFor(r).verdict).toBe("Not judged");
  });
  it("still fails on real low US traffic once metrics exist", () => {
    expect(evaluateRejectRules({ ...base(), donor: { ...zero, metricsMissing: false, organicTraffic: 5000, dr: 30, usTrafficPct: 20 } })).toContain("domain_low_us_traffic");
  });
});

describe("verdict when the donor has no numbers", () => {
  it("is Not judged, not Partly relevant or Not relevant", () => expect(verdictFor(["donor_metrics_missing"]).verdict).toBe("Not judged"));
  it("a hard reject that doesn't need metrics still wins", () => expect(verdictFor(["domain_spam_tld", "donor_metrics_missing"]).verdict).toBe("Not relevant"));
  it("counts as pending toward the target, not as received-relevant", () => {
    const p = targetProgress([{ verdict: "Not judged", createdAt: new Date("2026-11-05") }, { verdict: "Relevant", createdAt: new Date("2026-11-06") }], "2026-11", 4);
    expect(p).toMatchObject({ relevant: 1, pending: 1, remaining: 3 });
  });
});

describe("reject list", () => {
  it("has 26 rules", () => expect(REJECT_RULES).toHaveLength(26));
  it("clean link has no rejects", () => expect(evaluateRejectRules(base())).toEqual([]));
  const cases: [string, Partial<LinkFacts>, Partial<DonorMetrics>?][] = [
    ["domain_spam_tld", { sourceUrl: "https://x.xyz/p" }],
    ["domain_non_us", { sourceUrl: "https://x.co.uk/p" }],
    ["domain_low_us_traffic", {}, { usTrafficPct: 59 }],
    ["domain_non_english", {}, { flags: { nonEnglish: true } }],
    ["domain_disavowed", {}, { flags: { disavowed: true } }],
    ["niche_vertical", { sourceUrl: "https://bestcasino.com/p" }],
    ["niche_cluster_mismatch", {}, { cluster: "Auto logistics" }],
    ["niche_write_for_us", {}, { flags: { writeForUs: true } }],
    ["quality_dr_traffic", {}, { dr: 40, organicTraffic: 499 }],
    ["quality_traffic_drop", {}, { trafficHistory: [10000, 9000, 4000] }],
    ["quality_linked_vs_rd", {}, { linkedDomains: 601 }],
    ["quality_expired", {}, { flags: { expired: true } }],
    ["quality_pbn", {}, { flags: { pbn: true } }],
    ["quality_not_indexed", { indexed: false }],
    ["quality_hacked", {}, { flags: { hacked: true } }],
    ["quality_thin_ai", {}, { flags: { thinAi: true } }],
    ["link_nofollow_paid", { rel: ["nofollow"] }],
    ["link_footer_sidebar_bio", { placement: "Footer" }],
    ["link_50_outbound", { outboundLinks: 50 }],
    ["link_competitor", { competitorLinked: true }],
    ["link_competing_cash_clients", { competingCashClientSamePageOrCity: true }],
    ["link_wrong_target", { targetMatched: false }],
    ["link_temporary", { temporary: true }],
    ["reuse_same_client_6mo", { reusedSameClient6mo: true }],
    ["reuse_more_than_3_clients", { donorLinksToClients: 4 }],
  ];
  for (const [code, o, d] of cases) it(`flags ${code}`, () => expect(evaluateRejectRules(base(o, d))).toContain(code));
  it("3 clients is allowed", () => expect(evaluateRejectRules(base({ donorLinksToClients: 3 }))).not.toContain("reuse_more_than_3_clients"));
});

describe("verdict", () => {
  it("no rejects → Relevant", () => expect(verdictFor([]).verdict).toBe("Relevant"));
  it("hard reject → Not relevant", () => expect(verdictFor(["domain_spam_tld"]).verdict).toBe("Not relevant"));
  it("fixable → Partly relevant", () => expect(verdictFor(["link_nofollow_paid"]).verdict).toBe("Partly relevant"));
  it("fixable past window → Not relevant", () =>
    expect(verdictFor(["link_wrong_target"], { fixWindowEndsAt: new Date(Date.now() - 1000) }).verdict).toBe("Not relevant"));
});

describe("target counting", () => {
  const mk = (verdict: any, placedAt: string) => ({ verdict, placedAt, createdAt: placedAt });
  it("only Relevant counts", () => {
    const p = targetProgress([mk("Relevant", "2026-11-02"), mk("Partly relevant", "2026-11-03"), mk("Not relevant", "2026-11-04"), mk("Relevant", "2026-10-30")], "2026-11", 3);
    expect(p).toMatchObject({ received: 3, relevant: 1, pending: 1, rejected: 1, remaining: 2 });
  });
  it("remaining never negative", () => expect(targetProgress([mk("Relevant", "2026-11-01")], "2026-11", 0).remaining).toBe(0));
});

describe("stage 1", () => {
  it("24 links = 6 months → approve", () => expect(stage1(24)).toMatchObject({ monthsToClose: 6, suggestion: "Approved" }));
  it("25 links = 7 months → reject", () => expect(stage1(25)).toMatchObject({ monthsToClose: 7, suggestion: "Rejected", reason: "Pick an easier keyword/page" }));
});

describe("check A", () => {
  it("passes a healthy donor", () => expect(checkA(donor, "Tech / SaaS").passed).toBe(true));
  it("local donors need only 300 traffic", () => {
    expect(checkA({ ...donor, organicTraffic: 400 }, "Tech / SaaS").passed).toBe(false);
    expect(checkA({ ...donor, organicTraffic: 400, isLocal: true }, "Tech / SaaS").passed).toBe(true);
  });
  it("fails on DR, US %, reuse", () => {
    expect(checkA({ ...donor, dr: 19 }, "Tech / SaaS").passed).toBe(false);
    expect(checkA({ ...donor, usTrafficPct: 59 }, "Tech / SaaS").passed).toBe(false);
    expect(checkA(donor, "Tech / SaaS", { reusedSameClient6mo: true }).passed).toBe(false);
  });
});

describe("rechecks", () => {
  const placed = new Date("2026-10-01T00:00:00Z");
  it("first at 30d, then 90d", () => {
    expect(scheduleFirstCheck(placed).nextCheckAt.toISOString()).toBe("2026-10-31T00:00:00.000Z");
    expect(scheduleNextCheck(placed).nextCheckAt.toISOString()).toBe("2026-12-30T00:00:00.000Z");
  });
  it("labels", () => {
    const now = new Date("2026-11-10T00:00:00Z");
    expect(dueLabel(new Date("2026-11-05T00:00:00Z"), now).label).toBe("5d overdue");
    expect(dueLabel(new Date("2026-11-30T00:00:00Z"), now).label).toBe("in 20d");
  });
  it("confirmed when live at 30-day check", () =>
    expect(applyRecheck({ stage: "Placed", nextCheckKind: "30-day" }, { linkFound: true, rejects: [] }, placed).stage).toBe("Confirmed"));
  it("regression → partly relevant + fix window", () => {
    const r = applyRecheck({ stage: "Confirmed", nextCheckKind: "90-day" }, { linkFound: true, rejects: ["link_nofollow_paid"] }, placed);
    expect(r.verdict).toBe("Partly relevant");
    expect(r.fixWindowEndsAt?.toISOString()).toBe("2026-10-15T00:00:00.000Z");
  });
  it("gone → Lost", () => expect(applyRecheck({ stage: "Confirmed" }, { linkFound: false, rejects: [] }, placed).stage).toBe("Lost"));
});

describe("anchor mix", () => {
  const mk = (t: string, n: number) => Array.from({ length: n }, () => ({ anchorType: t }));
  it("in band at 45/25/20/10", () => {
    const m = anchorMix([...mk("Branded", 9), ...mk("Partial", 5), ...mk("Natural", 4), ...mk("Exact", 2)], DEFAULT_ANCHOR_BANDS);
    expect(m.inBand).toBe(true);
  });
  it("out of band when exact is high", () => expect(anchorMix([...mk("Branded", 1), ...mk("Exact", 1)]).inBand).toBe(false));
  it("validates bands", () => {
    expect(validateBands({ ...DEFAULT_ANCHOR_BANDS, Exact: { min: 10, max: 5 } })).toMatch(/min/);
    expect(validateBands({ ...DEFAULT_ANCHOR_BANDS, Exact: { min: 0, max: 120 } })).toMatch(/0 and 100/);
    expect(validateBands(DEFAULT_ANCHOR_BANDS)).toBeNull();
  });
});

describe("NAP", () => {
  const gbp = { name: "Acme Homes LLC", address: "12 Main Street, Suite 4", phone: "(555) 010-2030" };
  it("normalises case/punctuation/abbreviations/phone", () =>
    expect(napMatch({ name: "ACME HOMES, LLC", address: "12 main st., ste 4", phone: "+1 555-010-2030" }, gbp).match).toBe("Matched"));
  it("flags mismatching field", () => {
    const r = napMatch({ ...gbp, phone: "555-999-0000" }, gbp);
    expect(r.match).toBe("Mismatch"); expect(r.fields.phone).toBe(false); expect(r.fields.name).toBe(true);
  });
});
