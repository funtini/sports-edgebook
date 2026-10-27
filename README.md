# Sports Edgebook

Personal betting journal and performance dashboard. Vue 3 + TypeScript + Supabase.

Log predictions with odds and confidence, generate multiples, and track hit rate, yield and value by market, league and odds band. Specs are in [`docs/specs/`](docs/specs/README.md); conventions for humans and AI agents are in [`CLAUDE.md`](CLAUDE.md).

## Run locally

Requires Node 22.18+ or 24.12+.

```sh
npm ci
npm run dev
```

`.env` points at the project's Supabase instance. Create `.env.local` (see `.env.example`) to use another one.

## Database

Migrations live in `supabase/migrations/`. Until migrations run from CI, apply a new migration by pasting it into the Supabase SQL Editor.

## Checks

```sh
npm run lint:check && npm run format:check && npm run type-check && npm test && npm run build-only
```

## Deploy

Cloudflare Workers (static assets) builds from this repo on every push: `main` goes to production, other branches get a preview URL. Config is in `wrangler.jsonc`.

| Setting | Value |
| --- | --- |
| Build command | `npm run build-only` |
| Deploy command | `npx wrangler deploy` |
| Preview command (non-production branches) | `npx wrangler preview` |
| Build variable | `NODE_VERSION` = `24` |
