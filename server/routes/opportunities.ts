import { Router } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db, schema as s } from "../db/index.js";
import { getAhrefsKey } from "../services/secrets.js";
import { fetchOrganicCompetitors } from "../services/ahrefsGapApi.js";
import { addToProspects, getOpportunities, runGap, setCompetitors } from "../services/opportunities.js";
import { hostOf } from "../services/linkService.js";
import { HttpError, wrap } from "./core.js";

/** Competitor backlink gap. Reading is free; "suggest" and "find" spend Ahrefs units, so they are admin-only (the gate blocks non-GET for users). */
export const opportunities = Router();
const id = z.object({ clientId: z.number().int() });

opportunities.get("/opportunities", wrap(async (req) => {
  const clientId = Number(req.query.clientId); if (!Number.isInteger(clientId)) throw new HttpError(400, "clientId is required");
  return { ...(await getOpportunities(clientId)), hasKey: !!(await getAhrefsKey()) };
}));
opportunities.put("/opportunities/competitors", wrap(async (req) => {
  const b = id.extend({ domains: z.array(z.string()).max(20) }).parse(req.body);
  return { competitors: await setCompetitors(b.clientId, b.domains) };
}));
opportunities.post("/opportunities/suggest", wrap(async (req) => {
  const { clientId } = id.parse(req.body);
  const key = await getAhrefsKey(); if (!key) throw new HttpError(400, "No Ahrefs API key. Add one in Settings first.");
  const client = (await db.select().from(s.clients).where(eq(s.clients.id, clientId)))[0]; if (!client) throw new HttpError(404, "Client not found");
  try { return { suggestions: await fetchOrganicCompetitors(hostOf(client.domain), key) }; } catch (e) { throw new HttpError(400, (e as Error).message); }
}));
opportunities.post("/opportunities/find", wrap(async (req) => {
  const { clientId } = id.parse(req.body);
  try { return await runGap(clientId); } catch (e) { throw new HttpError(400, (e as Error).message); }
}));
opportunities.post("/opportunities/prospects", wrap(async (req) => {
  const b = id.extend({ domains: z.array(z.string()).min(1).max(200) }).parse(req.body);
  return addToProspects(b.clientId, b.domains);
}));
