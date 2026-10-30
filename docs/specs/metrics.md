# Dashboard metrics

Every metric filters by period and scope (punter only, all predictions, multiples). The Dashboard's periods (`src/domain/periods.ts`) end today and start on Monday of this week (**Semana**), the 1st of this month (**Mês**), 1 January (**Ano**), or the earliest settled bet (**Tudo**).

| Metric | Definition |
| --- | --- |
| Hit rate | won ÷ (won + lost); voids excluded |
| Break-even hit rate | mean of 1 ÷ odd over won and lost |
| Edge | hit rate − break-even hit rate |
| P/L | sum of profit, in units or currency (see Units or euros) |
| Yield | P/L ÷ total staked on won and lost; a void stake is handed back (main metric to compare segments) |
| Bankroll ROI | P/L ÷ starting bankroll; none without one |
| Average odd | mean odd over won and lost |
| Expected vs actual | sum of probabilities vs number of wins, over won and lost |
| Calibration | real hit rate per confidence level vs the mean stored probability of its bets |
| CLV | odd ÷ closing odd − 1 |
| Max drawdown | largest drop from a peak of the cumulative P/L curve |
| Streaks | longest winning and losing streaks, by date then logging order; voids neither extend nor break a streak |

Pending bets count in none of them. A metric with nothing to measure (no won or lost bet, nothing staked) is empty, never 0 or NaN.

## Engine

Metrics are computed in TypeScript, not SQL views: a single user has thousands of rows at most, and this keeps every formula under test. Code: `src/domain/metrics.ts`.

Every function reads one `Bet` shape, built from either a single or a multiple:

- **Single**: its odd, its stake (`stakeFor`: real for punter bets, 1 virtual unit otherwise), stored probability, kickoff, and the breakdown dimensions.
- **Multiple**: its effective odd (void legs at 1.00), stake (1 virtual unit when simulated), the product of leg probabilities and the first leg's kickoff. No breakdown dimensions.

The date of a bet is its kickoff, not when it was settled; periods and days are local.

Mapping: `betFromPrediction` and `betFromMultiple` in `src/domain/bets.ts`. A multiple's status and effective odd are worked out from its legs' current statuses (`multipleStatus`, `multipleOdd` on `odd_at_selection`), so settling a leg on Hoje shows on the Dashboard on the next load. `src/stores/bets.ts` loads the settled predictions of the period (paging past PostgREST's 1000-row cap) and every multiple with its legs.

| Function | Gives |
| --- | --- |
| `scope(bets, s)` | `punter`: real singles; `all`: every single (non-punter on 1 virtual unit); `multiples`: every multiple, placed and simulated |
| `inPeriod(bets, from, to)` | bets whose local day is within `from`..`to` (`YYYY-MM-DD`, both included) |
| `summary(bets, { startingBankroll })` | n (settled), won, lost, void, hit rate, break-even, edge, P/L, staked, yield, bankroll ROI, average odd, expected wins |
| `cumulativeSeries(bets, from, to)` | running P/L per day; days without bets carry the previous value |
| `maxDrawdown(series)` | largest drop from a peak of that series, starting from 0 |
| `streaks(bets)` | longest winning and losing runs |
| `breakdown(bets, dimension, { oddsBands })` | one row per segment: n, hit rate, expected hit rate, average odd, yield, P/L, small sample; by n, largest first |

## Units or euros

The Dashboard has its own **Unidades / €** toggle. It starts from `user_settings.money_display` (set in Definições) and changing it on the Dashboard only affects the Dashboard view, without saving the setting. Values follow the same format as the rest of the app: units as a bare number (`+1,81`), euros as units × `unit_value` (`+36,20 €`). Ratios (yield, hit rate, ROI) are the same in both.

## Breakdowns

Market and type, market, period, league, team involved (a bet counts for both teams), odds band, confidence level, value-index band, bookmaker, weekday (local). Breakdowns are for singles; a bet without a value for the dimension (no league, no bookmaker) is left out of it.

Default odds bands (configurable in `user_settings.odds_bands`, which holds the lower bounds 1.50, 1.80, 2.20, 3.00, 5.00): 1.01–1.49, 1.50–1.79, 1.80–2.19, 2.20–2.99, 3.00–4.99, 5.00+. A bound opens its band (2.20 is in 2.20–2.99).

## Views

1. Summary: P/L, yield, hit rate, edge cards + cumulative P/L line.
2. Punter vs multiples: two cumulative P/L lines, yield and hit rate side by side.
3. Breakdowns: sortable table per dimension (n, hit rate, avg odd, yield, P/L) + yield bars.
4. Calibration: real vs expected hit rate per confidence level.
5. Calendar: daily P/L heatmap.

Segments with fewer than 30 settled bets are dimmed with a small-sample warning.

Charts: Apache ECharts via `vue-echarts`.
