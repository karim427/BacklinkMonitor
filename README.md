# Backlink Verify

Internal backlink QA & link-building tracker. Every backlink is checked against Stage 1 page approval, Checks A–C and a 26-rule reject list; only **Relevant** links count toward the monthly target, and links are re-verified at 30 days then every 90.

## Local setup

```bash
npm install
cp .env.example .env     # defaults work as-is
npm run dev              # API :8787 + web :5173
```

With `DATABASE_URL` empty the app uses an embedded Postgres (PGlite, stored in `./data/pglite`), migrated and seeded with fake data on first start. `npm run seed` resets it.

## Deploy: Supabase + Vercel

1. **Supabase** (free): create a project, then *Project Settings → Database → Connection string → Transaction pooler* and copy the URI (port 6543, replace `[YOUR-PASSWORD]`).
2. **Create the tables and demo data** from your machine:
   ```bash
   DATABASE_URL='postgresql://…pooler.supabase.com:6543/postgres' npm run db:migrate
   DATABASE_URL='…same…' npm run seed          # optional demo data
   ```
3. **Vercel**: import the GitHub repo (framework: Vite, defaults are fine; `vercel.json` is included). Add env vars: `DATABASE_URL`, `APP_PASSWORD`, `CRON_SECRET` (any long random string), and optionally `AHREFS_API_KEY`, `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`.
4. Deploy. The UI asks for `APP_PASSWORD`; Vercel Cron calls `/api/cron/recheck` daily at 06:00 UTC (Hobby plan allows daily crons; functions are capped at 60 s).

Schema changes: edit `server/db/schema.ts`, run `npm run db:generate`, commit the new migration, then `npm run db:migrate` against the target DB.

## Scripts
`dev` · `test` (Vitest: rules engine + verifier) · `typecheck` · `build` · `db:generate` · `db:migrate` · `seed`

## Env vars
See `.env.example`.

## Layout
`server/services/rules.ts` is the pure, tested business-logic core. `verifier.ts` fetches/parses source pages; `linkService.ts` ties verifier + rules + DB; `ahrefs.ts` / `ai.ts` are external clients with offline fallbacks. `server/app.ts` is the Express app (served by `api/index.ts` on Vercel, by `server/index.ts` locally). Frontend in `src/`.

## Stubbed / mocked
Ahrefs without a key (deterministic fake metrics), AI without a key (heuristics only), HARO template drafts, shared-password auth only (no per-user accounts).
