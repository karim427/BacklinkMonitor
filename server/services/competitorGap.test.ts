import { describe, expect, it } from "vitest";
import { computeGap, gapScore } from "./competitorGap.js";
import { fetchOrganicCompetitors, fetchRefDomains, type RefDomain } from "./ahrefsGapApi.js";

const rd = (domain: string, dr: number | null, extra: Partial<RefDomain> = {}): RefDomain => ({ domain, dr, links: 1, firstSeen: null, spam: false, ...extra });
const resp = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

describe("competitor gap", () => {
  const ours = [rd("ours-already.com", 60)];
  const a = { domain: "rival-a.com", refs: [rd("ours-already.com", 60), rd("blog.com", 55), rd("news.com", 70), rd("spam.com", 80, { spam: true }), rd("tiny.com", 10), rd("rival-b.com", 50)] };
  const b = { domain: "rival-b.com", refs: [rd("blog.com", 55), rd("only-b.com", 40)] };
  const rows = computeGap(ours, [a, b]);
  it("keeps sites that link to competitors but not to you", () => expect(rows.map((r) => r.domain)).toEqual(["blog.com", "news.com", "only-b.com"]));
  it("ranks by how many competitors link, then by DR", () => { expect(rows[0]).toMatchObject({ domain: "blog.com", competitorCount: 2, competitors: ["rival-a.com", "rival-b.com"] }); expect(rows[1].domain).toBe("news.com"); });
  it("drops sites you already have, spam, weak sites and the competitors themselves", () => {
    const d = rows.map((r) => r.domain); ["ours-already.com", "spam.com", "tiny.com", "rival-b.com"].forEach((x) => expect(d).not.toContain(x));
  });
  it("scores more competitors higher", () => expect(gapScore(rows[0])).toBeGreaterThan(gapScore(rows[2])));
});

describe("Ahrefs gap requests", () => {
  it("maps referring domains and sends the right query", async () => {
    let url = "";
    const f = (async (u: string) => { url = u; return resp(200, { refdomains: [{ domain: "WWW.Blog.com", domain_rating: 55, links_to_target: 3, first_seen: "2025-01-01", is_spam: false }] }); }) as any;
    const r = await fetchRefDomains("https://www.Rival.com/page", "k", f);
    expect(r).toEqual([{ domain: "blog.com", dr: 55, links: 3, firstSeen: "2025-01-01", spam: false }]);
    expect(url).toContain("target=rival.com"); expect(url).toContain("history=live"); expect(url).toContain("limit=300");
  });
  it("maps organic competitors", async () => {
    const f = (async () => resp(200, { competitors: [{ competitor_domain: "rival.com", domain_rating: 60, keywords_common: 120, share: 0.3 }] })) as any;
    expect(await fetchOrganicCompetitors("client.com", "k", f)).toEqual([{ domain: "rival.com", dr: 60, commonKeywords: 120, share: 0.3 }]);
  });
  it("explains key and quota problems", async () => {
    await expect(fetchRefDomains("c.com", "k", (async () => resp(401, {})) as any)).rejects.toThrow(/rejected the API key/);
    await expect(fetchRefDomains("c.com", "k", (async () => resp(429, {})) as any)).rejects.toThrow(/out of API units/);
  });
});
