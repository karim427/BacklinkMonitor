/** Pure Firecrawl client (no database), so it can be tested with a fake fetch. https://docs.firecrawl.dev */
export interface MappedUrl { url: string; title?: string }
export interface ScrapedPage { url: string; title: string; markdown: string; statusCode: number | null }

const BASE = "https://api.firecrawl.dev/v2";
const call = async (method: "GET" | "POST", path: string, key: string, body: unknown, fetchImpl: typeof fetch, ms: number) => {
  const r = await fetchImpl(`${BASE}${path}`, { method, headers: { Authorization: `Bearer ${key}`, ...(body ? { "content-type": "application/json" } : {}) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(ms) });
  if (r.status === 401 || r.status === 403) throw new Error("Firecrawl rejected the API key.");
  if (r.status === 402) throw new Error("Firecrawl says you are out of credits.");
  if (r.status === 429) throw new Error("Firecrawl is rate-limiting requests. Try again in a minute.");
  if (!r.ok) throw new Error(`Firecrawl error ${r.status}`);
  return r.json() as Promise<any>;
};

/** Lists the URLs on a site, ordered by how well they match `search` (e.g. "blog"). */
export async function mapSite(site: string, key: string, search = "blog", limit = 60, fetchImpl: typeof fetch = fetch): Promise<MappedUrl[]> {
  const j = await call("POST", "/map", key, { url: site.startsWith("http") ? site : `https://${site}`, search, limit, sitemap: "include" }, fetchImpl, 45_000);
  return (j.links ?? []).map((l: any) => (typeof l === "string" ? { url: l } : { url: l.url, title: l.title })).filter((l: MappedUrl) => l.url);
}

/** Reads one page as clean text (main content only), rendering JavaScript if the page needs it. */
export async function scrapePage(url: string, key: string, fetchImpl: typeof fetch = fetch): Promise<ScrapedPage> {
  const j = await call("POST", "/scrape", key, { url, formats: ["markdown"], onlyMainContent: true, timeout: 40_000 }, fetchImpl, 55_000);
  const d = j.data ?? {}; const t = d.metadata?.title;
  return { url, title: Array.isArray(t) ? String(t[0] ?? "") : String(t ?? ""), markdown: String(d.markdown ?? ""), statusCode: d.metadata?.statusCode ?? null };
}

/** Free-to-ask check that the key works, and how many credits are left. */
export async function creditUsage(key: string, fetchImpl: typeof fetch = fetch): Promise<{ remaining: number | null; plan: number | null; periodEnd: string | null }> {
  const j = await call("GET", "/team/credit-usage", key, null, fetchImpl, 15_000);
  return { remaining: j.data?.remainingCredits ?? null, plan: j.data?.planCredits ?? null, periodEnd: j.data?.billingPeriodEnd ?? null };
}
