import { describe, expect, it } from 'vitest'
import type { ConfidenceLevel } from '../confidence'
import type { BetType, Market } from '../markets'
import {
  breakdown,
  cumulativeSeries,
  hitRate,
  inPeriod,
  maxDrawdown,
  oddsBandOf,
  oddsBands,
  scope,
  streaks,
  summary,
  type Bet,
  type BreakdownRow,
} from '../metrics'
import type { BetStatus } from '../settlement'
import type { ValueBand } from '../value'

describe('hitRate', () => {
  it('excludes voids and pending', () => {
    expect(hitRate(['won', 'lost', 'void', 'pending', 'won'])).toBeCloseTo(2 / 3)
  })

  it('is null when nothing is won or lost', () => {
    expect(hitRate([])).toBeNull()
    expect(hitRate(['void', 'pending'])).toBeNull()
  })
})

/** Noon UTC, so the local day is the same in any European timezone. */
const day = (d: string) => `2026-10-${d}T12:00:00Z`

const single = (
  d: string,
  real: boolean,
  status: BetStatus,
  odd: number,
  stake: number,
  probability: number,
  confidence: ConfidenceLevel,
  valueBand: ValueBand,
  market: [Market, BetType],
  leagueName: string | null,
  teams: [string, string],
  bookmaker: string | null = null,
): Bet => ({
  kind: 'single',
  status,
  odd,
  stake,
  real,
  probability,
  date: day(d),
  market: market[0],
  betType: market[1],
  period: 'FT',
  leagueName,
  teams,
  confidence,
  valueBand,
  bookmaker,
})

const multiple = (
  d: string,
  real: boolean,
  status: BetStatus,
  odd: number,
  stake: number,
  probability: number,
): Bet => ({ kind: 'multiple', status, odd, stake, real, probability, date: day(d) })

const OVER: [Market, BetType] = ['goals', 'total']
const HOME: [Market, BetType] = ['result', '1x2']
const AWAY: [Market, BetType] = ['result', 'handicap']

