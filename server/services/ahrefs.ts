// Ahrefs Site Explorer v3 client. Falls back to deterministic mock data when no key is configured.
export interface AhrefsDonorMetrics { dr: number; usTrafficPct: number; organicTraffic: number; referringDomains: number; linkedDomains: number; mock: boolean }

const hash = (s: string) => [...s].reduce((a, c) => (a * 31 + c.charCodeAt(0)) >>> 0, 7);

export function mockMetrics(domain: string): AhrefsDonorMetrics {
  const h = hash(domain);
  const rd = 100 + (h % 1200);
  return { dr: 20 + (h % 50), usTrafficPct: 55 + (h % 40), organicTraffic: 300 + (h % 30000), referringDomains: rd, linkedDomains: Math.round(rd * (0.3 + (h % 10) / 10)), mock: true };
}

export async function fetchDonorMetrics(domain: string, key = process.env.AHREFS_API_KEY): Promise<AhrefsDonorMetrics> {
  if (!key) return mockMetrics(domain);
  const date = new Date().toISOString().slice(0, 10);
  const headers = { Authorization: `Bearer ${key}`, Accept: "application/json" };
  const get = async (path: string, params: Record<string, string>) => {
    const r = await fetch(`https://api.ahrefs.com/v3/site-explorer/${path}?${new URLSearchParams({ target: domain, date, ...params })}`, { headers });
    if (!r.ok) throw new Error(`Ahrefs ${path} ${r.status}`);
    return r.json() as Promise<any>;
  };
  const [dr, metrics, bl, out, us] = await Promise.all([
    get("domain-rating", {}),
    get("metrics", { country: "", mode: "subdomains" }),
    get("backlinks-stats", { mode: "subdomains" }),
    get("outlinks-stats", { mode: "subdomains" }),
    get("metrics", { country: "us", mode: "subdomains" }),
  ]);
  const total = metrics?.metrics?.org_traffic ?? 0, usT = us?.metrics?.org_traffic ?? 0;
  return {
    dr: Math.round(dr?.domain_rating?.domain_rating ?? 0), organicTraffic: total, usTrafficPct: total ? Math.round((usT / total) * 100) : 0,
    referringDomains: bl?.metrics?.live_refdomains ?? 0, linkedDomains: out?.metrics?.linked_domains ?? 0, mock: false,
  };
}
