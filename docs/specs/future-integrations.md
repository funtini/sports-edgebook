# Future integrations (post-MVP)

Not built in the MVP, but the MVP must not block them.

## Fixtures search (phase 5)

Provider: API-Football (free plan: 100 requests/day, all endpoints). A scheduled Supabase Edge Function syncs upcoming fixtures for followed leagues once a day into `leagues`, `teams`, `events` (`source = 'api_football'`, `external_id`). Search runs against the local database, not the API. The API key lives only in the Edge Function.

## Reference odd (phase 5)

The Odds API (500 free credits/month) or API-Football odds. Neither covers Portuguese-licensed bookmakers (Betano.pt, Betclic.pt), so the value is a **market reference** (ideally Pinnacle), stored in `predictions.reference_odd`, `reference_bookmaker`, `reference_odd_at`. The user still enters the real odd.

## Game Analyser (phase 6)

Event screen enriched with: structured stats from the API (unavailable players, referee, last-3/last-5 corners and cards home/away, form) and AI sections via the Claude API with web search (summary of key points, weather, 3–4 press headlines summarised, per-game chat). Every AI fact carries a source link; numbers always come from the API. Results cached in a future `event_analyses` table (event_id, sections jsonb, sources, model, generated_at) and regenerated only on request. Prototype: https://claude.ai/artifact/BaAoTPyVQxKVRKevqpufpV

## What the MVP already reserves

1. `source` + `external_id` on `leagues`, `teams`, `events`.
2. `team_aliases` to match manual names with API names.
3. Reference-odd columns on `predictions`.
4. Game search behind an `EventSource` interface: local search in the MVP, API-backed later, same UI. Code: `src/domain/eventSource.ts` (`LocalEventSource` searches team names and aliases through the events store, upcoming games first).
5. An event screen exists from phase 1 (predictions for that game); the analyser fills it later.
