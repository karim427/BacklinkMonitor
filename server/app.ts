import "dotenv/config";
import express, { Router, type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import { ZodError, z } from "zod";
import { core, HttpError } from "./routes/core.js";
import { extra } from "./routes/extra.js";
import { runDueRechecks } from "./services/linkService.js";
import { getAhrefsKey } from "./services/secrets.js";
import { planAllClients } from "./services/autoPlan.js";
import { cronGuard, gate } from "./auth.js";
import { auth, users } from "./routes/users.js";
import { opportunities } from "./routes/opportunities.js";
import { haroInbox } from "./routes/haroInbox.js";

export const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));
app.use(express.urlencoded({ extended: false, limit: "5mb" })); // forms posted by email-forwarding services

const misc = Router();
misc.get("/cron/recheck", cronGuard, async (_req, res, next) => {
  try { const r = await runDueRechecks(); res.json({ rechecked: r.length, results: r }); } catch (e) { next(e); }
});
misc.get("/cron/plan-pages", cronGuard, async (_req, res, next) => {
  try { const key = await getAhrefsKey(); if (!key) return res.json({ skipped: "No Ahrefs key" }); res.json({ results: await planAllClients(key) }); } catch (e) { next(e); }
});
misc.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api", gate, auth, users, misc, core, extra, opportunities, haroInbox);
app.use("/api", (_req, res) => res.status(404).json({ error: { message: "Not found" } }));
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ZodError) return res.status(400).json({ error: { message: err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "), issues: err.issues } });
  if (err instanceof HttpError) return res.status(err.status).json({ error: { message: err.message } });
  const pg = err as { code?: string; cause?: { code?: string } };
  if ((pg.code ?? pg.cause?.code) === "23505") return res.status(409).json({ error: { message: "That already exists. Open the existing one and edit it instead." } });
  console.error(err);
  res.status(500).json({ error: { message: /^Failed query:/.test((err as Error).message ?? "") ? "Couldn't save. Please try again, and tell us if it keeps happening." : (err as Error).message ?? "Server error" } });
});
