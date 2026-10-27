# Sports Edgebook

Personal betting journal: log predictions (odd, confidence, punter flag), generate multiples, and analyse performance (hit rate, yield, value) by market, league, team and odds band. Single user; UI in PT-PT (default) and EN via vue-i18n.

Specs live in `docs/specs/`. Read the spec for the area you touch before changing it; if your change alters behaviour described there, update the spec in the same PR.

## Stack

- Vue 3 (`<script setup>`, Composition API) + TypeScript + Vite
- Pinia (stores), Vue Router
- PrimeVue 4 (Aura theme) + Tailwind CSS 4 (`tailwindcss-primeui` for theme tokens). Stay on PrimeVue 4: v5 changed licence and needs a key.
- Supabase (Postgres, Auth via magic link, Row Level Security). Client in `src/lib/supabase.ts`; it is `null` when env vars are missing and the app then runs without auth.
- Zod for validation, Vitest for tests

## Commands

```sh
npm ci                 # install (Node 24, npm 11; install scripts allowed in package.json "allowScripts")
npm run dev            # local dev server
npm run lint:check     # oxlint + eslint, no fixes
npm run format:check   # prettier
npm run type-check     # vue-tsc
npm test               # vitest, single run
npm run build-only     # production build
```

CI runs all of the above on every PR. Run them before pushing.

## Layout

- `src/domain/`: pure TypeScript business rules (confidence anchors, value index, settlement, metrics, multiples generator). No Vue, no Supabase. Every function here has tests in `src/domain/__tests__/`.
- `src/stores/`: Pinia stores; the only place that talks to Supabase.
- `src/views/`: one view per route. `src/components/`: shared UI.
- `supabase/migrations/`: SQL migrations, timestamped, never edited after merge. Add a new migration instead.

## Conventions

- Code, identifiers, DB tables and commits in English. All user-facing text goes through vue-i18n (`src/locales/`), PT-PT is the default and EN must have the same keys; never hardcode UI strings or locales.
- Money is stored and computed in **units**; convert to currency only for display with `unit_value` from `user_settings`.
- A prediction stores the `probability` of its confidence level at logging time; never recompute past rows from current anchors.
- Every table has `user_id` + RLS policy `user_id = auth.uid()`. New tables must do the same.
- Columns marked `-- future` are reserved for the results/odds API (phase 5); keep them nullable and unused until then.
- Mobile-first for logging screens, desktop-first for the dashboard. Touch targets ≥ 44px.
- Keep PRs small: one issue, one PR. Do not merge; the owner reviews and merges.
- Never commit secrets. Only `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY` are used by the frontend; secret keys (`sb_secret_...`, legacy `service_role`) must never appear in this repo. `.env` holds the public URL and publishable key.
