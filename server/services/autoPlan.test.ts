import { describe, expect, it } from "vitest";
import { score, shortlist } from "./autoPlan.js";
import { pickAssignee } from "./targetMeta.js";
import { keywordOverview } from "./keywordMetrics.js";

const c = (keyword: string, volume: number | null, difficulty: number | null) => ({ url: `https://x.com/${keyword}`, keyword, kind: "page" as const, why: "", volume, difficulty });

describe("auto page picking", () => {
  it("prefers easy keywords with real demand", () => {
    const out = shortlist([c("hard", 9000, 70), c("easy", 400, 10), c("mid", 800, 35), c("tiny", 10, 5), c("unknown", null, null)], 5);
    expect(out.map((x) => x.keyword)).toEqual(["easy", "mid"]); // hard (KD 70), tiny (volume 10) and unknown are out
    expect(score(c("a", 400, 10))).toBeGreaterThan(score(c("b", 800, 35)));
  });
  it("respects the limit", () => expect(shortlist([c("a", 100, 10), c("b", 200, 10), c("c", 300, 10)], 2)).toHaveLength(2));
  it("gives work to the least busy regular user, admins only as a fallback", () => {
    const team = [{ id: 1, role: "admin" }, { id: 2, role: "user" }, { id: 3, role: "user" }];
    expect(pickAssignee(team, new Map([[2, 3], [3, 1]]))).toBe(3);
    expect(pickAssignee(team, new Map())).toBe(2);
    expect(pickAssignee([{ id: 1, role: "admin" }], new Map())).toBe(1);
    expect(pickAssignee([], new Map())).toBeNull();
  });
  it("asks Ahrefs for all keywords in one call", async () => {
    const calls: string[] = [];
    const f = (async (u: any) => { calls.push(String(u)); return new Response(JSON.stringify({ keywords: [{ keyword: "a b", volume: 100, difficulty: 7 }, { keyword: "c", volume: 5, difficulty: null }] }), { status: 200 }); }) as unknown as typeof fetch;
    const m = await keywordOverview(["A, b", "c", "c"], "k", "US", f);
    expect(calls).toHaveLength(1); expect(m.get("a b")).toEqual({ volume: 100, difficulty: 7 }); expect(m.get("c")?.difficulty).toBeNull();
  });
});
