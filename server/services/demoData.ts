import { eq, inArray } from "drizzle-orm";
import { db, schema as s } from "../db/index.js";
import { hostOf } from "./linkService.js";

/** Sample data from the seed lives on reserved addresses that can't exist on the internet. */
export const isDemoHost = (h: string) => /\.(example|test|invalid|localhost)$/i.test(h.trim());
const demoUrl = (u: string) => isDemoHost(hostOf(u));

/** What "remove demo data" would delete, so an admin can review it first. */
export async function previewDemoData() {
  const [links, donors, clients, prospects, haro, citations] = await Promise.all([
    db.select().from(s.links), db.select().from(s.donors), db.select().from(s.clients), db.select().from(s.prospects), db.select().from(s.haroRequests), db.select({ id: s.citations.id }).from(s.citations),
  ]);
  const demoLinks = links.filter((l) => demoUrl(l.sourceUrl));
  const realLinkClients = new Set(links.filter((l) => !demoUrl(l.sourceUrl)).map((l) => l.clientId));
  const demoClients = clients.filter((c) => isDemoHost(hostOf(c.domain)) && !realLinkClients.has(c.id));
  const keptFake = clients.filter((c) => isDemoHost(hostOf(c.domain)) && realLinkClients.has(c.id));
  return {
    links: demoLinks.map((l) => l.id), donors: donors.filter((d) => isDemoHost(d.domain)).map((d) => d.id),
    clients: demoClients.map((c) => ({ id: c.id, name: c.name, domain: c.domain })),
    keptClients: keptFake.map((c) => ({ id: c.id, name: c.name, domain: c.domain })), // fake domain but has a real link: kept, fix its domain by hand
    prospects: prospects.filter((p) => isDemoHost(p.domain)).map((p) => p.id),
    haro: haro.filter((h) => /^Example /i.test(h.outlet ?? "") || /\(fake\)/i.test(h.journalist ?? "")).map((h) => h.id),
    citations: citations.length,
  };
}

export async function removeDemoData() {
  const p = await previewDemoData();
  await db.transaction(async (tx) => {
    // Links go first: they reference donors and clients.
    if (p.links.length) await tx.delete(s.links).where(inArray(s.links.id, p.links));
    if (p.donors.length) await tx.delete(s.donors).where(inArray(s.donors.id, p.donors));
    if (p.prospects.length) await tx.delete(s.prospects).where(inArray(s.prospects.id, p.prospects));
    if (p.haro.length) await tx.delete(s.haroRequests).where(inArray(s.haroRequests.id, p.haro));
    await tx.delete(s.citations); // the Citations feature was removed
    for (const c of p.clients) await tx.delete(s.clients).where(eq(s.clients.id, c.id)); // cascades to target pages and monthly targets
  });
  return { links: p.links.length, donors: p.donors.length, clients: p.clients.length, prospects: p.prospects.length, haro: p.haro.length, citations: p.citations, keptClients: p.keptClients };
}
