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
3. **Vercel**: import the GitHub repo (framework: Vite, defaults are fine; `vercel.json` is included). Add env vars: `DATABASE_URL`, `SESSION_SECRET` and `CRON_SECRET` (long random strings), `RESEND_API_KEY` (to email sign-in codes), and optionally `AHREFS_API_KEY`, `AI_API_KEY`, `AI_BASE_URL`, `AI_MODEL`.
4. Deploy. Sign-in is invite-only (email + 6-digit code); `ADMIN_EMAILS` become admins on first sign-in, and admins invite others on the **Users** page (use *Sign-in code* to hand over a code if email can't be delivered). Admins can change anything; users can see everything and add/verify their own links. Vercel Cron calls `/api/cron/recheck` daily at 06:00 UTC (Hobby plan allows daily crons; functions are capped at 60 s).

Schema changes: edit `server/db/schema.ts`, run `npm run db:generate`, commit the new migration, then `npm run db:migrate` against the target DB.

## Scripts
`dev` · `test` (Vitest: rules engine, verifier, role permissions) · `typecheck` · `build` · `db:generate` · `db:migrate` · `seed`

## Env vars
See `.env.example`.

## Layout
`server/services/rules.ts` is the pure, tested business-logic core. `verifier.ts` fetches/parses source pages; `linkService.ts` ties verifier + rules + DB; `ahrefs.ts` / `ai.ts` are external clients with offline fallbacks. `server/app.ts` is the Express app (served by `api/index.ts` on Vercel, by `server/index.ts` locally). Frontend in `src/`.

## Integrations
Ahrefs: paste the API key in **Settings** (stored encrypted). Donor traffic, DR and referring domains are looked up before each check; without a key links stay *Partly relevant* with "donor metrics not loaded" (no made-up numbers). AI without a key falls back to heuristics. HARO drafts are templates.

## Notes
Supabase's transaction pooler hangs on pipelined queries, so the Postgres client runs with `max_pipeline: 1` (see `server/db/index.ts`). Migrations are applied manually with `npm run db:migrate`.
