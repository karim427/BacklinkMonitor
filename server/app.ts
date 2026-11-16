import "dotenv/config";
import express, { Router, type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import { ZodError, z } from "zod";
import { core, HttpError } from "./routes/core.js";
import { extra } from "./routes/extra.js";
import { runDueRechecks } from "./services/linkService.js";
import { authRequired, cronGuard, gate, passwordOk, tokenFor } from "./auth.js";

export const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));

const misc = Router();
misc.get("/auth/status", (_req, res) => res.json({ required: authRequired() }));
misc.post("/auth/login", (req, res) => {
  const { password } = z.object({ password: z.string() }).parse(req.body);
  if (!passwordOk(password)) return res.status(401).json({ error: { message: "Wrong password" } });
  res.json({ token: tokenFor(password) });
});
misc.get("/cron/recheck", cronGuard, async (_req, res, next) => {
  try { const r = await runDueRechecks(); res.json({ rechecked: r.length, results: r }); } catch (e) { next(e); }
});
misc.get("/health", (_req, res) => res.json({ ok: true }));

app.use("/api", gate, misc, core, extra);
app.use("/api", (_req, res) => res.status(404).json({ error: { message: "Not found" } }));
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ZodError) return res.status(400).json({ error: { message: err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "), issues: err.issues } });
  if (err instanceof HttpError) return res.status(err.status).json({ error: { message: err.message } });
  console.error(err);
  res.status(500).json({ error: { message: (err as Error).message ?? "Server error" } });
});