/*
 * The Phase 2 gate: 21 bets, every number below worked out by hand.
 *
 *  #  day kind  real st  odd   stake p     conf band        market          league   P/L
 *  1  05  S     R    W   2.00  1     .55   2    favourable  Golos·Mais de   Liga     +1.00
 *  2  05  S     R    L   1.50  2     .65   3    neutral     1X2·Casa        Liga     -2.00
 *  3  05  S     -    W   1.80  1     .65   3    favourable  Golos·Mais de   Liga     +0.80
 *  4  06  S     R    W   2.50  1     .40   1    neutral     1X2·Fora        Premier  +1.50
 *  5  06  S     -    L   2.00  1     .55   2    favourable  Golos·Mais de   Premier  -1.00
 *  6  06  S     R    V   1.90  1     .55   2    neutral     Cantos·Mais de  Liga      0
 *  7  07  S     R    L   3.00  1     .40   1    favourable  1X2·Fora        Liga     -1.00
 *  8  07  S     R    L   1.25  4     .75   4    reduced     1X2·Casa        Liga     -4.00
 *  9  07  S     -    W   1.40  1     .75   4    neutral     Golos·Menos de  Premier  +0.40
 * 10  08  S     R    W   1.60  2     .65   3    neutral     1X2·Casa        Premier  +1.20
 * 11  08  S     -    P   2.20  1     .55   2    favourable  Golos·Mais de   Premier  (pending)
 * 12  09  S     R    W   5.00  0.5   .40   1    banger      1X2·Fora        (none)   +2.00
 * 13  09  S     -    L   1.70  1     .65   3    favourable  Golos·Mais de   Liga     -1.00
 * 14  10  S     R    W   1.30  3     .85   5    favourable  1X2·Casa        Premier  +0.90
 * 15  10  S     -    V   2.00  1     .55   2    favourable  Golos·Mais de   Premier   0
 * 16  12  S     R    L   2.20  1     .55   2    favourable  Golos·Mais de   Liga     -1.00
 * 17  05  M     R    W   3.60  1     .3575                                            +2.60
 * 18  07  M     -    L   2.10  1     .4875                                            -1.00
 * 19  09  M     R    V   1.00  2     .30                                               0
 * 20  10  M     -    W   2.08  1     .6375                                            +1.08
 * 21  20  S     R    W   2.00  1     .55   2    favourable  Golos·Mais de   Liga     (outside)
 *
 * Period 2026-10-05..2026-10-12 keeps 1–20.
 *
 * Punter (1 2 4 6 7 8 10 12 14 16): n 10, won 5 (1 4 10 12 14), lost 4 (2 7 8 16), void 1 (6).
 *   hit rate 5/9 = .555556
 *   Σ 1/odd = .5 + .666667 + .4 + .333333 + .8 + .625 + .2 + .769231 + .454545 = 4.748776
 *   break-even 4.748776/9 = .527642, edge .555556 − .527642 = .027914
 *   P/L 1 − 2 + 1.5 − 1 − 4 + 1.2 + 2 + .9 − 1 = −1.4
 *   staked 1 + 2 + 1 + 1 + 4 + 2 + .5 + 3 + 1 = 15.5 (void 6 left out), yield −1.4/15.5 = −.090323
 *   bankroll 50 → ROI −1.4/50 = −.028
 *   avg odd (2 + 1.5 + 2.5 + 3 + 1.25 + 1.6 + 5 + 1.3 + 2.2)/9 = 20.35/9 = 2.261111
 *   expected wins .55 + .65 + .4 + .4 + .75 + .65 + .4 + .85 + .55 = 5.2
 *
 * All singles (1–16, 11 pending): n 15, won 7 (1 3 4 9 10 12 14), lost 6 (2 5 7 8 13 16), void 2.
 *   hit rate 7/13 = .538462
 *   Σ 1/odd = 4.748776 + 1/1.8 + 1/2 + 1/1.4 + 1/1.7 = 4.748776 + 2.358077 = 7.106853
 *   break-even 7.106853/13 = .546681, edge −.008219
 *   P/L −1.4 + .8 − 1 + .4 − 1 = −2.2, staked 15.5 + 4 = 19.5, yield −.112821
 *   avg odd (20.35 + 1.8 + 2 + 1.4 + 1.7)/13 = 27.25/13 = 2.096154
 *   expected wins 5.2 + .65 + .55 + .75 + .65 = 7.8
 *
 * Multiples (17–20): n 4, won 2, lost 1, void 1. hit rate 2/3
 *   Σ 1/odd = .277778 + .476190 + .480769 = 1.234737, break-even .411579, edge .255088
 *   P/L 2.6 − 1 + 1.08 = 2.68, staked 3, yield .893333, avg odd 7.78/3 = 2.593333
 *   expected wins .3575 + .4875 + .6375 = 1.4825
 *
 * Punter running P/L, 04..13: 04 0 · 05 −1 (1, 2) · 06 .5 (4, 6) · 07 −4.5 (7, 8) · 08 −3.3 (10)
 *   · 09 −1.3 (12) · 10 −.4 (14) · 11 −.4 · 12 −1.4 (16) · 13 −1.4
 *   max drawdown: peak .5 on 06 to −4.5 on 07 = 5
 *
 * Streaks, by day then input order:
 *   punter W L W (6 void) L L W W W L → longest win 3, loss 2
 *   all    W L W W L (6) L L W W W L W (15) L → longest win 3, loss 3
 */
