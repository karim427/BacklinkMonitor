import { aiConfigured, chat, extractJson } from "./ai.js";
import { CLUSTER_NICHES, type Cluster } from "./constants.js";

/** Asks the AI whether this specific page is on topic for the client's niche. Only returns true when it is clearly unrelated; any failure counts as "don't know" (false). */
export async function pageIsUnrelated(client: { domain: string; cluster: string }, pageTitle?: string, pageText?: string): Promise<boolean> {
  if (!aiConfigured() || !pageText || pageText.length < 200) return false;
  const niches = CLUSTER_NICHES[client.cluster as Cluster]?.join(", ") ?? client.cluster;
  try {
    const out = await chat([
      { role: "system", content: 'You judge whether a web page is on topic for a business niche, for link building. Reply ONLY JSON: {"score": 0-100, "reason": "one short line"}. 70+ clearly on topic, 40-69 loosely related, below 40 unrelated.' },
      { role: "user", content: `Client niche: ${client.cluster} (${niches}). Client site: ${client.domain}.\nPage title: ${pageTitle ?? ""}\nPage text: ${pageText}` },
    ], { json: true });
    const j = extractJson<{ score: number }>(out);
    return Number.isFinite(j.score) && j.score < 35;
  } catch { return false; }
}
