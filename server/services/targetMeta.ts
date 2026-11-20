import { eq, like } from "drizzle-orm";
import { db, schema as s } from "../db/index.js";

/** Extra facts about a target page, kept in one settings row per page ("target_kw:<id>") so no migration is needed. */
export interface TargetMeta { volume?: number | null; difficulty?: number | null; assigneeId?: number | null; auto?: boolean }
const key = (id: number) => `target_kw:${id}`;

export async function saveMeta(id: number, patch: TargetMeta) {
  const clean = Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined));
  if (!Object.keys(clean).length) return;
  const old = ((await db.select().from(s.settings).where(eq(s.settings.key, key(id))))[0]?.value ?? {}) as TargetMeta;
  const value = { ...old, ...clean };
  await db.insert(s.settings).values({ key: key(id), value }).onConflictDoUpdate({ target: s.settings.key, set: { value } });
}
export async function allMeta(): Promise<Map<number, TargetMeta>> {
  const rows = await db.select().from(s.settings).where(like(s.settings.key, "target_kw:%"));
  return new Map(rows.map((r) => [Number(r.key.slice("target_kw:".length)), r.value as TargetMeta]));
}

/** The active teammate with the fewest open pages (ties: the one invited first). Regular users come first; admins only if there are none. */
export function pickAssignee(users: { id: number; role: string }[], open: Map<number, number>): number | null {
  const pool = users.filter((u) => u.role !== "admin"); const list = pool.length ? pool : users;
  if (!list.length) return null;
  return [...list].sort((a, b) => (open.get(a.id) ?? 0) - (open.get(b.id) ?? 0) || a.id - b.id)[0].id;
}
