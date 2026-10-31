# Domain

## Prediction

A prediction is one pick on one event: event (kickoff, league, home team, away team), market, bet type, period, selection and line from the [market catalogue](#markets), pre-match or live, odd, confidence level, punter flag, optional notes.

- **Punter on**: a single bet was placed. Requires `stake_units` and optionally `bookmaker`. Counts toward real profit.
- **Punter off**: history only, available to build multiples. Evaluated with a virtual stake of 1 unit.
- Both count toward hit rate.
- **Status**: `pending`, `won`, `lost`, `void`. Half-won/half-lost (Asian lines) is out of scope for now.
- **Closing odd** (optional): odd near kickoff, used for CLV.
- **Pré-jogo / Live** (`is_live`): whether the prediction was logged before kickoff or with the game under way. Predictions logged before this field existed are pre-match.

Logging target: under 20 seconds per prediction on a phone. Autocomplete leagues and teams from history; "duplicate" to add another market for the same game.

### Logging form (`/registo`)

1. **Evento**: search through `LocalEventSource`. Until an event is picked or being created, only this step shows. **Novo evento** is offered in two places: at the end of the search results (and when nothing is found) as "+ Novo evento «typed text»", and as a link on the right of the "Evento" label. It opens date, time, league (optional), home and away team (the home team prefilled with what was typed), each autocompleted from history. Under the search, until something is typed, **Recentes** offers the 3 events with the most recently logged predictions that have no result yet, each with its prediction count (highlighted when the game is today); a tap picks it (`recentEvents`, `listRecentEvents`). The list is read again after each save, so a game just created shows there without a reload. The game, league and teams are created on save (`ensure*`). `?evento=<id>` preselects that game (used by the event screen); an unknown id is ignored.
2. **Pré-jogo / Live** (two-way switch): Live by default when the event's kickoff has passed, Pré-jogo otherwise; set again after each save. Then **Mercado** (chips, Resultado by default) → **Tipo** (chips: the types of that market, 1X2 by default; changing the market keeps the type when the market offers it, else picks its first) → **Período** (FT / HT / 2P, FT by default) → **Seleção** (chips with the sides of the type; a text field for type Outro; none for Total, whose side is picked in Linha) → **Linha**, shown only for totals and handicaps: − / + buttons either side of the field step it one unit (a total never below 0.5; a handicap steps its signed value; a blank line starts at 2.5 for totals, ±0.5 for handicaps) and the field still takes any typed line. Totals pick their side with an **Over / Under** switch (Over by default) before the − button, and the line is never signed; handicaps get a ± button after the + instead, because the iOS decimal keypad has no minus key. Changing the type clears the selection, and the line when the new type has none. See [Markets](#markets).
3. **Odd** with a decimal keyboard, comma or dot.
4. **Confiança**: five buttons with the level labels; the chosen level's probability and fair odd show beside the title. The **Índice de valor** card shows live once odd and confidence are set: band pill (short label, see Value index), the index, "odd X vs justa Y" and a bar from 0,80 to 1,30 with the neutral zone marked. The card takes the band's soft background and colour (neutral: surface + border).
5. **Aposta real (punter)**: when on, **Valor apostado** (typed in units, starts at 1, shown in the info colour; in euros mode its euro value shows beside it) and **Casa de apostas** (autocompleted from bookmakers used before).
6. **Notas**, collapsed by default.

Errors show inline, from `predictionFormSchema` and `newGameFormSchema` (home and away must differ, ignoring case and extra spaces). Database and network errors show a generic message. Saving shows "Prognóstico guardado" and clears the form except the event, marked "Mesmo evento", so the next market for the same game is one tap away; "Outro evento" clears it.

## Markets

What a prediction bets on comes from a fixed catalogue (`src/domain/markets.ts`), stored as codes in `predictions.market`, `bet_type`, `period`, `selection` and `line` and shown through `catalogue.*` messages. Only the selection of type **Outro** is free text.

| Mercado (`market`) | Tipos (`bet_type`) |
| --- | --- |
| Resultado (`result`): who wins | 1X2, Dupla hipótese, Handicap, Resultado + Total, Outro |
| Golos (`goals`): how many goals | Total, Total da equipa, Ambas marcam, Outro |
| Cantos (`corners`), Cartões amarelos (`yellow_cards`), Cartões (`cards`) | 1X2, Handicap, Total, Total da equipa, Outro |

| Tipo | Seleção (stored) | Linha |
| --- | --- | --- |
| 1X2 (`1x2`) | V1 / X / V2 (`home`, `draw`, `away`; EN W1 / X / W2) | none |
| Dupla hipótese (`double_chance`) | 1X / X2 / 12 (`1x`, `x2`, `12`) | none |
| Handicap (`handicap`) | V1 / V2 | signed, steps of 0.5 (−1.5, 1, 0.5…); a whole line that ends level is settled Nulo |
| Resultado + Total (`result_total`) | 1, X, 2, 1X, X2 or 12 with over / under of the goals line (`x2_under`) | the total, steps of 0.5 |
| Total (`total`) | over / under, from the Over / Under switch | steps of 0.5 |
| Total da equipa (`team_total`) | V1 / V2 with over / under (`home_over`) | steps of 0.5 |
| Ambas marcam (`btts`) | Sim / Não (`yes`, `no`) | none |
| Outro (`other`) | free text | none |

- **Período** (`period`): FT (regular time), HT (first half), 2P (second half). It applies to every type, so "home team winning at half time" is Resultado · 1X2 · HT · V1 and "corner winner in the first half" is Cantos · 1X2 · HT · V1.
- **Team 1 / 2** is in the selection (V1 / V2); there is no team field.
- **Totals** are typed unsigned with the side from the Over / Under switch, and stored unsigned with the side in the selection (`toStoredPick` / `fromStoredPick`, which carry the side as the line's sign in between). Handicap lines keep their sign.
- **Summary** of a bet, used on prediction rows: Mercado - Tipo - Período - Seleção (`pickSummary`), e.g. "Resultado - 1X2 - HT - V1", "Golos - Total - FT - O 2,5", "Resultado - Handicap - FT - V1 −1,5", "Resultado - Resultado + Total - FT - X2 U 4,5". A total's side is **O** (over) or **U** (under) in every language (`OVER_UNDER_MARK`).
- Bookmaker slips follow the same split: market and period in the event name ("Corners Chelsea - Corners Manchester United 1st half"), type and selection in the bet ("1X2: W1"), which is Cantos · 1X2 · HT · V1. This is what a future slip reader maps to.

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
- A multiple's status always follows its legs (`multipleStatus` over each leg's prediction status, at `odd_at_selection`). Profit = stake × (effective odd − 1) when won, the effective odd from `multipleOdd` (void legs at 1.00); −stake when lost; 0 when void. A placed multiple uses its stake, a simulated one 1 virtual unit. Whenever saved multiples load (Guardadas, Hoje), the store writes `multiples.status` when it differs from the legs, setting `settled_at` when it leaves pending (keeping the first one) and clearing it back to pending; a failed write is retried on the next load. So settling a leg on Hoje updates its multiples on the next load.

Code: `src/domain/settlement.ts`, `src/domain/savedMultiples.ts`.

A prediction's profit uses its real stake when it is a punter bet (punter flag on and a stake recorded) and 1 virtual unit otherwise (`stakeFor`, `predictionProfit`). Hit rate is `won ÷ (won + lost)`, voids and pending excluded (`src/domain/metrics.ts`).

## Today view

Route `/` ("Hoje"), the screen used every evening to settle the day.

- **Day**: selected with previous / next, or a date picker. Today has no query; any other day is `?dia=YYYY-MM-DD` (local date), so back/forward and links work. A malformed `dia` falls back to today and is dropped from the URL. The view follows the date past midnight when left open.
- **Games**: predictions of the day grouped by game, by kickoff. The game header links to `/eventos/:id`.
- **Settlement**: Ganho / Perdido / Nulo on each row; tapping the active one returns it to pending and clears `settled_at`. The row updates at once and rolls back with an error message if the save fails. Each row shows the amount staked and its result (see the prediction row in [ui.md](ui.md)); non-punter results are on 1 virtual unit and tagged "virtual".
- **Day summary**: "Lucro punter" (P/L of punter bets, one value per the money display) with the amount staked, "N de M liquidados", and tiles Prognósticos / Taxa de acerto / Em aberto. On desktop the summary is a strip with Apostado / Prognósticos / Ganhos / Taxa de acerto / Em aberto (see [ui.md](ui.md#hoje)).
- **Múltiplas do dia**: when placed multiples have their first leg on the selected day, a line in the summary with their count and the P/L of the settled ones ("Por resolver" until one is), linking to `/multiplas?vista=guardadas`. If multiples fail to load, the line is left out.
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

See `supabase/migrations/`; row types in `src/types/db.ts`, input validation in `src/domain/schemas.ts`. Tables: `leagues`, `teams`, `team_aliases`, `events`, `markets` (legacy, see below), `predictions`, `multiples` (`origin` `manual` / `generated` / `mixed`), `multiple_legs` (`origin` `manual` / `generated`, `odd_at_selection`), `user_settings`. There are no SQL views for metrics: the dashboard computes them in TypeScript from the rows it loads (see [metrics.md](metrics.md#engine)).

A new user's first settings load creates their `user_settings` row with defaults. Leagues and teams typed by hand reuse an existing row when the name matches ignoring case and extra spaces.

`markets` and `predictions.market_id` held the free-text markets (category + name) used before the [market catalogue](#markets). Migration `20261030000000_market_catalogue` converted every existing prediction to the catalogue (a pick it could not read with certainty became type Outro, with the old category, name and selection as its text); new predictions leave `market_id` empty and nothing reads `markets` any more. Both are dropped in a later migration once the conversion is checked.
