# Domain

## Prediction

A prediction is one pick on one event: event (kickoff, league, home team, away team), market (category + name), selection, optional line (e.g. 2.5 goals, 9.5 corners), odd, confidence level, punter flag, optional notes.

- **Punter on**: a single bet was placed. Requires `stake_units` and optionally `bookmaker`. Counts toward real profit.
- **Punter off**: history only, available to build multiples. Evaluated with a virtual stake of 1 unit.
- Both count toward hit rate.
- **Status**: `pending`, `won`, `lost`, `void`. Half-won/half-lost (Asian lines) is out of scope for now.
- **Closing odd** (optional): odd near kickoff, used for CLV.

Logging target: under 20 seconds per prediction on a phone. Autocomplete leagues, teams and markets from history; "duplicate" to add another market for the same game.

### Logging form (`/registo`)

1. **Jogo**: search through `LocalEventSource`; "Novo jogo" opens date, time, league (optional), home and away team, each autocompleted from history. The game, league and teams are created on save (`ensure*`). `?evento=<id>` preselects that game (used by the event screen); an unknown id is ignored.
2. **Mercado** (category) + **Tipo** (name), autocompleted from the user's markets; a new pair is created on save.
3. **Aposta** (selection) and optional **Linha**; **Odd** with a decimal keyboard, comma or dot. Linha has a ± button because the iOS decimal keypad has no minus key (handicap lines are often negative).
4. **Confiança**: five buttons with the level labels; the chosen level's probability and fair odd show beside the title. The **Índice de valor** card shows live once odd and confidence are set: band pill (short label, see Value index), the index, "odd X vs justa Y" and a bar from 0,80 to 1,30 with the neutral zone marked. The card takes the band's soft background and colour (neutral: surface + border).
5. **Aposta real (punter)**: when on, **Valor apostado** (typed in units, starts at 1, shown in the info colour; in euros mode its euro value shows beside it) and **Casa de apostas** (autocompleted from bookmakers used before).
6. **Notas**, collapsed by default.

Errors show inline, from `predictionFormSchema`, `marketFormSchema` and `newGameFormSchema` (home and away must differ, ignoring case and extra spaces). Database and network errors show a generic message. Saving shows "Prognóstico guardado" and clears the form except the game, marked "Mesmo jogo", so the next market for the same game is one tap away; "Outro jogo" clears it.

## Confidence levels

| Level | Label (UI) | Probability | Fair odd |
| --- | --- | --- | --- |
| 1 | Palpite | 40% | 2.50 |
| 2 | Moderada | 55% | 1.82 |
| 3 | Boa | 65% | 1.54 |
| 4 | Alta | 75% | 1.33 |
| 5 | Muito alta | 85% | 1.18 |

Anchors are per-user settings (`user_settings.confidence_anchors`). Each prediction stores the probability in force when it was logged. After ~100 settled predictions per level, the app shows the real hit rate per level and suggests recalibrating. Code: `src/domain/confidence.ts`.

## Value index

```
fair odd    = 1 / p
value index = p × odd
```

Five bands (`valueBand`), judged on the index rounded to 2 decimals, as it is shown:

| Band | Index | Row label (Hoje, Evento) | Pill (Registo) | Colour |
| --- | --- | --- | --- | --- |
| `banger` | > 1.35 | Banger 1,37 | Banger | purple |
| `favourable` | 1.06 – 1.35 | Favorável 1,20 | Favorável | pos |
| `neutral` | 0.95 – 1.05 | Neutro | Neutro | muted |
| `reduced` | 0.85 – 0.94 | Valor reduzido 0,90 | Desfavorável | amber |
| `no_value` | < 0.85 | Odd sem valor 0,77 | Sem valor | neg |

