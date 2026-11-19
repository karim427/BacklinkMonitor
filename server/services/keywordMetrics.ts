/** Ahrefs lookups for a target page: keyword volume + difficulty, how many sites the top results have, and how many link to this page. No database, so it can be tested with a fake fetch. */
export interface KeywordAnalysis { volume: number | null; difficulty: number | null; currentRDs: number; topRDs: number | null; rdsNeeded: number; topPages: number }

const api = async (path: string, params: Record<string, string>, key: string, f: typeof fetch) => {
  const r = await f(`https://api.ahrefs.com/v3/${path}?${new URLSearchParams(params)}`, { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" }, signal: AbortSignal.timeout(25_000) });
  if (r.status === 401 || r.status === 403) throw new Error("Ahrefs rejected the API key (or your plan doesn't include this data).");
  if (r.status === 429) throw new Error("Ahrefs says you are out of API units or requests (HTTP 429).");
  if (!r.ok) throw new Error(`Ahrefs error ${r.status}`);
  return r.json() as Promise<any>;
};

export const median = (xs: number[]) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); const m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2); };
/** Sites the page still needs: what a typical top-10 result has, minus what it already has (never below 0). */
export const rdsGap = (topRDs: number | null, current: number) => (topRDs == null ? 0 : Math.max(0, topRDs - current));

export async function analyzeKeyword(url: string, keyword: string, key: string, country = "us", f: typeof fetch = fetch): Promise<KeywordAnalysis> {
  const today = new Date().toISOString().slice(0, 10);
  const cc = country.toLowerCase();
  // One call at a time on purpose (the same rule as the database: no piles of parallel requests).
  const kw = await api("keywords-explorer/overview", { keywords: keyword, country: cc, select: "keyword,volume,difficulty" }, key, f);
  const serp = await api("serp-overview/serp-overview", { keyword, country: cc, top_positions: "10", select: "position,refdomains,type" }, key, f);
  const own = await api("site-explorer/backlinks-stats", { target: url, mode: "exact", date: today }, key, f);
  const top = ((serp.positions ?? []) as any[]).filter((p) => (p.type ?? ["organic"]).includes("organic") && typeof p.refdomains === "number").map((p) => p.refdomains as number);
  const row = (kw.keywords ?? [])[0] ?? {};
  const currentRDs = own.metrics?.live_refdomains ?? 0;
  const topRDs = median(top);
  return { volume: row.volume ?? null, difficulty: row.difficulty ?? null, currentRDs, topRDs, rdsNeeded: rdsGap(topRDs, currentRDs), topPages: top.length };
}
