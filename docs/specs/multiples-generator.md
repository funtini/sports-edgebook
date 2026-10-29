# Multiples generator

Pure TypeScript in `src/domain/` (fully unit-tested). Picks from pending predictions in a date window (default: today) and returns legs, total odd, combined probability and expected value.

| Mode           | Ordering                                                                      |
| -------------- | ----------------------------------------------------------------------------- |
| `confidence`   | highest confidence level; tie-break highest odd                               |
| `value`        | highest value index (p × odd)                                                 |
| `highest_odds` | highest odd                                                                   |
| `lowest_odds`  | lowest odd                                                                    |
| `random`       | shuffle, optional seed to reproduce                                           |
| `target_odd`   | combination whose total odd is closest to the target, preferring better value |

Parameters: number of legs **or** target odd (with tolerance, e.g. ±10%), minimum confidence, min/max odd per leg, league and market filters, include non-punter only or all.

Rules:

- At most one leg per event (correlation; bookmakers often refuse same-game legs).
- `target_odd`: search in log space (sum of log(odd) towards log(target)) with beam search.
- Always show combined probability (product of leg probabilities, assuming independence) and EV = p × odd − 1.
- Regenerate, swap a leg manually, then save as simulated (`is_placed = false`) or placed (with stake).

## Engine

Code: `src/domain/generator.ts`, tests in `src/domain/__tests__/generator.spec.ts`. No Vue, no Supabase.

```ts
generateMultiple(candidates: Candidate[], params: GeneratorParams): GeneratedMultiple | null
swapLeg(current: GeneratedMultiple, legId: string, candidates: Candidate[], params: GeneratorParams): GeneratedMultiple | null
```

- `Candidate`: a pending prediction (`id`, `event_id`, `kickoff_at`, `league_id`, `market_id`, `odd`, the stored `probability`, `confidence`, `is_punter`).
- `GeneratorParams`: `mode`, `legs` (2–10), `targetOdd`, `tolerance` (default 0.10), `minConfidence`, `minOdd`, `maxOdd`, `leagueIds`, `marketIds`, `pool` (`all` default, or `non_punter`), `seed`.
- `GeneratedMultiple`: `legs`, `totalOdd` (`multipleOdd`), `probability` (product of leg probabilities), `ev` (`valueIndex(probability, totalOdd) − 1`), `withinTolerance`.

Rules:

1. **Filters first**: confidence ≥ `minConfidence`; `minOdd` ≤ odd ≤ `maxOdd` (inclusive); league in `leagueIds` (a prediction with no league is left out when the filter is set); market in `marketIds`; `non_punter` drops punter predictions.
2. **One leg per event**: ordering and random modes keep the first candidate of each event in their order; `target_odd` never combines two of the same event.
3. **Ordering**: `confidence` (level desc, odd desc), `value` (p × odd desc), `highest_odds`, `lowest_odds`. Ties: earlier kickoff, then id ascending, so results are deterministic.
4. **Random**: candidates sorted by kickoff and id, then a Fisher–Yates shuffle with mulberry32 seeded by `seed` (`Math.random` without one). Same seed and same candidates give the same multiple, whatever order they come in.
5. **Target odd**: beam search (width 50) over combinations in log space. With `legs` unset it tries 2–10 legs, keeping at each depth the states whose sum of log(odd) is closest to log(target); with `legs` set it builds exactly that many, steering each depth to its share of log(target). A total is within tolerance when `|total ÷ target − 1| ≤ tolerance`. Among results within tolerance the highest EV wins (then the closest); if none is within tolerance the closest in log space wins (then the highest EV), with `withinTolerance: false`. Legs come in kickoff order.
6. **Null**: fewer distinct events survive the filters than `legs` (2 for `target_odd` without `legs`).
7. **Invalid parameters throw `RangeError`**: `legs` missing (except `target_odd`), not a whole number or outside 2–10; `targetOdd` missing or ≤ 1 for `target_odd`; negative `tolerance`.
8. **Swap a leg**: the leg is replaced in place by a candidate that passes the same filters and whose event is not in the multiple (the swapped leg's event included, so a swap always changes game). Ordering modes take the top-ranked one; `random` picks one with the seeded PRNG; `target_odd` takes the one that gives the best result under rule 5. Null when no candidate is left or `legId` is not a leg.
