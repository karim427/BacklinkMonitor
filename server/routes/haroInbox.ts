import { Router } from "express";
import { z } from "zod";
import { getInboxToken, importHaro, regenerateInboxToken, tokenOk } from "../services/haroImport.js";
import { readInboundMail } from "../services/inboundMail.js";
import { HttpError, wrap } from "./core.js";

export const haroInbox = Router();

/** Paste a whole digest email: it is split into one request per journalist query. */
haroInbox.post("/haro/import", wrap(async (req, res) => {
  const { text } = z.object({ text: z.string().min(20).max(120_000) }).parse(req.body);
  res.status(201); return importHaro(text);
}));

/** Admin only: the secret address another service posts forwarded emails to. */
haroInbox.get("/haro/inbox", wrap(async (req) => {
  if (req.user?.role !== "admin") throw new HttpError(403, "Admins only");
  return { token: await getInboxToken(true) };
}));
haroInbox.post("/haro/inbox/regenerate", wrap(async (req) => {
  if (req.user?.role !== "admin") throw new HttpError(403, "Admins only");
  return { token: await regenerateInboxToken() };
}));

/** Public (the secret in the address is the password). Zapier, Make, Zoho Flow or an email-to-webhook service posts the forwarded email here. */
let hits: number[] = [];
haroInbox.post("/haro/inbound/:token", wrap(async (req) => {
  if (!(await tokenOk(String(req.params.token)))) throw new HttpError(404, "Not found");
  const now = Date.now(); hits = hits.filter((t) => now - t < 3_600_000);
  if (hits.length >= 60) throw new HttpError(429, "Too many emails this hour");
  hits.push(now);
  const { subject, text } = readInboundMail((req.body ?? {}) as Record<string, any>);
  if (text.length < 20) throw new HttpError(400, "The email had no readable text");
  return importHaro(subject ? `${subject}\n\n${text}` : text);
}));
