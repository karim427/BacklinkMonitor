import { describe, expect, it } from "vitest";
import { estimateUnits, fetchUsage } from "./ahrefsUsageApi.js";

const resp = (status: number, body: unknown) => new Response(JSON.stringify(body), { status });
describe("Ahrefs usage", () => {
  it("reads the units left, using the tighter of the workspace and key limits", async () => {
    const f = (async () => resp(200, { limits_and_usage: { subscription: "Standard", usage_reset_date: "2026-12-01", units_limit_workspace: 1000000, units_usage_workspace: 100, units_limit_api_key: 5000, units_usage_api_key: 4200 } })) as any;
    expect(await fetchUsage("k", f)).toMatchObject({ subscription: "Standard", resetDate: "2026-12-01", used: 4200, limit: 5000, remaining: 800, percent: 84, scope: "key" });
  });
  it("copes with no per-key limit", async () => {
    const f = (async () => resp(200, { limits_and_usage: { units_limit_workspace: 2000, units_usage_workspace: 500, units_limit_api_key: null, units_usage_api_key: 0 } })) as any;
    expect(await fetchUsage("k", f)).toMatchObject({ remaining: 1500, percent: 25, scope: "workspace" });
  });
  it("says so when the key is rejected", async () => { await expect(fetchUsage("k", (async () => resp(401, {})) as any)).rejects.toThrow(/rejected/); });
  it("estimates at least 50 units per request", () => expect(estimateUnits(4)).toBe(200));
});
