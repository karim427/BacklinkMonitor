# Backlink Verify

Internal backlink QA & link-building tracker. Every backlink is checked against Stage 1 page approval, Checks A–C and a 26-rule reject list; only **Relevant** links count toward the monthly target, and links are re-verified at 30 days then every 90.

## Setup

```bash
npm install
cp .env.example .env     # fill in keys you have; all are optional for local use
npm run dev              # API on :8787, web on :5173 (proxied /api)
```

The SQLite DB (`./data/backlink-verify.db`) is created, migrated and seeded with fake data (15 clients, 9 donors, 12 links…) on first start. Re-seed any time with `npm run seed` (wipes data).

| Script | What it does |
| --- | --- |
| `npm run dev` | API + Vite together |
| `npm test` | Vitest — rules engine (all 26 reject rules, verdicts, counting, Stage 1, Check A, rechecks, anchor mix, NAP) and verifier |
| `npm run typecheck` / `npm run build` | tsc / production bundle |
| `npx drizzle-kit generate` | new migration after editing `server/db/schema.ts` |

## Env vars
`AHREFS_API_KEY` (donor metrics; mock data when empty) · `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` (default `glm-4.6`, OpenAI-compatible) · `VERIFIER_USER_AGENT` · `PORT` · `DATABASE_URL`.

## Layout
`server/services/rules.ts` is the business-logic core (pure, tested). `verifier.ts` fetches and parses the source page; `linkService.ts` ties verifier + rules + DB; `ahrefs.ts` / `ai.ts` are the external clients with offline fallbacks. Frontend: `src/pages`, `src/features`, `src/components/ui`.

## Stubbed / mocked
See the end of the build summary; in short: Ahrefs without a key, AI without a key (heuristics), HARO parsing fallback, no auth, in-process cron only.
