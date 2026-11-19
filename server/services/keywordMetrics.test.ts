import { describe, expect, it } from "vitest";
import { analyzeKeyword, median, rdsGap } from "./keywordMetrics.js";

const fake = (calls: string[]) => (async (u: any) => {
  const url = String(u); calls.push(url);
  const body = url.includes("keywords-explorer") ? { keywords: [{ keyword: "crm", volume: 5400, difficulty: 62 }] }
    : url.includes("serp-overview") ? { positions: [10, 20, 30, 40].map((n, i) => ({ position: i + 1, refdomains: n, type: ["organic"] })).concat([{ position: 0, refdomains: 9999, type: ["ai_overview"] } as any]) }
    : { metrics: { live_refdomains: 12 } };
  return new Response(JSON.stringify(body), { status: 200 });
}) as unknown as typeof fetch;

describe("keyword analysis", () => {
  it("median + gap", () => { expect(median([10, 20, 30, 40])).toBe(25); expect(median([])).toBeNull(); expect(rdsGap(25, 12)).toBe(13); expect(rdsGap(5, 12)).toBe(0); expect(rdsGap(null, 3)).toBe(0); });
  it("reads volume, difficulty and the RD gap (ignores non-organic results)", async () => {
    const calls: string[] = [];
    expect(await analyzeKeyword("https://x.com/p", "crm", "k", "US", fake(calls))).toEqual({ volume: 5400, difficulty: 62, currentRDs: 12, topRDs: 25, rdsNeeded: 13, topPages: 4 });
    expect(calls).toHaveLength(3);
  });
});
