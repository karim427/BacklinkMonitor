/** Pure Ahrefs client for the competitor gap (no database), so it can be tested with a fake fetch. */
export interface RefDomain { domain: string; dr: number | null; links: number; firstSeen: string | null; spam: boolean }
export interface Competitor { domain: string; dr: number | null; commonKeywords: number; share: number | null }

const clean = (d: string) => d.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "");
const fail = (r: Response) => {
  if (r.status === 401 || r.status === 403) throw new Error("Ahrefs rejected the API key (or your plan doesn't include this data).");
  if (r.status === 429) throw new Error("Ahrefs says you are out of API units or requests (HTTP 429).");
  throw new Error(`Ahrefs error ${r.status}`);
};
const get = (path: string, params: Record<string, string>, key: string, fetchImpl: typeof fetch) =>
  fetchImpl(`https://api.ahrefs.com/v3/site-explorer/${path}?${new URLSearchParams(params)}`, { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" }, signal: AbortSignal.timeout(25_000) });

/** Sites that currently link to `target`, strongest first. At least 50 Ahrefs units per request, so the row count is capped. */
export async function fetchRefDomains(target: string, key: string, fetchImpl: typeof fetch = fetch, limit = 300): Promise<RefDomain[]> {
  const r = await get("refdomains", { target: clean(target), mode: "subdomains", history: "live", select: "domain,domain_rating,links_to_target,first_seen,is_spam", order_by: "domain_rating:desc", limit: String(limit) }, key, fetchImpl);
  if (!r.ok) fail(r);
  const j = (await r.json()) as { refdomains?: any[] };
  return (j.refdomains ?? []).filter((x) => x.domain).map((x) => ({ domain: clean(x.domain), dr: x.domain_rating ?? null, links: x.links_to_target ?? 0, firstSeen: x.first_seen ?? null, spam: !!x.is_spam }));
}

/** Sites that rank for the same searches as `target` (its organic competitors). */
export async function fetchOrganicCompetitors(target: string, key: string, fetchImpl: typeof fetch = fetch, country = "us", limit = 10): Promise<Competitor[]> {
  const r = await get("organic-competitors", { target: clean(target), country, date: new Date().toISOString().slice(0, 10), mode: "subdomains", select: "competitor_domain,domain_rating,keywords_common,share", order_by: "keywords_common:desc", limit: String(limit) }, key, fetchImpl);
  if (!r.ok) fail(r);
  const j = (await r.json()) as { competitors?: any[] };
  return (j.competitors ?? []).filter((x) => x.competitor_domain).map((x) => ({ domain: clean(x.competitor_domain), dr: x.domain_rating ?? null, commonKeywords: x.keywords_common ?? 0, share: x.share ?? null }));
}
export const cleanDomain = clean;
