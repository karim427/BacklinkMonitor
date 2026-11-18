import { CLUSTERS, CLUSTER_NICHES, type Cluster } from "./constants.js";

/** Pure helpers for reading a donor's blog: which pages to read, and how to read the AI's verdict. */
const SKIP = /\/(tag|tags|category|categories|author|authors|page\/\d+|feed|wp-[a-z]+|cart|checkout|login|signin|register|privacy|terms|cookie|contact|about|search|sitemap)(\/|$)|\.(xml|json|jpg|jpeg|png|gif|webp|pdf|zip|css|js)$|[?&](s|search|replytocom)=/i;
const hostOf = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return ""; } };

/** Chooses up to `n` pages that look like real posts, plus the home page, from a list of URLs on the site. */
export function pickPosts(urls: string[], domain: string, n = 5): string[] {
  const site = domain.replace(/^https?:\/\//, "").replace(/^www\./, "").replace(/\/.*$/, "").toLowerCase();
  const own = [...new Set(urls)].filter((u) => { const h = hostOf(u); return h === site || h.endsWith(`.${site}`); });
  const scored = own.filter((u) => !SKIP.test(u)).map((u) => {
    const path = new URL(u).pathname; const depth = path.split("/").filter(Boolean).length; const slug = path.split("/").filter(Boolean).pop() ?? "";
    return { u, score: (/(blog|news|articles?|posts?|guides?|insights|resources)/i.test(path) ? 2 : 0) + (depth >= 2 ? 1 : 0) + (/\/20\d\d\//.test(path) ? 1 : 0) + ((slug.match(/-/g) ?? []).length >= 3 ? 2 : 0) - (depth === 0 ? 3 : 0) };
  }).filter((x) => x.score > 0).sort((a, b) => b.score - a.score);
  return [`https://${site}/`, ...scored.map((x) => x.u)].slice(0, n + 1);
}

export interface BlogVerdict { niche: string; topics: string[]; scores: Record<string, number>; thinOrAi: boolean; writeForUs: boolean; spammy: boolean; reason: string }

export const judgePrompt = () => ({
  system: 'You judge what a blog is about, for a link-building team. You are given text from several pages of ONE website. Reply ONLY JSON: {"niche":"what the site is about in 2-6 words","topics":["up to 5 topics"],"scores":{"<cluster name>":0-100,...},"thinOrAi":true|false,"writeForUs":true|false,"spammy":true|false,"reason":"one short sentence"}. "scores" is how well the site fits each client cluster as a place to get a relevant backlink (70+ clearly relevant, 40-69 loosely, under 40 unrelated). thinOrAi = pages look thin, spun or AI-generated filler. writeForUs = the site takes guest posts on any topic. spammy = casino, pills, loans, adult or link-farm signs.',
  clusters: CLUSTERS.map((c) => `${c}: ${CLUSTER_NICHES[c].join(", ")}`).join("\n"),
});

/** Turns the AI reply into a safe verdict (all four clusters present, numbers clamped). */
export function parseVerdict(j: any): BlogVerdict | null {
  if (!j || typeof j !== "object") return null;
  const scores: Record<string, number> = {};
  for (const c of CLUSTERS) { const v = Number(j.scores?.[c]); scores[c] = Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : 0; }
  return { niche: String(j.niche ?? "").slice(0, 80), topics: (Array.isArray(j.topics) ? j.topics : []).map((t: any) => String(t).slice(0, 40)).slice(0, 5), scores, thinOrAi: !!j.thinOrAi, writeForUs: !!j.writeForUs, spammy: !!j.spammy, reason: String(j.reason ?? "").slice(0, 240) };
}
export const bestCluster = (v: BlogVerdict) => (Object.entries(v.scores).sort((a, b) => b[1] - a[1])[0] ?? ["", 0]) as [Cluster | "", number];
