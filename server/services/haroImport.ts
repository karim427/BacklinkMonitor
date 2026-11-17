import crypto from "node:crypto";
import { eq } from "drizzle-orm";
import { db, schema as s } from "../db/index.js";
import { aiConfigured, chat, extractJson } from "./ai.js";

/** Turns a pasted or forwarded email (often a daily digest with many journalist requests) into separate HARO requests. */
export interface ParsedRequest { outlet?: string | null; journalist?: string | null; category?: string | null; title?: string | null; question?: string | null; requirements?: string | null; deadline?: string | null }

const stripHtml = (h: string) => h.replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ").replace(/<br\s*\/?>|<\/(p|div|li|tr|h\d)>/gi, "\n").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"').replace(/[ \t]+/g, " ").replace(/\n\s*\n+/g, "\n\n").trim();
export const emailText = (b: { text?: string; html?: string; body?: string }) => (b.text || b.body || (b.html ? stripHtml(b.html) : "")).trim();

export const dedupeKey = (r: { outlet?: string | null; title?: string | null; question?: string | null }) =>
  crypto.createHash("sha1").update([r.outlet, r.title, (r.question ?? "").slice(0, 160)].map((x) => (x ?? "").toLowerCase().replace(/\s+/g, " ").trim()).join("|")).digest("hex");

const asParsed = (j: any): ParsedRequest[] => (Array.isArray(j?.requests) ? j.requests : []).filter((r: any) => r && (r.question || r.title)).slice(0, 40);

export async function splitDigest(text: string): Promise<ParsedRequest[]> {
  const body = text.slice(0, 40_000);
  if (aiConfigured()) {
    try {
      const out = await chat([
        { role: "system", content: 'This is an email from a service that sends journalists\' requests for expert quotes (like HARO). It may contain many requests, plus ads, sponsor blocks and footers. Extract EVERY journalist request and ignore everything else. Reply ONLY JSON: {"requests":[{"outlet":"","journalist":"","category":"","title":"short summary","question":"what the journalist asks","requirements":"who they want / word count","deadline":"ISO date or null"}]}.' },
        { role: "user", content: body },
      ], { json: true });
      const list = asParsed(extractJson<any>(out));
      if (list.length) return list;
    } catch { /* fall through */ }
  }
  // No AI (or it failed): treat the whole text as one request.
  const first = body.split("\n").find((l) => l.trim()) ?? "Request";
  return [{ title: first.slice(0, 100), question: body.slice(0, 1500) }];
}

export async function importHaro(text: string) {
  const list = await splitDigest(text);
  const have = new Set((await db.select().from(s.haroRequests)).map((r) => dedupeKey(r)));
  let created = 0; let duplicates = 0;
  for (const r of list) {
    const k = dedupeKey(r); if (have.has(k)) { duplicates++; continue; }
    have.add(k);
    const d = r.deadline ? new Date(r.deadline) : null;
    await db.insert(s.haroRequests).values({
      rawEmail: [r.title, r.question, r.requirements].filter(Boolean).join("\n").slice(0, 20_000), outlet: r.outlet ?? null, journalist: r.journalist ?? null, category: r.category ?? null,
      title: r.title ?? null, question: r.question ?? null, requirements: r.requirements ?? null, deadline: d && !Number.isNaN(d.getTime()) ? d : null, matches: [], responses: [],
    } as any);
    created++;
  }
  return { found: list.length, created, duplicates };
}

/* ---- the private address that forwards requests into the app ---- */
const readInbox = async () => ((await db.select().from(s.settings).where(eq(s.settings.key, "haro_inbox")))[0]?.value ?? {}) as { token?: string };
export async function getInboxToken(create = false): Promise<string | null> {
  const cur = (await readInbox()).token; if (cur || !create) return cur ?? null;
  return regenerateInboxToken();
}
export async function regenerateInboxToken() {
  const token = crypto.randomBytes(24).toString("hex");
  await db.insert(s.settings).values({ key: "haro_inbox", value: { token } }).onConflictDoUpdate({ target: s.settings.key, set: { value: { token } } });
  return token;
}
export async function tokenOk(given: string) {
  const t = (await readInbox()).token; if (!t) return false;
  const a = Buffer.from(given), b = Buffer.from(t); return a.length === b.length && crypto.timingSafeEqual(a, b);
}
