import * as cheerio from "cheerio";
import { aiConfigured, chat, extractJson } from "./ai.js";

/** Reads a site's sitemap (robots.txt first, then the usual file names) and suggests which pages are worth building links to. */
export interface PageSuggestion { url: string; keyword: string; kind: "page" | "blog"; why: string }

const SKIP = /\/(tag|tags|category|categories|author|authors|feed|page|wp-json|cart|checkout|my-account|login|privacy|terms|cookie|contact|thank|search)(\/|$)|\.(jpg|jpeg|png|gif|webp|svg|pdf|xml|zip|mp4)$/i;
const MAX_URLS = 1500, MAX_CHILD_MAPS = 12;
const ua = { "user-agent": "Mozilla/5.0 (compatible; BacklinkVerify/1.0)" };

const getText = async (url: string, f: typeof fetch) => {
  try { const r = await f(url, { headers: ua, redirect: "follow", signal: AbortSignal.timeout(12_000) }); return r.ok ? await r.text() : null; } catch { return null; }
};
const locs = (xml: string) => { const $ = cheerio.load(xml, { xmlMode: true }); return { isIndex: $("sitemapindex").length > 0, urls: $("loc").map((_, e) => $(e).text().trim()).get().filter(Boolean) }; };

export async function fetchSitemapUrls(domain: string, f: typeof fetch = fetch): Promise<string[]> {
  const host = domain.trim().replace(/^https?:\/\//, "").replace(/\/.*$/, "");
  const base = `https://${host}`;
  const robots = (await getText(`${base}/robots.txt`, f)) ?? "";
  const listed = [...robots.matchAll(/^\s*sitemap:\s*(\S+)/gim)].map((m) => m[1]);
  const queue = listed.length ? listed : ["/sitemap.xml", "/sitemap_index.xml", "/wp-sitemap.xml", "/sitemap-index.xml"].map((p) => base + p);
  const out = new Set<string>(); let maps = 0;
  while (queue.length && out.size < MAX_URLS && maps < MAX_CHILD_MAPS) {
    const xml = await getText(queue.shift()!, f); maps++;
    if (!xml) continue;
    const { isIndex, urls } = locs(xml);
    if (isIndex) queue.push(...urls.filter((u) => !/(tag|categor|author|image|video|product)/i.test(u)).slice(0, MAX_CHILD_MAPS));
    else for (const u of urls) { if (out.size < MAX_URLS) out.add(u); }
    if (!listed.length && out.size) break; // found a working default file
  }
  return [...out];
}

/** Drops junk (tags, feeds, images, the home page) and URLs that are already target pages. */
export function usablePages(urls: string[], host: string, existing: string[] = []): string[] {
  const have = new Set(existing.map((u) => u.replace(/\/$/, "").toLowerCase()));
  const same = host.replace(/^www\./, "").toLowerCase();
  return [...new Set(urls)].filter((u) => {
    let p: URL; try { p = new URL(u); } catch { return false; }
    if (p.hostname.replace(/^www\./, "").toLowerCase() !== same) return false;
    if (p.pathname === "/" || p.pathname === "" || SKIP.test(p.pathname) || p.search) return false;
    return !have.has(u.replace(/\/$/, "").toLowerCase());
  });
}

export const slugWords = (u: string) => decodeURIComponent(new URL(u).pathname.split("/").filter(Boolean).pop() ?? "").replace(/\.[a-z]+$/i, "").replace(/[-_]+/g, " ").replace(/\b\d{4,}\b/g, "").trim();
const isBlog = (u: string) => /\/(blog|blogs|news|articles?|insights|resources|guides?|learn|posts?)\//i.test(u) || new URL(u).pathname.split("/").filter(Boolean).length >= 3 || /\/\d{4}\/\d{2}\//.test(u);

/** Without AI: shallow pages are the money pages; the rest are blogs. Keywords come from the URL words. */
export function heuristicPicks(pages: string[], limit = 12): PageSuggestion[] {
  const depth = (u: string) => new URL(u).pathname.split("/").filter(Boolean).length;
  const money = pages.filter((u) => !isBlog(u)).sort((a, b) => depth(a) - depth(b)).slice(0, Math.ceil(limit / 2));
  const blogs = pages.filter(isBlog).sort((a, b) => slugWords(b).length - slugWords(a).length).slice(0, limit - money.length);
  return [...money.map((url) => ({ url, keyword: slugWords(url), kind: "page" as const, why: "Main page on the site" })), ...blogs.map((url) => ({ url, keyword: slugWords(url), kind: "blog" as const, why: "Blog post" }))].filter((s) => s.keyword.length > 2);
}

/** Picks about 12 pages: service/product pages that should rank, plus blog posts worth boosting, each with a likely keyword. */
export async function suggestPages(client: { name: string; domain: string; cluster: string }, pages: string[], f: typeof fetch = fetch): Promise<PageSuggestion[]> {
  if (!pages.length) return [];
  if (!aiConfigured()) return heuristicPicks(pages);
  const sample = [...pages].sort((a, b) => a.length - b.length).slice(0, 150);
  try {
    const out = await chat([
      { role: "system", content: 'You plan link building for a website. From the list of its page URLs choose about 12 pages worth getting backlinks to: money pages (services, products, tools, location pages) that should rank, and a few blog posts with real search demand. Skip thin, legal, or utility pages. For each give the single search keyword someone would type to find that page. Reply ONLY JSON: {"pages":[{"url":"","keyword":"","kind":"page|blog","why":"max 8 words"}]}. Only use URLs from the list.' },
      { role: "user", content: `Client: ${client.name} (${client.domain}), niche: ${client.cluster}\nPage URLs:\n${sample.join("\n")}` },
    ], { json: true });
    const set = new Set(sample);
    const picks = (extractJson<{ pages: any[] }>(out).pages ?? []).filter((p) => set.has(p.url) && typeof p.keyword === "string" && p.keyword.trim()).slice(0, 15)
      .map((p) => ({ url: p.url as string, keyword: String(p.keyword).trim().toLowerCase(), kind: p.kind === "blog" ? ("blog" as const) : ("page" as const), why: String(p.why ?? "").slice(0, 80) }));
    return picks.length ? picks : heuristicPicks(pages);
  } catch { return heuristicPicks(pages); }
}
