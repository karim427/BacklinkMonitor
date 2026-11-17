/** Pure Ahrefs client for lost backlinks (no database), so it can be unit-tested with a fake fetch. */
export interface LostBacklink { urlFrom: string; urlTo: string; anchor: string; firstSeen: string | null; lostAt: string | null; reason: string | null; dr: number | null; dofollow: boolean | null }

const REASONS: Record<string, string> = {
  removedfromhtml: "The link was removed from the page", notfound: "The page no longer exists (404)", pageerror: "The page returns an error",
  pageredirected: "The page now redirects elsewhere", lostredirect: "A redirect to your page was lost", noindex: "The page was set to noindex",
  notcanonical: "The page is no longer the canonical version", nofollowed: "The link was set to nofollow", rewritten: "The link was rewritten",
};
export const lostReasonLabel = (r: string | null | undefined) => (r ? REASONS[r.toLowerCase()] ?? r.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase()) : "Reason unknown");

export const sinceDate = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
const SELECT = "url_from,url_to,anchor,first_seen,last_seen,is_lost,lost_reason,domain_rating_source,is_dofollow";

/** One Ahrefs request for a client's domain. Costs API units (at least 50), so the row count is capped. */
export async function fetchLostBacklinks(target: string, days: number, key: string, fetchImpl: typeof fetch = fetch, limit = 100): Promise<LostBacklink[]> {
  const since = sinceDate(days);
  const call = async (withFilter: boolean) => {
    const q = new URLSearchParams({ target, mode: "subdomains", history: `since:${since}`, select: SELECT, order_by: "last_seen:desc", aggregation: "all", limit: String(withFilter ? limit : limit * 3) });
    if (withFilter) q.set("where", JSON.stringify({ field: "is_lost", is: ["eq", true] }));
    return fetchImpl(`https://api.ahrefs.com/v3/site-explorer/all-backlinks?${q}`, { headers: { Authorization: `Bearer ${key}`, Accept: "application/json" }, signal: AbortSignal.timeout(25_000) });
  };
  let r = await call(true);
  if (r.status === 400) r = await call(false); // if Ahrefs rejects the filter, ask for recent history and filter here
  if (r.status === 401 || r.status === 403) throw new Error("Ahrefs rejected the API key (or your plan doesn't include backlink data).");
  if (r.status === 429) throw new Error("Ahrefs says you are out of API units or requests (HTTP 429).");
  if (!r.ok) throw new Error(`Ahrefs error ${r.status}`);
  const j = (await r.json()) as { backlinks?: any[] };
  return (j.backlinks ?? [])
    .filter((b) => b.is_lost === true || (b.is_lost === undefined && b.last_seen))
    .filter((b) => !b.last_seen || b.last_seen.slice(0, 10) >= since)
    .map((b) => ({ urlFrom: b.url_from, urlTo: b.url_to, anchor: b.anchor ?? "", firstSeen: b.first_seen ?? null, lostAt: b.last_seen ?? null, reason: b.lost_reason ?? null, dr: b.domain_rating_source ?? null, dofollow: b.is_dofollow ?? null }));
}

