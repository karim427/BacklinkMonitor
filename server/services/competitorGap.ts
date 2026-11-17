import type { RefDomain } from "./ahrefsGapApi.js";

export interface GapRow { domain: string; dr: number | null; competitorCount: number; competitors: string[]; links: number; firstSeen: string | null }

/** Sites that link to your competitors but not to you, ranked by how many competitors they link to (then by DR). */
export function computeGap(ours: RefDomain[], competitors: { domain: string; refs: RefDomain[] }[], opts: { minDr?: number } = {}): GapRow[] {
  const minDr = opts.minDr ?? 20;
  const mine = new Set(ours.map((o) => o.domain));
  const rivals = new Set(competitors.map((c) => c.domain));
  const by = new Map<string, GapRow>();
  for (const c of competitors) for (const r of c.refs) {
    if (r.spam || mine.has(r.domain) || rivals.has(r.domain) || (r.dr ?? 0) < minDr) continue;
    const row = by.get(r.domain) ?? { domain: r.domain, dr: r.dr, competitorCount: 0, competitors: [], links: 0, firstSeen: r.firstSeen };
    if (!row.competitors.includes(c.domain)) { row.competitors.push(c.domain); row.competitorCount++; }
    row.links += r.links; row.dr = Math.max(row.dr ?? 0, r.dr ?? 0);
    by.set(r.domain, row);
  }
  return [...by.values()].sort((a, b) => b.competitorCount - a.competitorCount || (b.dr ?? 0) - (a.dr ?? 0) || b.links - a.links);
}

/** 0-100 for the Prospects list: more competitors linking and a stronger site rank higher. */
export const gapScore = (r: GapRow) => Math.min(100, 30 + r.competitorCount * 20 + Math.round((r.dr ?? 0) / 4));
