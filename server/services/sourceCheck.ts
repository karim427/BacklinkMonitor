import { CLUSTER_NICHES, type Cluster } from "./constants.js";

/** Pure helpers for judging the exact page a link sits on (not just the site). */
export interface PageVerdict { fit: number; contextFit: number; quality: "good" | "thin" | "ai" | "spam"; reason: string }
export interface SourceCheck extends PageVerdict { at: string; title: string; context: string; via: "firecrawl" | "fetch"; scored: boolean; /** When the page was published (ISO), if the page says. */ publishedAt?: string | null }

/** Ahrefs only lists a link after it has crawled the page, which can take about a month. This is the first day it can be expected to know a link: the later of when the page was published and when the link went live, plus the lag. */
export function ahrefsReadyOn(publishedAt: string | null | undefined, liveSince: string | Date | null | undefined, lagDays = 30): Date | null {
  const t = [publishedAt, liveSince ? new Date(liveSince).toISOString() : null].map((d) => (d ? Date.parse(d) : NaN)).filter((n) => Number.isFinite(n));
  return t.length ? new Date(Math.max(...t) + lagDays * 86_400_000) : null;
}

const clamp = (n: unknown) => { const v = Number(n); return Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : 0; };

/** The paragraph (with its nearest heading) that holds the link, found in the page's text, so a person can see how the link reads in context. */
export function extractLinkContext(markdown: string, targetUrl: string, anchorText = ""): string {
  const host = (() => { try { return new URL(targetUrl).hostname.replace(/^www\./, ""); } catch { return ""; } })();
  const blocks = markdown.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  // The link itself (its URL is in the text) wins; the anchor words are only a fallback, and a heading that merely repeats them doesn't count.
  let i = host ? blocks.findIndex((b) => !/^#{1,4}\s/.test(b) && b.toLowerCase().includes(host)) : -1;
  if (i < 0 && anchorText.length > 3) i = blocks.findIndex((b) => !/^#{1,4}\s/.test(b) && b.toLowerCase().includes(anchorText.toLowerCase()));
  if (i < 0) return "";
  let heading = ""; for (let k = i; k >= 0; k--) if (/^#{1,4}\s/.test(blocks[k])) { heading = blocks[k].replace(/^#+\s*/, ""); break; }
  const para = blocks[i].replace(/\[([^\]]*)\]\(([^)]*)\)/g, "$1").replace(/\s+/g, " ").slice(0, 500);
  return heading && !blocks[i].startsWith("#") ? `${heading}: ${para}` : para;
}

export function sourcePrompt(a: { clientName: string; cluster: string; targetUrl: string; keyword?: string | null; title: string; text: string; context: string }) {
  const niches = CLUSTER_NICHES[a.cluster as Cluster]?.join(", ") ?? a.cluster;
  return {
    system: 'You judge ONE web page that links to a client\'s website, for a link-building team. Reply ONLY JSON: {"fit":0-100,"contextFit":0-100,"quality":"good"|"thin"|"ai"|"spam","reason":"one short sentence"}. "fit" = how well the page\'s topic matches the client\'s business and the page being linked to (70+ clearly relevant, 40-69 loosely, under 40 unrelated). "contextFit" = does the sentence around the link read naturally and relate to what the link points to (0 if no context is given). "quality": "good" = real useful article; "thin" = very short or filler; "ai" = generic mass-produced AI-style text; "spam" = casino, pills, loans, adult or link-farm style.',
    user: `Client: ${a.clientName} (${a.cluster}: ${niches}).\nThe link points to: ${a.targetUrl}${a.keyword ? ` (target keyword: ${a.keyword})` : ""}\n\nPage title: ${a.title}\nSentence/paragraph around the link: ${a.context || "(not found in the page text)"}\n\nPage text:\n${a.text.slice(0, 3500)}`,
  };
}

export function parsePageVerdict(j: any): PageVerdict | null {
  if (!j || typeof j !== "object" || (j.fit === undefined && j.contextFit === undefined)) return null;
  const q = String(j.quality ?? "good").toLowerCase();
  return { fit: clamp(j.fit), contextFit: clamp(j.contextFit), quality: (["good", "thin", "ai", "spam"].includes(q) ? q : "good") as PageVerdict["quality"], reason: String(j.reason ?? "").slice(0, 240) };
}
