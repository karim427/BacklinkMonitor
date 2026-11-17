import crypto from "node:crypto";
import { Router } from "express";
import { z } from "zod";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { db, schema as s } from "../db/index.js";
import { adminEmails, codeHash, normEmail, resolveUser, signSession, authRequired, type AuthUser } from "../auth.js";
import { emailConfigured, sendEmail } from "../services/email.js";
import { HttpError, wrap } from "./core.js";

export const auth = Router();   // public: mounted before the gate (the gate skips /auth/*)
export const users = Router();  // admin only: enforced by the gate

const CODE_TTL_MS = 10 * 60_000;
const ADMIN_CODE_TTL_MS = 60 * 60_000;
const MAX_ATTEMPTS = 5;
const MAX_CODES_PER_HOUR = 5;
const pub = (u: { id: number; email: string; name: string | null; role: string }): AuthUser => ({ id: u.id, email: u.email, name: u.name, role: u.role as AuthUser["role"] });

auth.get("/auth/status", (_req, res) => res.json({ required: authRequired() }));

auth.get("/auth/me", wrap(async (req) => {
  const user = await resolveUser(req);
  if (!user) throw new HttpError(401, "Unauthorized");
  return { user };
}));

/** Always answers ok for any well-formed email, so the endpoint doesn't reveal who is invited. */
auth.post("/auth/request-code", wrap(async (req) => {
  const { email: raw } = z.object({ email: z.string().email() }).parse(req.body);
  const email = normEmail(raw);
  if (!emailConfigured()) throw new HttpError(503, "Email sending is not configured on the server.");

  let user = (await db.select().from(s.users).where(eq(s.users.email, email)))[0];
  if (!user && adminEmails().includes(email)) user = (await db.insert(s.users).values({ email, role: "admin" }).returning())[0];
  if (!user || !user.active) return { ok: true };

  const hourAgo = new Date(Date.now() - 3_600_000);
  const recent = await db.select({ id: s.loginCodes.id }).from(s.loginCodes).where(and(eq(s.loginCodes.email, email), gt(s.loginCodes.createdAt, hourAgo)));
  if (recent.length >= MAX_CODES_PER_HOUR) return { ok: true };

  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  await db.insert(s.loginCodes).values({ email, codeHash: codeHash(email, code), expiresAt: new Date(Date.now() + CODE_TTL_MS) });
  await sendEmail(email, `${code} is your Backlink Verify sign-in code`,
    `Your sign-in code is ${code}\n\nIt expires in 10 minutes. If you didn't request it, you can ignore this email.`,
    `<p>Your Backlink Verify sign-in code is</p><p style="font-size:28px;font-weight:700;letter-spacing:6px">${code}</p><p>It expires in 10 minutes. If you didn't request it, you can ignore this email.</p>`);
  return { ok: true };
}));

auth.post("/auth/verify-code", wrap(async (req) => {
  const body = z.object({ email: z.string().email(), code: z.string().regex(/^\d{6}$/) }).parse(req.body);
  const email = normEmail(body.email);
  const bad = () => new HttpError(401, "Invalid or expired code");
  const row = (await db.select().from(s.loginCodes)
    .where(and(eq(s.loginCodes.email, email), isNull(s.loginCodes.usedAt), gt(s.loginCodes.expiresAt, new Date())))
    .orderBy(desc(s.loginCodes.createdAt)).limit(1))[0];
  if (!row || row.attempts >= MAX_ATTEMPTS) throw bad();
  const a = Buffer.from(codeHash(email, body.code)), b = Buffer.from(row.codeHash);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    await db.update(s.loginCodes).set({ attempts: row.attempts + 1 }).where(eq(s.loginCodes.id, row.id));
    throw bad();
  }
  await db.update(s.loginCodes).set({ usedAt: new Date() }).where(eq(s.loginCodes.id, row.id));
  const user = (await db.select().from(s.users).where(and(eq(s.users.email, email), eq(s.users.active, true))))[0];
  if (!user) throw bad();
  await db.update(s.users).set({ lastLoginAt: new Date() }).where(eq(s.users.id, user.id));
  return { token: signSession(user.id), user: pub(user) };
}));

/* ---------- admin: user management ---------- */
const idOf = (p: string) => { const n = Number(p); if (!Number.isInteger(n)) throw new HttpError(400, "Invalid id"); return n; };
const activeAdmins = async () => (await db.select().from(s.users).where(and(eq(s.users.role, "admin"), eq(s.users.active, true)))).length;

users.get("/users", wrap(async () => ({ rows: await db.select().from(s.users).orderBy(s.users.createdAt) })));

users.post("/users", wrap(async (req, res) => {
  const b = z.object({ email: z.string().email(), name: z.string().trim().optional(), role: z.enum(["admin", "user"]).default("user") }).parse(req.body);
  const email = normEmail(b.email);
  if ((await db.select().from(s.users).where(eq(s.users.email, email))).length) throw new HttpError(409, "That email already has an account");
  const row = (await db.insert(s.users).values({ email, name: b.name || null, role: b.role, invitedBy: req.user?.id || null }).returning())[0];
  const origin = process.env.APP_URL ?? (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "");
  let emailed = true;
  try {
    await sendEmail(email, "You've been invited to Backlink Verify",
      `You've been added to Backlink Verify as ${b.role === "admin" ? "an admin" : "a user"}.\n\nOpen ${origin || "the app"} and sign in with this email address — we'll send you a 6-digit code.`);
  } catch { emailed = false; }
  res.status(201);
  return { ...row, emailed };
}));

users.put("/users/:id", wrap(async (req) => {
  const id = idOf(String(req.params.id));
  const b = z.object({ role: z.enum(["admin", "user"]).optional(), name: z.string().trim().nullable().optional(), active: z.boolean().optional() }).parse(req.body);
  const cur = (await db.select().from(s.users).where(eq(s.users.id, id)))[0];
  if (!cur) throw new HttpError(404, "User not found");
  const losesAdmin = cur.role === "admin" && cur.active && ((b.role && b.role !== "admin") || b.active === false);
  if (losesAdmin && (await activeAdmins()) <= 1) throw new HttpError(400, "There must be at least one active admin");
  return (await db.update(s.users).set(b).where(eq(s.users.id, id)).returning())[0];
}));

/** For when email can't be delivered (e.g. no verified Resend domain): the admin hands the code over directly. */
users.post("/users/:id/code", wrap(async (req) => {
  const id = idOf(String(req.params.id));
  const u = (await db.select().from(s.users).where(eq(s.users.id, id)))[0];
  if (!u) throw new HttpError(404, "User not found");
  if (!u.active) throw new HttpError(400, "This user is disabled");
  const code = String(crypto.randomInt(0, 1_000_000)).padStart(6, "0");
  const expiresAt = new Date(Date.now() + ADMIN_CODE_TTL_MS);
  await db.insert(s.loginCodes).values({ email: u.email, codeHash: codeHash(u.email, code), expiresAt });
  return { email: u.email, code, expiresAt };
}));

users.delete("/users/:id", wrap(async (req) => {
  const id = idOf(String(req.params.id));
  const cur = (await db.select().from(s.users).where(eq(s.users.id, id)))[0];
  if (!cur) throw new HttpError(404, "User not found");
  if (cur.role === "admin" && cur.active && (await activeAdmins()) <= 1) throw new HttpError(400, "There must be at least one active admin");
  await db.delete(s.users).where(eq(s.users.id, id));
  return { ok: true };
}));
