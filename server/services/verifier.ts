import * as cheerio from "cheerio";

export interface VerifyInput { sourceUrl: string; targetUrl: string; userAgent: string; competitorDomains?: string[] }
export interface VerifyOutput {
  ok: boolean; httpStatus?: number; error?: string;
  linkFound?: boolean; rel?: string[]; anchorFound?: string; targetMatched?: boolean;
  placement?: "Body" | "Footer" | "Sidebar" | "Author bio" | "Unknown"; outboundLinks?: number;
  competitorLinked?: boolean; indexed?: boolean;
  publishedAt?: string | null; canonicalElsewhere?: boolean; pageNofollow?: boolean; sponsoredLabel?: boolean; pageTitle?: string; pageText?: string;
}

const norm = (u: string) => { try { const x = new URL(u); return (x.hostname.replace(/^www\./, "") + x.pathname.replace(/\/+$/, "") + x.search).toLowerCase(); } catch { return u.toLowerCase(); } };
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, "").toLowerCase(); } catch { return ""; } };

/** Where on the page a link sits, judged from the classes and ids of the elements around it. Page-wide wrappers (body, html) and layout flags like "has-sidebar" are ignored, and Elementor's "widget" is not a sidebar. */
export function detectPlacement(ancestors: { tag: string; cls: string; id: string }[]): "Body" | "Footer" | "Sidebar" | "Author bio" | "Unknown" {
  const els = ancestors.filter((a) => a.tag !== "body" && a.tag !== "html");
  const toks = (a: { cls: string; id: string }) => `${a.cls} ${a.id}`.toLowerCase().split(/\s+/).filter(Boolean).filter((t) => !/^(has|no|with|without|is)-/.test(t));
  const any = (f: (a: { tag: string }, t: string[]) => boolean) => els.some((a) => f(a, toks(a)));
  if (any((a, t) => a.tag === "footer" || t.some((x) => x === "footer" || x === "colophon" || x.startsWith("footer-") || x.endsWith("-footer")))) return "Footer";
  if (any((a, t) => a.tag === "aside" || t.some((x) => x === "sidebar" || x.startsWith("sidebar-") || x.endsWith("-sidebar") || x === "widget-area" || x === "widgets-area"))) return "Sidebar";
  if (any((_, t) => t.some((x) => /^(author-(bio|box|info|description)|about-(the-)?author|byline|post-author-box)$/.test(x)))) return "Author bio";
  if (any((a, t) => a.tag === "article" || a.tag === "main" || t.some((x) => /^(entry-content|post-content|article-content|article-body|post-body|single-content|blog-content|page-content|elementor-widget-theme-post-content|content-area)$/.test(x)))) return "Body";
  return els.length ? "Body" : "Unknown"; // a link in ordinary page content with no sidebar/footer around it
}

/** When the page was published, from the page's own markup (structured data, meta tags, a <time> tag) or a /2026/05/ date in its address. Returns an ISO date or null. */
export function detectPublishDate(html: string, url = "", extra: (string | null | undefined)[] = []): string | null {
  const $ = cheerio.load(html);
  const cands: (string | null | undefined)[] = [...extra];
  $('script[type="application/ld+json"]').each((_, el) => { const m = ($(el).contents().text() || "").match(/"datePublished"\s*:\s*"([^"]+)"/); if (m) cands.push(m[1]); });
  cands.push($('meta[property="article:published_time"]').attr("content"), $('meta[property="og:article:published_time"]').attr("content"), $('meta[itemprop="datePublished"]').attr("content"),
    $('meta[name="date"]').attr("content"), $('meta[name="publish-date"]').attr("content"), $('meta[name="pubdate"]').attr("content"), $("article time[datetime]").first().attr("datetime"), $("time[datetime]").first().attr("datetime"));
  const now = Date.now();
  for (const c of cands) { if (!c) continue; const t = Date.parse(c); if (Number.isFinite(t) && t > Date.UTC(1995, 0, 1) && t <= now + 86_400_000) return new Date(t).toISOString(); }
  const m = url.match(/\/(20\d\d)\/(0[1-9]|1[0-2])(?:\/(0[1-9]|[12]\d|3[01]))?(?:\/|$)/);
  if (m) { const t = Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3] ?? 1)); if (t <= now + 86_400_000) return new Date(t).toISOString(); }
  return null;
}

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
  // The canonical tag says which URL gets the credit. If it points at a different page, a link on this one is worth little.
  const canonRaw = $('link[rel="canonical"]').attr("href");
  let canonicalElsewhere = false;
  if (canonRaw) { try { const c = new URL(canonRaw, input.sourceUrl); const u = new URL(input.sourceUrl); canonicalElsewhere = c.hostname.replace(/^www\./, "") !== u.hostname.replace(/^www\./, "") || c.pathname.replace(/\/+$/, "") !== u.pathname.replace(/\/+$/, ""); } catch { /* ignore */ } }
  const out: Omit<VerifyOutput, "ok" | "httpStatus"> = {
    publishedAt: detectPublishDate(html, input.sourceUrl), linkFound: !!hit, outboundLinks: outbound.length, indexed: !robots.includes("noindex"),
    competitorLinked: (input.competitorDomains ?? []).some((c) => outbound.some((a) => a.host === c.toLowerCase())),
    canonicalElsewhere, pageNofollow: /\b(nofollow|none)\b/.test(robots), pageTitle: ($("title").first().text() || "").trim().slice(0, 200),
  };
  const main = $("article, main, [role=main]").first(); const textRoot = (main.length ? main : $("body")).clone(); textRoot.find("script,style,nav,footer,aside,header").remove(); textRoot.find("*").each((_, e) => { $(e).append(" "); }); // keep words from neighbouring tags apart
  const bodyText = textRoot.text().replace(/\s+/g, " ").trim();
  out.pageText = bodyText.slice(0, 2500);
  if (hit) {
    const $a = $(hit.el);
    out.rel = ($a.attr("rel") ?? "").toLowerCase().split(/\s+/).filter(Boolean);
    out.anchorFound = $a.text().trim().slice(0, 200);
    out.targetMatched = !!exact;
    // "Sponsored post" style disclosures near the top of the article or right around the link.
    const SPONSORED = /\b(sponsored (post|content|article)|advertorial|advertisement|paid (post|partnership|promotion)|partner content|promoted (post|content)|this (post|article) (is|was) sponsored)\b/i;
    const at = bodyText.indexOf(out.anchorFound ?? "\u0000");
    out.sponsoredLabel = SPONSORED.test(bodyText.slice(0, 700)) || (at >= 0 && SPONSORED.test(bodyText.slice(Math.max(0, at - 300), at + 300))) || SPONSORED.test($('meta[name="description"]').attr("content") ?? "");
    out.placement = detectPlacement($a.parents().toArray().map((p) => ({ tag: p.tagName.toLowerCase(), cls: $(p).attr("class") ?? "", id: $(p).attr("id") ?? "" })));
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