// One bet per line, as in the table above.
// prettier-ignore
const fixture: Bet[] = [
  single('05', true, 'won', 2, 1, 0.55, 2, 'favourable', OVER, 'Liga', ['Benfica', 'Porto'], 'Betano'),
  single('05', true, 'lost', 1.5, 2, 0.65, 3, 'neutral', HOME, 'Liga', ['Sporting', 'Braga'], 'Betano'),
  single('05', false, 'won', 1.8, 1, 0.65, 3, 'favourable', OVER, 'Liga', ['Benfica', 'Porto']),
  single('06', true, 'won', 2.5, 1, 0.4, 1, 'neutral', AWAY, 'Premier', ['Arsenal', 'Chelsea'], 'Bet365'),
  single('06', false, 'lost', 2, 1, 0.55, 2, 'favourable', OVER, 'Premier', ['Arsenal', 'Chelsea']),
  single('06', true, 'void', 1.9, 1, 0.55, 2, 'neutral', ['corners', 'total'], 'Liga', ['Benfica', 'Braga'], 'Betano'),
  single('07', true, 'lost', 3, 1, 0.4, 1, 'favourable', AWAY, 'Liga', ['Porto', 'Sporting'], 'Bet365'),
  single('07', true, 'lost', 1.25, 4, 0.75, 4, 'reduced', HOME, 'Liga', ['Porto', 'Sporting'], 'Betano'),
  single('07', false, 'won', 1.4, 1, 0.75, 4, 'neutral', ['goals', 'btts'], 'Premier', ['Liverpool', 'Arsenal']),
  single('08', true, 'won', 1.6, 2, 0.65, 3, 'neutral', HOME, 'Premier', ['Liverpool', 'Arsenal'], 'Bet365'),
  single('08', false, 'pending', 2.2, 1, 0.55, 2, 'favourable', OVER, 'Premier', ['Arsenal', 'Chelsea']),
  single('09', true, 'won', 5, 0.5, 0.4, 1, 'banger', AWAY, null, ['Braga', 'Benfica'], 'Betano'),
  single('09', false, 'lost', 1.7, 1, 0.65, 3, 'favourable', OVER, 'Liga', ['Braga', 'Benfica']),
  single('10', true, 'won', 1.3, 3, 0.85, 5, 'favourable', HOME, 'Premier', ['Chelsea', 'Liverpool'], 'Bet365'),
  single('10', false, 'void', 2, 1, 0.55, 2, 'favourable', OVER, 'Premier', ['Chelsea', 'Liverpool']),
  single('12', true, 'lost', 2.2, 1, 0.55, 2, 'favourable', OVER, 'Liga', ['Benfica', 'Porto'], 'Betano'),
  multiple('05', true, 'won', 3.6, 1, 0.3575),
  multiple('07', false, 'lost', 2.1, 1, 0.4875),
  multiple('09', true, 'void', 1, 2, 0.3),
  multiple('10', false, 'won', 2.08, 1, 0.6375),
  single('20', true, 'won', 2, 1, 0.55, 2, 'favourable', OVER, 'Liga', ['Benfica', 'Porto'], 'Betano'),
]

const period = inPeriod(fixture, '2026-10-05', '2026-10-12')
const punter = scope(period, 'punter')
const all = scope(period, 'all')
const multiples = scope(period, 'multiples')

/** Matches each number to 6 decimals. */
function close<T extends Record<string, number>>(expected: T): T {
  return Object.fromEntries(
    Object.entries(expected).map(([key, value]) => [key, expect.closeTo(value, 6)]),
  ) as T
}

describe('inPeriod', () => {
  it('keeps both ends of the period and drops the rest', () => {
    expect(period).toHaveLength(20)
    expect(period).not.toContain(fixture[20])
    expect(inPeriod(fixture, '2026-10-12', '2026-10-12')).toEqual([fixture[15]])
    expect(inPeriod(fixture, '2026-11-01', '2026-11-30')).toEqual([])
  })
})

describe('scope', () => {
  it('splits punter singles, every single and every multiple', () => {
    expect(punter.map((b) => fixture.indexOf(b) + 1)).toEqual([1, 2, 4, 6, 7, 8, 10, 12, 14, 16])
    expect(all.map((b) => fixture.indexOf(b) + 1)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16,
    ])
    expect(multiples.map((b) => fixture.indexOf(b) + 1)).toEqual([17, 18, 19, 20])
  })
})