- Shown live in the logging form before saving, and on every prediction row as a pill in the band colours (see the prediction row in [ui.md](ui.md#prediction-row)).
- Labels and colours: `src/components/valueBands.ts`.
- Example: level 3 (65%) at 1.80 → 1.17 (favourable). Level 4 (75%) at 1.25 → 0.94 (reduced).

Code: `src/domain/value.ts`.

## Units and money

Everything is stored and computed in units; the base stake is 1 unit, and a bet may use any stake (0.5, 2...). `user_settings.unit_value` (default 10, typical 10/20/30/100) converts units to currency for display.

`user_settings.money_display` (`units` by default, or `euros`) chooses how money is shown. Every amount shows **one** value: units mode shows the bare number (`+1,81`, no "u"); euros mode shows units × `unit_value` (`+36,20 €`). Signed for profit, unsigned for stakes and balances, in the active language's format (EN: `+1.81`, `+€36.20`). It applies to Hoje, Evento and Registo; the Dashboard has its own toggle (see [metrics.md](metrics.md)). Code: `formatMoney` in `src/domain/money.ts`.

The settings screen (`/definicoes`) edits "Mostrar valores em: Unidades | Euros" (`money_display`), `unit_value` (quick picks 10, 20, 30, 100 € or any value) and the optional `starting_bankroll_units` (empty or 0 both save `null`, negative is rejected), all saved with "Guardar", and shows the confidence anchors read-only; editing them comes with calibration in phase 4. It also holds Aparência (language and theme, same preferences as the header toggles) and "Terminar sessão" (sign out); layout in [ui.md](ui.md#definições). The header reaches it through a gear icon (see [ui.md](ui.md)).

## Settlement

- Single: won → `stake × (odd − 1)`, lost → `−stake`, void → `0`.
- Multiple: lost if any leg lost; void legs count as odd 1.00; won when every non-void leg won; void if every leg is void.

Code: `src/domain/settlement.ts`.

A prediction's profit uses its real stake when it is a punter bet (punter flag on and a stake recorded) and 1 virtual unit otherwise (`stakeFor`, `predictionProfit`). Hit rate is `won ÷ (won + lost)`, voids and pending excluded (`src/domain/metrics.ts`).

## Today view

Route `/` ("Hoje"), the screen used every evening to settle the day.

- **Day**: selected with previous / next, or a date picker. Today has no query; any other day is `?dia=YYYY-MM-DD` (local date), so back/forward and links work. A malformed `dia` falls back to today and is dropped from the URL. The view follows the date past midnight when left open.
- **Games**: predictions of the day grouped by game, by kickoff. The game header links to `/eventos/:id`.
- **Settlement**: Ganho / Perdido / Nulo on each row; tapping the active one returns it to pending and clears `settled_at`. The row updates at once and rolls back with an error message if the save fails. Each row shows the amount staked and its result (see the prediction row in [ui.md](ui.md)); non-punter results are on 1 virtual unit and tagged "virtual".
- **Day summary**: "Lucro punter" (P/L of punter bets, one value per the money display) with the amount staked, "N de M liquidados", and tiles Prognósticos / Taxa de acerto / Em aberto. On desktop the summary is a strip with Apostado / Prognósticos / Ganhos / Taxa de acerto / Em aberto (see [ui.md](ui.md#hoje)).
- **Pendentes de dias anteriores**: amber banner with the count of pending predictions on games before the selected day, capped at today (a future day does not count today's games). Tapping it opens the day of the oldest one.
- **Empty day**: a button to `/registo`.
- **Shortcut**: pressing N opens `/registo`, except while typing in an input, textarea, select or editable element, or with Ctrl / Cmd / Alt held. The desktop "Novo prognóstico" button shows the hint.

Code: `src/views/TodayView.vue`, `src/components/PredictionRow.vue` and `src/composables/useSettlement.ts` (shared with the event screen), `src/domain/daySummary.ts`, `src/domain/days.ts`, `src/composables/useKeyShortcut.ts`.

## Event screen

Route `/eventos/:id`, one game. Phase 6 adds the Game Analyser below (see [future-integrations.md](future-integrations.md)); until then a placeholder card (`data-slot="game-analyser"`) holds its place.

- **Back link** "‹ Hoje".
- **Game card**: league, kickoff date and time, home and away teams with the score between them ("vs" until set), and the Resultado inputs.
- **Resultado** ("Casa" / "Fora"): home and away goals (whole numbers 0–99), saved to `events.home_score` / `away_score`. Both or neither: emptying both clears the score. Manual for now; phase 5 fills it from the API. Saving the score does not settle predictions.
- **Prognósticos** (count and settled): the game's predictions in logging order, with the same row and one-tap settlement as the today view. A dashed "+ Novo prognóstico" button opens `/registo?evento=<id>`.
- **Análise do jogo · Em breve**: placeholder card reserved for the Game Analyser.
- **Unknown or malformed id**: "Jogo não encontrado" with a link back to today.

Code: `src/views/EventView.vue`, `eventScoreSchema` / `scoreFormSchema` in `src/domain/schemas.ts`, `setScore` in `src/stores/events.ts`.

## Data model

See `supabase/migrations/`; row types in `src/types/db.ts`, input validation in `src/domain/schemas.ts`. Tables: `leagues`, `teams`, `team_aliases`, `events`, `markets`, `predictions`, `multiples`, `multiple_legs`, `user_settings`. There are no SQL views for metrics: the dashboard computes them in TypeScript from the rows it loads (see [metrics.md](metrics.md#engine)).

A new user's first settings load creates their `user_settings` row with defaults and seeds the default markets (`src/domain/markets.ts`): 1X2 (Casa, Empate, Fora), Dupla hipótese, Golos (Mais de, Menos de), Ambas marcam, Cantos (Mais de, Menos de), Cartões (Mais de, Menos de), Handicap. Leagues, teams and markets typed by hand reuse an existing row when the name matches ignoring case and extra spaces.
