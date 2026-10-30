import type { ConfidenceLevel } from './confidence'
import { addDays, fromDayKey, toDayKey } from './days'
import { betProfit, type BetStatus } from './settlement'
import type { BetType, Market, MatchPeriod } from './markets'
import type { ValueBand } from './value'

/** won ÷ (won + lost); voids and pending excluded. Null when nothing counts yet. */
export function hitRate(statuses: BetStatus[]): number | null {
  const won = statuses.filter((s) => s === 'won').length
  const lost = statuses.filter((s) => s === 'lost').length
  return won + lost === 0 ? null : won / (won + lost)
}

/** One single or multiple, as every dashboard metric reads it. Money in units. */
export interface Bet {
  kind: 'single' | 'multiple'
  status: BetStatus
  /** Multiples: effective odd (void legs at 1.00). */
  odd: number
  /** Non-punter singles and simulated multiples: 1 virtual unit. */
  stake: number
  /** Punter single or placed multiple. */
  real: boolean
  /** Multiples: product of the leg probabilities. */
  probability: number
  /** Event kickoff (singles) or first leg kickoff (multiples), ISO. */
  date: string
  // Dimensions: singles only, left out on multiples.
  market?: Market
  betType?: BetType
  period?: MatchPeriod
  /** Logged with the game under way. */
  live?: boolean
  leagueName?: string | null
  teams?: string[]
  confidence?: ConfidenceLevel
  valueBand?: ValueBand
  bookmaker?: string | null
}

export type Scope = 'punter' | 'all' | 'multiples'

/** punter: real singles; all: every single; multiples: real and simulated multiples. */
export function scope(bets: Bet[], which: Scope): Bet[] {
  switch (which) {
    case 'punter':
      return bets.filter((b) => b.kind === 'single' && b.real)
    case 'all':
      return bets.filter((b) => b.kind === 'single')
    case 'multiples':
      return bets.filter((b) => b.kind === 'multiple')
  }
}

/** Local `YYYY-MM-DD` of a bet's date. */
function dayOf(bet: Bet): string {
  return toDayKey(new Date(bet.date))
}

/** Bets whose local day is within `from`..`to` (`YYYY-MM-DD`, both included). */
export function inPeriod(bets: Bet[], from: string, to: string): Bet[] {
  return bets.filter((b) => {
    const day = dayOf(b)
    return day >= from && day <= to
  })
}

/** Won or lost: the bets that hit rate, staked, odds and probabilities are measured on. */
const decided = (b: Bet) => b.status === 'won' || b.status === 'lost'

const settled = (b: Bet) => b.status !== 'pending'

const sum = (values: number[]) => values.reduce((total, v) => total + v, 0)

const mean = (values: number[]) => (values.length === 0 ? null : sum(values) / values.length)

const profitOf = (b: Bet) => betProfit(b.stake, b.odd, b.status) ?? 0

export interface Summary {
  /** Settled bets: won + lost + void. */
  n: number
  won: number
  lost: number
  void: number
  hitRate: number | null
  /** Mean of 1 ÷ odd over won and lost. */
  breakEvenHitRate: number | null
  /** hitRate − breakEvenHitRate. */
  edge: number | null
  profit: number
  /** Units staked on won and lost; a void stake is handed back. */
  staked: number
  /** profit ÷ staked. */
  yield: number | null
  /** profit ÷ starting bankroll; null without one. */
  bankrollRoi: number | null
  /** Mean odd over won and lost. */
  averageOdd: number | null
  /** Σ probability over won and lost, to compare with `won`. */
  expectedWins: number
}

export function summary(
  bets: Bet[],
  { startingBankroll = null }: { startingBankroll?: number | null } = {},
): Summary {
  const counted = bets.filter(decided)
  const won = counted.filter((b) => b.status === 'won').length
  const lost = counted.length - won
  const voids = bets.filter((b) => b.status === 'void').length
  const rate = hitRate(counted.map((b) => b.status))
  const breakEven = mean(counted.map((b) => 1 / b.odd))
  const profit = sum(counted.map(profitOf))
  const staked = sum(counted.map((b) => b.stake))
  return {
    n: won + lost + voids,
    won,
    lost,
    void: voids,
    hitRate: rate,
    breakEvenHitRate: breakEven,
    edge: rate == null || breakEven == null ? null : rate - breakEven,
    profit,
    staked,
    yield: staked === 0 ? null : profit / staked,
    bankrollRoi: startingBankroll ? profit / startingBankroll : null,
    averageOdd: mean(counted.map((b) => b.odd)),
    expectedWins: sum(counted.map((b) => b.probability)),
  }
}

export interface SeriesPoint {
  /** Local `YYYY-MM-DD`. */
  day: string
  /** Running P/L in units at the end of the day. */
  profit: number
}

/**
 * Running P/L, one point per day from `from` to `to` (both included); days without settled bets
 * carry the previous value. Only bets within the period count. Empty for an invalid range.
 */
export function cumulativeSeries(bets: Bet[], from: string, to: string): SeriesPoint[] {
  const start = fromDayKey(from)
  const end = fromDayKey(to)
  if (!start || !end) return []
  const byDay = new Map<string, number>()
  for (const bet of inPeriod(bets, from, to).filter(settled)) {
    const day = dayOf(bet)
    byDay.set(day, (byDay.get(day) ?? 0) + profitOf(bet))
  }
  const points: SeriesPoint[] = []
  let running = 0
  for (let date = start; date <= end; date = addDays(date, 1)) {
    const day = toDayKey(date)
    running += byDay.get(day) ?? 0
    points.push({ day, profit: running })
  }
  return points
}