describe('summary', () => {
  it('matches the hand-computed punter figures', () => {
    expect(summary(punter, { startingBankroll: 50 })).toEqual(
      close({
        n: 10,
        won: 5,
        lost: 4,
        void: 1,
        hitRate: 0.555556,
        breakEvenHitRate: 0.527642,
        edge: 0.027914,
        profit: -1.4,
        staked: 15.5,
        yield: -0.090323,
        bankrollRoi: -0.028,
        averageOdd: 2.261111,
        expectedWins: 5.2,
      }),
    )
  })

  it('matches the hand-computed figures for all singles', () => {
    expect(summary(all)).toEqual({
      bankrollRoi: null,
      ...close({
        n: 15,
        won: 7,
        lost: 6,
        void: 2,
        hitRate: 0.538462,
        breakEvenHitRate: 0.546681,
        edge: -0.008219,
        profit: -2.2,
        staked: 19.5,
        yield: -0.112821,
        averageOdd: 2.096154,
        expectedWins: 7.8,
      }),
    })
  })

  it('matches the hand-computed figures for multiples', () => {
    expect(summary(multiples, { startingBankroll: 100 })).toEqual(
      close({
        n: 4,
        won: 2,
        lost: 1,
        void: 1,
        hitRate: 0.666667,
        breakEvenHitRate: 0.411579,
        edge: 0.255088,
        profit: 2.68,
        staked: 3,
        yield: 0.893333,
        bankrollRoi: 0.0268,
        averageOdd: 2.593333,
        expectedWins: 1.4825,
      }),
    )
  })

  const empty = {
    n: 0,
    won: 0,
    lost: 0,
    void: 0,
    hitRate: null,
    breakEvenHitRate: null,
    edge: null,
    profit: 0,
    staked: 0,
    yield: null,
    bankrollRoi: null,
    averageOdd: null,
    expectedWins: 0,
  }

  it('gives nulls, not NaN, with nothing settled', () => {
    expect(summary([])).toEqual(empty)
    expect(summary([fixture[10]!])).toEqual(empty)
  })

  it('counts all-void bets without a hit rate or yield', () => {
    expect(summary([fixture[5]!, fixture[14]!], { startingBankroll: 50 })).toEqual({
      ...empty,
      n: 2,
      void: 2,
      bankrollRoi: 0,
    })
  })

  it('handles a single bet', () => {
    expect(summary([fixture[3]!], { startingBankroll: 20 })).toEqual(
      close({
        n: 1,
        won: 1,
        lost: 0,
        void: 0,
        hitRate: 1,
        breakEvenHitRate: 0.4,
        edge: 0.6,
        profit: 1.5,
        staked: 1,
        yield: 1.5,
        bankrollRoi: 0.075,
        averageOdd: 2.5,
        expectedWins: 0.4,
      }),
    )
  })

  it('has no bankroll ROI without a starting bankroll', () => {
    expect(summary(punter, { startingBankroll: 0 }).bankrollRoi).toBeNull()
    expect(summary(punter, { startingBankroll: null }).bankrollRoi).toBeNull()
  })
})

describe('cumulativeSeries', () => {
  const series = cumulativeSeries(punter, '2026-10-04', '2026-10-13')

  it('gives the running P/L per day, carrying days without bets', () => {
    expect(series.map((p) => p.day)).toEqual([
      '2026-10-04',
      '2026-10-05',
      '2026-10-06',
      '2026-10-07',
      '2026-10-08',
      '2026-10-09',
      '2026-10-10',
      '2026-10-11',
      '2026-10-12',
      '2026-10-13',
    ])
    expect(series.map((p) => p.profit)).toEqual(
      [0, -1, 0.5, -4.5, -3.3, -1.3, -0.4, -0.4, -1.4, -1.4].map((v) => expect.closeTo(v, 6)),
    )
  })

  it('counts only bets inside the period', () => {
    const late = cumulativeSeries(scope(fixture, 'punter'), '2026-10-12', '2026-10-20')
    expect(late[0]!.profit).toBeCloseTo(-1)
    expect(late[late.length - 1]!.profit).toBeCloseTo(0)
  })

  it('is empty for an invalid or reversed range', () => {
    expect(cumulativeSeries(punter, 'ontem', '2026-10-13')).toEqual([])
    expect(cumulativeSeries(punter, '2026-10-13', '2026-10-04')).toEqual([])
  })

  it('is flat at 0 with no bets', () => {
    expect(cumulativeSeries([], '2026-10-04', '2026-10-05')).toEqual([
      { day: '2026-10-04', profit: 0 },
      { day: '2026-10-05', profit: 0 },
    ])
  })
})

