# Dashboard metrics

Every metric filters by period (day, week, month, custom) and scope (punter only, all predictions, multiples).

| Metric | Definition |
| --- | --- |
| Hit rate | won ÷ (won + lost); voids excluded |
| Break-even hit rate | mean of 1 ÷ odd over the bets |
| Edge | hit rate − break-even hit rate |
| P/L | sum of profit, in units or currency (see Units or euros) |
| Yield | P/L ÷ total staked (main metric to compare segments) |
| Bankroll ROI | P/L ÷ starting bankroll |
| Average odd | mean odd |
| Expected vs actual | sum of probabilities vs number of wins |
| Calibration | real hit rate per confidence level vs its anchor |
| CLV | odd ÷ closing odd − 1 |
| Max drawdown | largest drop from a peak of the cumulative P/L curve |
| Streaks | longest winning and losing streaks |

## Units or euros

The Dashboard has its own **Unidades / €** toggle. It starts from `user_settings.money_display` (set in Definições) and changing it on the Dashboard only affects the Dashboard view, without saving the setting. Values follow the same format as the rest of the app: units as a bare number (`+1,81`), euros as units × `unit_value` (`+36,20 €`). Ratios (yield, hit rate, ROI) are the same in both.

## Breakdowns

Market (category and name), league, team involved, odds band, confidence level, value-index band, bookmaker, weekday.

Default odds bands (configurable in `user_settings.odds_bands`): 1.01–1.49, 1.50–1.79, 1.80–2.19, 2.20–2.99, 3.00–4.99, 5.00+.

## Views

1. Summary: P/L, yield, hit rate, edge cards + cumulative P/L line.
2. Punter vs multiples: two cumulative P/L lines, yield and hit rate side by side.
3. Breakdowns: sortable table per dimension (n, hit rate, avg odd, yield, P/L) + yield bars.
4. Calibration: real vs expected hit rate per confidence level.
5. Calendar: daily P/L heatmap.

Segments with fewer than 30 bets are dimmed with a small-sample warning.

Charts: Apache ECharts via `vue-echarts`.
