import { describe, expect, it } from "vitest";
import { bestCluster, parseVerdict, pickPosts } from "./blogCrawl.js";
import { creditUsage, mapSite, scrapePage } from "./firecrawlApi.js";

const resp = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });

describe("choosing which blog pages to read", () => {
  const urls = ["https://blog.example.com/", "https://example.com/blog/how-to-sell-an-inherited-house-fast", "https://example.com/blog/category/news", "https://example.com/tag/probate",
    "https://example.com/2026/05/probate-sales-explained-simply", "https://example.com/contact", "https://other.com/blog/not-ours-at-all-here", "https://example.com/wp-admin/x", "https://example.com/logo.png", "https://example.com/blog/page/3"];
  const picked = pickPosts(urls, "https://www.example.com/", 3);
  it("starts with the home page, then real posts", () => { expect(picked[0]).toBe("https://example.com/"); expect(picked).toContain("https://example.com/blog/how-to-sell-an-inherited-house-fast"); expect(picked).toContain("https://example.com/2026/05/probate-sales-explained-simply"); });
  it("skips tags, categories, paging, contact, admin, images and other sites", () => { for (const bad of ["tag/probate", "category/news", "contact", "wp-admin", "logo.png", "page/3", "other.com"]) expect(picked.join(" ")).not.toContain(bad); });
  it("never returns more than asked for (plus the home page)", () => expect(pickPosts(urls, "example.com", 1).length).toBeLessThanOrEqual(2));
});

describe("reading the AI's verdict", () => {
  it("fills every cluster and clamps numbers", () => {
    const v = parseVerdict({ niche: "real estate investing", topics: ["probate", "flipping"], scores: { "Cash home buyers": 140, "Tech / SaaS": -5 }, thinOrAi: 1, reason: "On topic" })!;
    expect(v.scores["Cash home buyers"]).toBe(100); expect(v.scores["Tech / SaaS"]).toBe(0); expect(Object.keys(v.scores)).toHaveLength(4);
    expect(v).toMatchObject({ niche: "real estate investing", thinOrAi: true, writeForUs: false, spammy: false });
    expect(bestCluster(v)[0]).toBe("Cash home buyers");
  });
  it("returns null for rubbish", () => { expect(parseVerdict(null)).toBeNull(); expect(parseVerdict("x")).toBeNull(); });
});

describe("Firecrawl requests", () => {
  it("maps a site and sends the key and the search", async () => {
    let body: any = null; let auth = ""; let url = "";
    const f = (async (u: string, init: any) => { url = u; auth = init.headers.Authorization; body = JSON.parse(init.body); return resp(200, { success: true, links: [{ url: "https://a.com/blog/x", title: "X" }, "https://a.com/y"] }); }) as any;
    expect(await mapSite("a.com", "k", "blog", 20, f)).toEqual([{ url: "https://a.com/blog/x", title: "X" }, { url: "https://a.com/y" }]);
    expect(auth).toBe("Bearer k"); expect(url).toBe("https://api.firecrawl.dev/v2/map"); expect(body).toMatchObject({ url: "https://a.com", search: "blog", limit: 20 });
  });
  it("scrapes a page to text", async () => {
    const f = (async () => resp(200, { success: true, data: { markdown: "# Hello", metadata: { title: ["Hi there"], statusCode: 200 } } })) as any;
    expect(await scrapePage("https://a.com/p", "k", f)).toEqual({ url: "https://a.com/p", title: "Hi there", markdown: "# Hello", statusCode: 200 });
  });
  it("reads credits and explains problems", async () => {
    expect(await creditUsage("k", (async () => resp(200, { success: true, data: { remainingCredits: 420, planCredits: 500, billingPeriodEnd: "2026-12-01" } })) as any)).toEqual({ remaining: 420, plan: 500, periodEnd: "2026-12-01" });
    await expect(scrapePage("u", "k", (async () => resp(401, {})) as any)).rejects.toThrow(/rejected the API key/);
    await expect(scrapePage("u", "k", (async () => resp(402, {})) as any)).rejects.toThrow(/out of credits/);
    await expect(mapSite("a.com", "k", "blog", 5, (async () => resp(429, {})) as any)).rejects.toThrow(/rate-limiting/);
  });
});
