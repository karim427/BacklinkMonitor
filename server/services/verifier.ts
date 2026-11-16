import * as cheerio from "cheerio";

export interface VerifyInput { sourceUrl: string; targetUrl: string; userAgent: string; competitorDomains?: string[] }
export interface VerifyOutput {
  ok: boolean; httpStatus?: number; error?: string;
  linkFound?: boolean; rel?: string[]; anchorFound?: string; targetMatched?: boolean;
  placement?: "Body" | "Footer" | "Sidebar" | "Author bio" | "Unknown"; outboundLinks?: number;
  competitorLinked?: boolean; indexed?: boolean;
}

const norm = (u: string) => { try { const x = new URL(u); return (x.hostname.replace(/^www\./, "") + x.pathname.replace(/\/+$/, "") + x.search).toLowerCase(); } catch { return u.toLowerCase(); } };
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; } };

export function parseHtml(html: string, input: VerifyInput): Omit<VerifyOutput, "ok" | "httpStatus"> {
  const $ = cheerio.load(html);
  const srcHost = host(input.sourceUrl);
  const tHost = host(input.targetUrl);
  const all = $("a[href]").toArray().map((el) => {
    let href = $(el).attr("href") ?? "";
    try { href = new URL(href, input.sourceUrl).toString(); } catch { /* keep */ }
    return { el, href, host: host(href) };
  });
  const outbound = all.filter((a) => a.host && a.host !== srcHost);
  const toClientDomain = all.filter((a) => a.host === tHost);
  const exact = toClientDomain.find((a) => norm(a.href) === norm(input.targetUrl));
  const hit = exact ?? toClientDomain[0];
  const robots = ($('meta[name="robots"]').attr("content") ?? "").toLowerCase();
  const out: Omit<VerifyOutput, "ok" | "httpStatus"> = {
    linkFound: !!hit, outboundLinks: outbound.length, indexed: !robots.includes("noindex"),
    competitorLinked: (input.competitorDomains ?? []).some((c) => outbound.some((a) => a.host === c.toLowerCase())),
  };
  if (hit) {
    const $a = $(hit.el);
    out.rel = ($a.attr("rel") ?? "").toLowerCase().split(/\s+/).filter(Boolean);
    out.anchorFound = $a.text().trim().slice(0, 200);
    out.targetMatched = !!exact;
    const ancestors = $a.parents().toArray().map((p) => `${p.tagName} ${$(p).attr("class") ?? ""} ${$(p).attr("id") ?? ""}`.toLowerCase()).join(" | ");
    out.placement = /\bfooter\b/.test(ancestors) ? "Footer"
      : /sidebar|widget|aside/.test(ancestors) ? "Sidebar"
      : /author|bio|byline/.test(ancestors) ? "Author bio"
      : /article|content|post|entry|main|body/.test(ancestors) ? "Body" : "Unknown";
  }
  return out;
}

export async function verifyLink(input: VerifyInput, fetchImpl: typeof fetch = fetch): Promise<VerifyOutput> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 15_000);
    const res = await fetchImpl(input.sourceUrl, { headers: { "user-agent": input.userAgent, accept: "text/html" }, redirect: "follow", signal: ctl.signal });
    clearTimeout(t);
    if (!res.ok) return { ok: false, httpStatus: res.status, error: `HTTP ${res.status} — fetch error, not a relevance failure` };
    const html = await res.text();
    const xRobots = (res.headers.get("x-robots-tag") ?? "").toLowerCase();
    const parsed = parseHtml(html, input);
    if (xRobots.includes("noindex")) parsed.indexed = false;
    return { ok: true, httpStatus: res.status, ...parsed };
  } catch (e) {
    return { ok: false, error: `${(e as Error).message} — fetch error, not a relevance failure` };
  }
}
