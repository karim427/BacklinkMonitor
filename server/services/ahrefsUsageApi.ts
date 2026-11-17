/** Pure client for Ahrefs' "limits and usage" endpoint. It is free: it does not spend any API units. */
export interface AhrefsUsage { subscription: string | null; resetDate: string | null; keyExpires: string | null; used: number | null; limit: number | null; remaining: number | null; percent: number | null; scope: "workspace" | "key" }

export async function fetchUsage(key: string, fetchImpl: typeof fetch = fetch): Promise<AhrefsUsage> {
  const r = await fetchImpl("https://api.ahrefs.com/v3/subscription-info/limits-and-usage", { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
  if (r.status === 401 || r.status === 403) throw new Error("Ahrefs rejected the API key.");
  if (!r.ok) throw new Error(`Ahrefs error ${r.status}`);
  const j = ((await r.json()) as { limits_and_usage?: Record<string, any> }).limits_and_usage ?? {};
  // Both a workspace limit and a per-key limit can exist; the smaller room is the real one.
  const rooms = ([["workspace", j.units_limit_workspace, j.units_usage_workspace], ["key", j.units_limit_api_key, j.units_usage_api_key]] as const)
    .filter(([, lim]) => typeof lim === "number").map(([scope, lim, used]) => ({ scope, limit: lim as number, used: Number(used ?? 0) }))
    .sort((a, b) => (a.limit - a.used) - (b.limit - b.used));
  const pick = rooms[0];
  return {
    subscription: j.subscription ?? null, resetDate: j.usage_reset_date ?? null, keyExpires: j.api_key_expiration_date ?? null,
    used: pick ? pick.used : (j.units_usage_workspace ?? j.units_usage_api_key ?? null), limit: pick?.limit ?? null,
    remaining: pick ? Math.max(0, pick.limit - pick.used) : null, percent: pick && pick.limit > 0 ? Math.min(100, Math.round((pick.used / pick.limit) * 100)) : null, scope: pick?.scope ?? "workspace",
  };
}

/** Rough cost shown before an action runs. Ahrefs charges at least 50 units per request, and more for big answers. */
export const MIN_UNITS_PER_REQUEST = 50;
export const estimateUnits = (requests: number) => requests * MIN_UNITS_PER_REQUEST;
