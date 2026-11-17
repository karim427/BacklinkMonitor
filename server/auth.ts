import crypto from "node:crypto";
import type { NextFunction, Request, Response } from "express";

const secret = () => process.env.APP_PASSWORD ?? "";
export const authRequired = () => !!secret(); // no APP_PASSWORD = open access (no login page)
export const tokenFor = (pw: string) => crypto.createHmac("sha256", pw).update("backlink-verify-v1").digest("hex");
const safeEq = (a: string, b: string) => { const x = Buffer.from(a), y = Buffer.from(b); return x.length === y.length && crypto.timingSafeEqual(x, y); };

export const passwordOk = (pw: string) => !!secret() && safeEq(tokenFor(pw), tokenFor(secret()));

/** Gate every /api route except /auth/* and /cron/* (cron has its own secret). */
export function gate(req: Request, res: Response, next: NextFunction) {
  if (req.path.startsWith("/auth/") || req.path.startsWith("/cron/")) return next();
  if (!authRequired()) return next();
  if (!secret()) return res.status(503).json({ error: { message: "APP_PASSWORD is not configured on the server." } });
  const bearer = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  if (bearer && safeEq(bearer, tokenFor(secret()))) return next();
  res.status(401).json({ error: { message: "Unauthorized" } });
}

export function cronGuard(req: Request, res: Response, next: NextFunction) {
  const cs = process.env.CRON_SECRET;
  if (!cs) return res.status(503).json({ error: { message: "CRON_SECRET is not configured." } });
  const bearer = (req.headers.authorization ?? "").replace(/^Bearer\s+/i, "");
  if (bearer && safeEq(bearer, cs)) return next();
  res.status(401).json({ error: { message: "Unauthorized" } });
}
