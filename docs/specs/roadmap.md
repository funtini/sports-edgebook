# Roadmap

Each phase ends with a gate that must hold before moving on.

| Phase                        | Deliverables                                                                                                                                          | Gate                                                               |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 0 · Foundation               | Repo, CLAUDE.md, CI, Supabase schema, magic-link login, deploy to Cloudflare Pages                                                                    | Login works in production and an agent PR passes CI with a preview |
| 1 · Logging (MVP)            | Fast logging with autocomplete, value index, punter flag and stake, today view, one-tap settlement, event screen, PT/EN language and light/dark theme | Owner uses the app as the only log for 2 weeks                     |
| 2 · Dashboard v1             | KPIs, P/L curve, breakdowns, punter vs multiples, unit/currency toggle                                                                                | One week of metrics matches a manual calculation                   |
| 3 · Multiples generator      | Six modes, target odd, probability and EV, save simulated or placed                                                                                   | Unit tests cover every mode and settlement rule                    |
| 4 · Calibration and insights | Calibration per level, CLV, drawdown, calendar, small-sample warnings                                                                                 | ~300 settled predictions                                           |
| 5 · Fixtures and odds API    | Search games ("Benfica"), reference odd, automatic settlement                                                                                         | Log a prediction without typing teams or league                    |
| 6 · Game Analyser            | API stats, AI summary and news with sources, per-game chat                                                                                            | Cost per analysis measured and within budget                       |

Phases 2 and 3 are independent and can run in parallel.
