import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { and, eq } from "drizzle-orm";
import { db, schema as s } from "./db/index.js";

export type Role = "admin" | "user";
export interface AuthUser { id: number; email: string; name: string | null; role: Role }
declare global { namespace Express { interface Request { user?: AuthUser } } }

/** Auth is always on in production (Vercel). Locally it's opt-in with REQUIRE_AUTH=1 so `npm run dev` stays zero-setup. */
export const authRequired = () => !!process.env.VERCEL || process.env.REQUIRE_AUTH === "1";
const secret = () => process.env.SESSION_SECRET || process.env.CRON_SECRET || "";
export const adminEmails = () => (process.env.ADMIN_EMAILS ?? "karim@appscrip.co").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
export const normEmail = (e: string) => e.trim().toLowerCase();

const hmac = (v: string) => crypto.createHmac("sha256", secret()).update(v).digest("hex");
const safeEq = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };

export const SESSION_DAYS = 30;
export const signSession = (uid: number) => { const body = `${uid}.${Date.now() + SESSION_DAYS * 86_400_000}`; return `${body}.${hmac(body)}`; };
function readSession(token: string): number | null {
  const [uid, exp, sig] = token.split(".");
  if (!uid || !exp || !sig || !secret()) return null;
  if (!safeEq(sig, hmac(`${uid}.${exp}`)) || Number(exp) < Date.now()) return null;
  return Number(uid);
}
export const codeHash = (email: string, code: string) => hmac(`code:${email}:${code}`);

export async function resolveUser(req: Request): Promise<AuthUser | null> {
  if (!authRequired()) return { id: 0, email: "local@dev", name: "Local dev", role: "admin" };
  const token = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  const uid = token ? readSession(token) : null;
  if (!uid) return null;
  const u = (await db.select().from(s.users).where(and(eq(s.users.id, uid), eq(s.users.active, true))))[0];
  return u ? { id: u.id, email: u.email, name: u.name, role: u.role as Role } : null;
}

/** What a non-admin may change. Everything else that isn't a GET is admin-only. */
const USER_WRITES: { method: string; re: RegExp; ownLink?: boolean }[] = [
  { method: "POST", re: /^\/links$/ },
  { method: "POST", re: /^\/links\/import$/ },
  { method: "POST", re: /^\/target-pages\/preview$/ },
  { method: "POST", re: /^\/links\/\d+\/verify$/, ownLink: true },
  { method: "PUT", re: /^\/links\/\d+$/, ownLink: true },
  { method: "DELETE", re: /^\/links\/\d+$/, ownLink: true },
];

/** Gate every /api route except /auth/* and /cron/* (cron has its own secret). */
export async function gate(req: Request, res: Response, next: NextFunction) {
  try {
    if (req.path.startsWith("/auth/") || req.path.startsWith("/cron/") || req.path === "/health") return next();
    const user = await resolveUser(req);
    if (!user) return res.status(401).json({ error: { message: "Unauthorized" } });
    req.user = user;
    if (user.role === "admin") return next();
    if (req.path.startsWith("/users")) return res.status(403).json({ error: { message: "Admins only" } });
    if (req.method === "GET" || req.method === "HEAD") return next();
    const rule = USER_WRITES.find((r) => r.method === req.method && r.re.test(req.path));
    if (!rule) return res.status(403).json({ error: { message: "Admins only" } });
    if (rule.ownLink) {
      const id = Number(req.path.split("/")[2]);
      const link = (await db.select({ createdBy: s.links.createdBy }).from(s.links).where(eq(s.links.id, id)))[0];
      if (link && link.createdBy !== user.id) return res.status(403).json({ error: { message: "You can only change links you added" } });
    }
    next();
  } catch (e) { next(e); }
}

export function cronGuard(req: Request, res: Response, next: NextFunction) {
  const cs = process.env.CRON_SECRET;
  if (!cs) return res.status(503).json({ error: { message: "CRON_SECRET is not configured." } });
  const bearer = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  if (bearer && safeEq(bearer, cs)) return next();
  res.status(401).json({ error: { message: "Unauthorized" } });
}
