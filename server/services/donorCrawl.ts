import { eq } from "drizzle-orm";
import { db, schema as s } from "../db/index.js";
import { aiConfigured, chat, extractJson } from "./ai.js";
import { getFirecrawlKey } from "./secrets.js";
import { mapSite, scrapePage, type ScrapedPage } from "./firecrawlApi.js";
import { bestCluster, judgePrompt, parseVerdict, pickPosts, type BlogVerdict } from "./blogCrawl.js";

/** What reading a donor's blog found. Kept in the settings table (one entry per donor). */
export interface DonorCrawl { at: string; pages: { url: string; title: string }[]; verdict: BlogVerdict | null; note?: string }
type Store = Record<string, DonorCrawl>;
const KEY = "donor_crawl";
const read = async (): Promise<Store> => ((await db.select().from(s.settings).where(eq(s.settings.key, KEY)))[0]?.value as Store) ?? {};

export const getDonorCrawl = async (donorId: number) => (await read())[String(donorId)] ?? null;
export const getAllCrawls = read;

/** How well this donor's blog fits a client cluster (0-100), if its blog has been read. */
export async function donorFitFor(donorId: number, cluster: string): Promise<number | null> {
  const v = (await getDonorCrawl(donorId))?.verdict; const n = v?.scores?.[cluster];
  return typeof n === "number" ? n : null;
}

/** Reads a donor's blog with Firecrawl (a few real posts), asks the AI what it is about, and saves the answer. About 6 Firecrawl credits. */
export async function crawlDonor(donorId: number, fetchImpl: typeof fetch = fetch): Promise<DonorCrawl> {
  const key = await getFirecrawlKey();
  if (!key) throw new Error("No Firecrawl key. Add one in Settings first.");
  const donor = (await db.select().from(s.donors).where(eq(s.donors.id, donorId)))[0];
  if (!donor) throw new Error("Donor not found");

  let urls: string[] = [];
  try { urls = (await mapSite(donor.domain, key, "blog", 60, fetchImpl)).map((m) => m.url); } catch (e) { if (/rejected|credits/i.test((e as Error).message)) throw e; /* fall back to the home page */ }
  const chosen = pickPosts(urls, donor.domain, 5);

  const pages: ScrapedPage[] = [];
  for (let i = 0; i < chosen.length; i += 3) await Promise.all(chosen.slice(i, i + 3).map(async (u) => {
    try { const p = await scrapePage(u, key, fetchImpl); if (p.markdown.trim().length > 150) pages.push(p); } catch (e) { if (/rejected|credits/i.test((e as Error).message)) throw e; }
  }));
  if (!pages.length) throw new Error("Firecrawl could not read any page on this site (it may block crawlers or be offline).");

  let verdict: BlogVerdict | null = null; let note: string | undefined;
  if (aiConfigured()) {
    try {
      const p = judgePrompt();
      const out = await chat([
        { role: "system", content: p.system },
        { role: "user", content: `Client clusters (use these exact names as keys in "scores"):\n${p.clusters}\n\nWebsite: ${donor.domain}\n\n${pages.map((x, i) => `--- Page ${i + 1}: ${x.title || x.url}\n${x.markdown.slice(0, 2500)}`).join("\n\n")}` },
      ], { json: true });
      verdict = parseVerdict(extractJson<any>(out));
    } catch { note = "The AI could not judge the pages."; }
  } else note = "AI is not configured, so only the pages were read.";

  const result: DonorCrawl = { at: new Date().toISOString(), pages: pages.map((x) => ({ url: x.url, title: x.title })), verdict, note };
  const st = await read(); st[String(donorId)] = result;
  await db.insert(s.settings).values({ key: KEY, value: st }).onConflictDoUpdate({ target: s.settings.key, set: { value: st } });

  if (verdict) { // feed what we learned back into the donor so the niche and quality rules use it
    const flags = { ...(donor.flags ?? {}) }; if (verdict.thinOrAi) flags.thinAi = true; if (verdict.writeForUs) flags.writeForUs = true;
    await db.update(s.donors).set({ niche: verdict.niche || donor.niche, flags }).where(eq(s.donors.id, donorId));
  }
  return result;
}
export { bestCluster };