describe('maxDrawdown', () => {
  it('is the largest drop from a peak', () => {
    expect(maxDrawdown(cumulativeSeries(punter, '2026-10-04', '2026-10-13'))).toBeCloseTo(5)
  })

  it('measures from 0 when the curve starts down', () => {
    expect(maxDrawdown([{ day: '2026-10-05', profit: -2 }])).toBe(2)
  })

  it('is 0 for a rising curve or no data', () => {
    expect(maxDrawdown([])).toBe(0)
    expect(maxDrawdown(cumulativeSeries(multiples.slice(0, 1), '2026-10-05', '2026-10-06'))).toBe(0)
  })
})

describe('streaks', () => {
  it('matches the hand-computed runs', () => {
    expect(streaks(punter)).toEqual({ longestWin: 3, longestLoss: 2 })
    expect(streaks(all)).toEqual({ longestWin: 3, longestLoss: 3 })
  })

  it('orders by date before input order', () => {
    // Days shuffled, each day's bets kept in order.
    const shuffled = [...all.slice(6), ...all.slice(3, 6), ...all.slice(0, 3)]
    expect(streaks(shuffled)).toEqual({ longestWin: 3, longestLoss: 3 })
  })

  it('breaks same-day ties by input order', () => {
    const [w, l] = [fixture[0]!, fixture[1]!]
    expect(streaks([w, l, w])).toEqual({ longestWin: 1, longestLoss: 1 })
    expect(streaks([w, w, l])).toEqual({ longestWin: 2, longestLoss: 1 })
  })

  it('is 0 with nothing decided', () => {
    expect(streaks([])).toEqual({ longestWin: 0, longestLoss: 0 })
    expect(streaks([fixture[5]!, fixture[10]!])).toEqual({ longestWin: 0, longestLoss: 0 })
  })
})

describe('oddsBands', () => {
  const bands = oddsBands([1.5, 1.8, 2.2, 3, 5])

  it('turns the lower bounds into bands with an open top', () => {
    expect(bands.map((b) => [b.key, b.min, b.max])).toEqual([
      ['1.00', 1, 1.5],
      ['1.50', 1.5, 1.8],
      ['1.80', 1.8, 2.2],
      ['2.20', 2.2, 3],
      ['3.00', 3, 5],
      ['5.00', 5, null],
    ])
  })

  it('puts a bound in the band it opens', () => {
    expect(oddsBandOf(1.49, bands)?.key).toBe('1.00')
    expect(oddsBandOf(1.5, bands)?.key).toBe('1.50')
    expect(oddsBandOf(4.99, bands)?.key).toBe('3.00')
    expect(oddsBandOf(12, bands)?.key).toBe('5.00')
  })

  it('sorts and dedupes the bounds', () => {
    expect(oddsBands([2, 1.5, 2]).map((b) => b.key)).toEqual(['1.00', '1.50', '2.00'])
    expect(oddsBands([]).map((b) => b.key)).toEqual(['1.00'])
  })
})

const keysAndN = (rows: BreakdownRow[]) => rows.map((r) => [r.key, r.n])

