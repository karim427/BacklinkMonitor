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

/** Plain-language reason a page could not be fetched. */
export function describeFetchError(e: unknown): string {
  const err = e as { name?: string; message?: string; cause?: { code?: string; message?: string } };
  const code = err?.cause?.code ?? "";
  if (err?.name === "AbortError" || err?.name === "TimeoutError" || code === "UND_ERR_CONNECT_TIMEOUT" || code === "ETIMEDOUT") return "The site took too long to respond (over 15 seconds)";
  if (code === "ENOTFOUND" || code === "EAI_AGAIN" || /ENOTFOUND/.test(err?.message ?? "")) return "Site not found: the domain doesn't exist or DNS failed";
  if (code === "ECONNREFUSED") return "The site refused the connection";
  if (code === "ECONNRESET" || code === "UND_ERR_SOCKET") return "The site closed the connection";
  if (/CERT|SSL|TLS|certificate/i.test(code + (err?.cause?.message ?? ""))) return "The site's SSL certificate is invalid";
  return `Could not fetch the page (${err?.cause?.message ?? err?.message ?? "unknown error"})`;
}
const HTTP_REASON: Record<number, string> = { 401: "requires login", 403: "blocked our checker (the site refuses automated requests)", 404: "page not found", 410: "page was removed", 429: "too many requests, the site is rate-limiting us", 451: "unavailable for legal reasons", 500: "the site had a server error", 502: "bad gateway", 503: "the site is temporarily unavailable" };

export async function verifyLink(input: VerifyInput, fetchImpl: typeof fetch = fetch): Promise<VerifyOutput> {
  try {
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), 15_000);
    const res = await fetchImpl(input.sourceUrl, { headers: { "user-agent": input.userAgent, accept: "text/html" }, redirect: "follow", signal: ctl.signal });
    clearTimeout(t);
    if (!res.ok) return { ok: false, httpStatus: res.status, error: `HTTP ${res.status}: ${HTTP_REASON[res.status] ?? "the site returned an error"}` };
    const html = await res.text();
    const xRobots = (res.headers.get("x-robots-tag") ?? "").toLowerCase();
    const parsed = parseHtml(html, input);
    if (xRobots.includes("noindex")) parsed.indexed = false;
    return { ok: true, httpStatus: res.status, ...parsed };
  } catch (e) {
    return { ok: false, error: describeFetchError(e) };
  }
}
