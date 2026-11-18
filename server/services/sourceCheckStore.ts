import { eq, like } from "drizzle-orm";
import { db, schema as s } from "../db/index.js";
import type { SourceCheck } from "./sourceCheck.js";

/** One settings row per link ("link_ctx:<id>"), so there is no big blob to load. */
const key = (id: number) => `link_ctx:${id}`;
export async function saveSourceCheck(linkId: number, c: SourceCheck) {
  const old = await getSourceCheck(linkId);
  if (!c.scored && old?.scored) c = { ...old, publishedAt: c.publishedAt ?? old.publishedAt }; // a date-only update must not wipe an earlier judgement
  await db.insert(s.settings).values({ key: key(linkId), value: c }).onConflictDoUpdate({ target: s.settings.key, set: { value: c } });
}
export const getSourceCheck = async (linkId: number) => ((await db.select().from(s.settings).where(eq(s.settings.key, key(linkId))))[0]?.value as SourceCheck | undefined) ?? null;
export async function allSourceChecks(): Promise<Map<number, SourceCheck>> {
  const rows = await db.select().from(s.settings).where(like(s.settings.key, "link_ctx:%"));
  return new Map(rows.map((r) => [Number(r.key.slice("link_ctx:".length)), r.value as SourceCheck]));
}
