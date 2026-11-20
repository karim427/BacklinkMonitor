// Local dev entry. On Vercel the app is served by api/index.ts (no listen, no node-cron).
import "dotenv/config";
import cron from "node-cron";
import { getAhrefsKey } from "./services/secrets.js";
import { planAllClients } from "./services/autoPlan.js";
import { db, runMigrations, schema as s, usingPglite } from "./db/index.js";
import { seed } from "./db/seed.js";
import { runDueRechecks } from "./services/linkService.js";
import { app } from "./app.js";

await runMigrations();
if ((await db.select().from(s.clients).limit(1)).length === 0) console.log("Empty database — seeded", await seed());
console.log(usingPglite ? "DB: embedded Postgres (PGlite) in ./data/pglite" : "DB: Postgres via DATABASE_URL");

cron.schedule("0 7 1 * *", () => { getAhrefsKey().then((k) => (k ? planAllClients(k) : [])).then((r) => console.log(`[cron] planned pages for ${r.length} clients`)).catch(console.error); });
cron.schedule("0 6 * * *", () => { runDueRechecks().then((r) => console.log(`[cron] rechecked ${r.length} links`)).catch(console.error); });
const port = Number(process.env.PORT ?? 8787);
app.listen(port, () => console.log(`API listening on http://localhost:${port}`));