describe('breakdown', () => {
  /*
   * All singles by league: Liga 1 2 3 6 7 8 13 16 (n 8), Premier 4 5 9 10 14 15 (n 6); 12 has none.
   *   Liga: won 1 3, lost 2 7 8 13 16 → 2/7; P/L 1 − 2 + .8 − 1 − 4 − 1 − 1 = −7.2; staked 11;
   *     yield −.654545; avg odd 13.45/7 = 1.921429; expected (.55+.65+.65+.4+.75+.65+.55)/7 = .6
   *   Premier: won 4 9 10 14, lost 5 → .8; P/L 1.5 − 1 + .4 + 1.2 + .9 = 3; staked 8; yield .375;
   *     avg odd 8.8/5 = 1.76; expected (.4+.55+.75+.65+.85)/5 = .64
   *   Liga + Premier + bet 12 = −7.2 + 3 + 2 = −2.2, the all-singles P/L.
   */
  it('matches the hand-computed league rows', () => {
    const [liga, premier, ...rest] = breakdown(all, 'league')
    expect(rest).toEqual([])
    expect(liga!).toEqual({
      key: 'Liga',
      smallSample: true,
      ...close({
        n: 8,
        hitRate: 0.285714,
        expectedHitRate: 0.6,
        averageOdd: 1.921429,
        yield: -0.654545,
        profit: -7.2,
      }),
    })
    expect(premier!).toEqual({
      key: 'Premier',
      smallSample: true,
      ...close({
        n: 6,
        hitRate: 0.8,
        expectedHitRate: 0.64,
        averageOdd: 1.76,
        yield: 0.375,
        profit: 3,
      }),
    })
  })

  /*
   * Teams (each bet counts for both): Benfica 1 3 6 12 13 16 (6), Porto 1 3 7 8 16 (5),
   * Arsenal / Braga / Chelsea / Liverpool 4 each, Sporting 2 7 8 (3).
   *   Benfica: won 1 3 12, lost 13 16 → .6; P/L 1 + .8 + 2 − 1 − 1 = 1.8; staked 4.5; yield .4;
   *     avg odd 12.7/5 = 2.54
   */
  it('counts a bet for both teams', () => {
    const rows = breakdown(all, 'team')
    expect(keysAndN(rows)).toEqual([
      ['Benfica', 6],
      ['Porto', 5],
      ['Arsenal', 4],
      ['Braga', 4],
      ['Chelsea', 4],
      ['Liverpool', 4],
      ['Sporting', 3],
    ])
    expect(rows[0]!).toEqual({
      key: 'Benfica',
      smallSample: true,
      ...close({
        n: 6,
        hitRate: 0.6,
        expectedHitRate: (0.55 + 0.65 + 0.4 + 0.65 + 0.55) / 5,
        averageOdd: 2.54,
        yield: 0.4,
        profit: 1.8,
      }),
    })
  })

  /*
   * Odds bands: 1.00 → 8 9 14; 1.50 → 2 10 13; 1.80 → 1 3 5 6 15; 2.20 → 4 16; 3.00 → 7; 5.00 → 12.
   *   1.80: won 1 3, lost 5 → 2/3; P/L .8; staked 3; yield .266667; avg odd 5.8/3 = 1.933333
   */
  it('groups by the odds bands from the settings', () => {
    const rows = breakdown(all, 'oddsBand', { oddsBands: [1.5, 1.8, 2.2, 3, 5] })
    expect(keysAndN(rows)).toEqual([
      ['1.80', 5],
      ['1.00', 3],
      ['1.50', 3],
      ['2.20', 2],
      ['3.00', 1],
      ['5.00', 1],
    ])
    expect(rows[0]!).toEqual({
      key: '1.80',
      smallSample: true,
      ...close({
        n: 5,
        hitRate: 0.666667,
        expectedHitRate: (0.55 + 0.65 + 0.55) / 3,
        averageOdd: 1.933333,
        yield: 0.266667,
        profit: 0.8,
      }),
    })
  })

  // Confidence 2: decided 1 5 16, won 1 → 1/3 vs .55; confidence 3: won 3 10 of 2 3 10 13 → .5 vs .65.
  it('gives real vs expected hit rate per confidence level', () => {
    const rows = breakdown(all, 'confidence')
    expect(keysAndN(rows)).toEqual([
      ['2', 5],
      ['3', 4],
      ['1', 3],
      ['4', 2],
      ['5', 1],
    ])
    expect(rows[0]!.hitRate).toBeCloseTo(1 / 3)
    expect(rows[0]!.expectedHitRate).toBeCloseTo(0.55)
    expect(rows[1]!.hitRate).toBeCloseTo(0.5)
    expect(rows[1]!.expectedHitRate).toBeCloseTo(0.65)
  })

  it('groups by value band, market and type, market and period', () => {
    expect(keysAndN(breakdown(all, 'valueBand'))).toEqual([
      ['favourable', 8],
      ['neutral', 5],
      ['banger', 1],
      ['reduced', 1],
    ])
    expect(keysAndN(breakdown(all, 'betType'))).toEqual([
      ['goals · total', 6],
      ['result · 1x2', 4],
      ['result · handicap', 3],
      ['corners · total', 1],
      ['goals · btts', 1],
    ])
    expect(keysAndN(breakdown(all, 'market'))).toEqual([
      ['goals', 7],
      ['result', 7],
      ['corners', 1],
    ])
    expect(keysAndN(breakdown(all, 'period'))).toEqual([['FT', 15]])
    const timing = breakdown(
      all.map((bet, i) => ({ ...bet, live: i < 4 })),
      'timing',
    )
    expect(keysAndN(timing)).toEqual([
      ['prematch', 11],
      ['live', 4],
    ])
  })

  // Betano 1 2 6 8 12 16: won 1 12 of 1 2 8 12 16 → .4; P/L 1 − 2 − 4 + 2 − 1 = −4; staked 8.5.
  it('skips bets without a bookmaker', () => {
    const rows = breakdown(all, 'bookmaker')
    expect(keysAndN(rows)).toEqual([
      ['Betano', 6],
      ['Bet365', 4],
    ])
    expect(rows[0]!.hitRate).toBeCloseTo(0.4)
    expect(rows[0]!.profit).toBeCloseTo(-4)
    expect(rows[0]!.yield).toBeCloseTo(-4 / 8.5)
  })

  // Mon 05 (1 2 3) + Mon 12 (16), Tue 06 (4 5 6), Wed 07 (7 8 9), Thu 08 (10), Fri 09 (12 13), Sat 10.
  it('groups by local weekday, 0 being Sunday', () => {
    expect(keysAndN(breakdown(all, 'weekday'))).toEqual([
      ['1', 4],
      ['2', 3],
      ['3', 3],
      ['5', 2],
      ['6', 2],
      ['4', 1],
    ])
  })

  it('leaves multiples out of every dimension', () => {
    expect(breakdown(multiples, 'league')).toEqual([])
    expect(breakdown(multiples, 'weekday')).toEqual([])
    expect(breakdown(multiples, 'oddsBand', { oddsBands: [1.5] })).toEqual([])
  })

  it('flags segments under 30 bets as a small sample', () => {
    const many = Array.from({ length: 30 }, () => fixture[0]!)
    expect(breakdown(many, 'league')[0]).toMatchObject({ key: 'Liga', n: 30, smallSample: false })
    expect(breakdown(many.slice(1), 'league')[0]).toMatchObject({ n: 29, smallSample: true })
  })

  it('is empty with nothing settled, and nulls for an all-void segment', () => {
    expect(breakdown([], 'league')).toEqual([])
    expect(breakdown([fixture[10]!], 'league')).toEqual([])
    expect(breakdown([fixture[5]!], 'league')).toEqual([
      {
        key: 'Liga',
        n: 1,
        hitRate: null,
        expectedHitRate: null,
        averageOdd: null,
        yield: null,
        profit: 0,
        smallSample: true,
      },
    ])
  })
})
