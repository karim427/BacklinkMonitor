import "dotenv/config";
import express, { type NextFunction, type Request, type Response } from "express";
import cors from "cors";
import cron from "node-cron";
import { ZodError } from "zod";
import { db, runMigrations, schema as s } from "./db";
import { core, HttpError } from "./routes/core";
import { extra } from "./routes/extra";
import { runDueRechecks } from "./services/linkService";
import { seed } from "./db/seed";

runMigrations();
if (db.select().from(s.clients).limit(1).all().length === 0) console.log("Empty database — seeded", seed());

const app = express();
app.use(cors());
app.use(express.json({ limit: "5mb" }));
app.use("/api", core, extra);
app.use("/api", (_req, res) => res.status(404).json({ error: { message: "Not found" } }));
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ZodError) return res.status(400).json({ error: { message: err.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; "), issues: err.issues } });
  if (err instanceof HttpError) return res.status(err.status).json({ error: { message: err.message } });
  console.error(err);
  res.status(500).json({ error: { message: (err as Error).message ?? "Server error" } });
});

// Daily at 06:00: run due rechecks.
cron.schedule("0 6 * * *", () => { runDueRechecks().then((r) => console.log(`[cron] rechecked ${r.length} links`)).catch(console.error); });

const port = Number(process.env.PORT ?? 8787);
app.listen(port, () => console.log(`API listening on http://localhost:${port}`));