/** Largest drop from a peak of the running P/L, in units (≥ 0). The curve starts at 0. */
export function maxDrawdown(series: SeriesPoint[]): number {
  let peak = 0
  let drawdown = 0
  for (const { profit } of series) {
    peak = Math.max(peak, profit)
    drawdown = Math.max(drawdown, peak - profit)
  }
  return drawdown
}

export interface Streaks {
  longestWin: number
  longestLoss: number
}

/** Longest runs of won and of lost bets, by date then input order; voids neither extend nor break. */
export function streaks(bets: Bet[]): Streaks {
  const ordered = bets
    .map((bet, index) => ({ bet, index, time: Date.parse(bet.date) }))
    .filter(({ bet }) => decided(bet))
    .sort((a, b) => a.time - b.time || a.index - b.index)
  const result: Streaks = { longestWin: 0, longestLoss: 0 }
  let run = 0
  let previous: BetStatus | null = null
  for (const { bet } of ordered) {
    run = bet.status === previous ? run + 1 : 1
    previous = bet.status
    if (bet.status === 'won') result.longestWin = Math.max(result.longestWin, run)
    else result.longestLoss = Math.max(result.longestLoss, run)
  }
  return result
}

/** Default `user_settings.odds_bands`: the lower bounds of the bands above the first. */
export const DEFAULT_ODDS_BANDS: readonly number[] = [1.5, 1.8, 2.2, 3, 5]

export interface OddsBand {
  /** `min` with two decimals, used as the breakdown key. */
  key: string
  /** Included. */
  min: number
  /** Excluded; null for the open top band. */
  max: number | null
}

/**
 * Bands from `user_settings.odds_bands` (ascending lower bounds): [1.5, 1.8] gives
 * below 1.50, 1.50–1.79 and 1.80+.
 */
export function oddsBands(bounds: number[]): OddsBand[] {
  const sorted = [...new Set(bounds)].filter((b) => b > 1).sort((a, b) => a - b)
  const mins = [1, ...sorted]
  return mins.map((min, i) => ({ key: min.toFixed(2), min, max: mins[i + 1] ?? null }))
}

export function oddsBandOf(odd: number, bands: OddsBand[]): OddsBand | undefined {
  let found: OddsBand | undefined
  for (const band of bands) if (odd >= band.min) found = band
  return found
}

export type Dimension =
  | 'market'
  | 'betType'
  | 'period'
  | 'timing'
  | 'league'
  | 'team'
  | 'oddsBand'
  | 'confidence'
  | 'valueBand'
  | 'bookmaker'
  | 'weekday'

/** Segments below this many settled bets are dimmed with a small-sample warning. */
export const SMALL_SAMPLE = 30

export interface BreakdownRow {
  /**
   * Segment: the code or name as stored (bet type is `market · period · bet_type`, timing `prematch` or `live`), the odds band's `key`, the
   * confidence level or value band, or the local weekday `0` (Sunday) to `6`.
   */
  key: string
  /** Settled bets: won + lost + void. */
  n: number
  hitRate: number | null
  /** Mean probability over won and lost: the hit rate the anchors expect (calibration). */
  expectedHitRate: number | null
  averageOdd: number | null
  yield: number | null
  profit: number
  smallSample: boolean
}

/** Segment keys of a bet; empty when it has no value for the dimension (e.g. any multiple). */
function keysOf(bet: Bet, dimension: Dimension, bands: OddsBand[]): string[] {
  const present = (value: string | number | null | undefined) =>
    value == null || value === '' ? [] : [String(value)]
  switch (dimension) {
    case 'market':
      return present(bet.market)
    case 'betType':
      // Market, period and type: a first-half 1X2 is not a full-time one. No period counts as FT.
      return bet.market && bet.betType
        ? [`${bet.market} · ${bet.period ?? 'FT'} · ${bet.betType}`]
        : []
    case 'period':
      return present(bet.period)
    case 'timing':
      return bet.live == null ? [] : [bet.live ? 'live' : 'prematch']
    case 'league':
      return present(bet.leagueName)
    case 'team':
      // A bet counts once for each team involved.
      return [...new Set(bet.teams ?? [])]
    case 'oddsBand':
      return bet.kind === 'single' ? present(oddsBandOf(bet.odd, bands)?.key) : []
    case 'confidence':
      return present(bet.confidence)
    case 'valueBand':
      return present(bet.valueBand)
    case 'bookmaker':
      return present(bet.bookmaker)
    case 'weekday':
      return bet.kind === 'single' ? [String(new Date(bet.date).getDay())] : []
  }
}

/** Settled bets per segment of `dimension`, sorted by n (desc), then key. */
export function breakdown(
  bets: Bet[],
  dimension: Dimension,
  { oddsBands: bounds = [] }: { oddsBands?: number[] } = {},
): BreakdownRow[] {
  const bands = oddsBands(bounds)
  const segments = new Map<string, Bet[]>()
  for (const bet of bets.filter(settled)) {
    for (const key of keysOf(bet, dimension, bands)) {
      const segment = segments.get(key)
      if (segment) segment.push(bet)
      else segments.set(key, [bet])
    }
  }
  return [...segments]
    .map(([key, segment]): BreakdownRow => {
      const s = summary(segment)
      return {
        key,
        n: s.n,
        hitRate: s.hitRate,
        expectedHitRate: mean(segment.filter(decided).map((b) => b.probability)),
        averageOdd: s.averageOdd,
        yield: s.yield,
        profit: s.profit,
        smallSample: s.n < SMALL_SAMPLE,
      }
    })
    .sort((a, b) => b.n - a.n || a.key.localeCompare(b.key))
}
