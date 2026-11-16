import { runMigrations } from "./index.js";
runMigrations().then(() => { console.log("Migrations applied"); process.exit(0); }).catch((e) => { console.error(e); process.exit(1); });
