import { describe, expect, it } from 'vitest'
import {
  generateMultiple,
  mulberry32,
  swapLeg,
  type Candidate,
  type GeneratorParams,
} from '../generator'

let counter = 0
const pick = (overrides: Partial<Candidate> = {}): Candidate => {
  counter += 1
  const id = overrides.id ?? `p${String(counter).padStart(2, '0')}`
  return {
    id,
    event_id: `e-${id}`,
    kickoff_at: '2026-10-28T20:00:00Z',
    league_id: 'liga',
    market_id: '1x2',
    odd: 2,
    probability: 0.55,
    confidence: 2,
    is_punter: false,
    ...overrides,
  }
}

const ids = (result: { legs: Candidate[] } | null) => result?.legs.map((leg) => leg.id)

describe('generateMultiple: ordering modes', () => {
  const pool = [
    pick({ id: 'a', confidence: 3, odd: 1.5, probability: 0.65 }),
    pick({ id: 'b', confidence: 5, odd: 1.3, probability: 0.85 }),
    pick({ id: 'c', confidence: 3, odd: 1.9, probability: 0.65 }),
    pick({ id: 'd', confidence: 1, odd: 3.2, probability: 0.4 }),
    pick({ id: 'e', confidence: 2, odd: 2.4, probability: 0.55 }),
  ]

  it('confidence: highest level first, then highest odd', () => {
    expect(ids(generateMultiple(pool, { mode: 'confidence', legs: 3 }))).toEqual(['b', 'c', 'a'])
  })

  it('value: highest p × odd first', () => {
    // d 1.28, e 1.32, c 1.235, b 1.105, a 0.975
    expect(ids(generateMultiple(pool, { mode: 'value', legs: 3 }))).toEqual(['e', 'd', 'c'])
  })

  it('highest_odds and lowest_odds', () => {
    expect(ids(generateMultiple(pool, { mode: 'highest_odds', legs: 2 }))).toEqual(['d', 'e'])
    expect(ids(generateMultiple(pool, { mode: 'lowest_odds', legs: 2 }))).toEqual(['b', 'a'])
  })

  it('breaks ties by kickoff, then id', () => {
    const tied = [
      pick({ id: 'z', kickoff_at: '2026-10-28T18:00:00Z' }),
      pick({ id: 'y', kickoff_at: '2026-10-28T21:00:00Z' }),
      pick({ id: 'x', kickoff_at: '2026-10-28T21:00:00Z' }),
    ]
    expect(ids(generateMultiple(tied, { mode: 'highest_odds', legs: 3 }))).toEqual(['z', 'x', 'y'])
  })

  it('returns total odd, combined probability and EV', () => {
    const result = generateMultiple(pool, { mode: 'confidence', legs: 2 })
    expect(result?.totalOdd).toBeCloseTo(1.3 * 1.9)
    expect(result?.probability).toBeCloseTo(0.85 * 0.65)
    expect(result?.ev).toBeCloseTo(0.85 * 0.65 * 1.3 * 1.9 - 1)
    expect(result?.withinTolerance).toBe(true)
  })
})

describe('generateMultiple: one leg per event', () => {
  it('keeps the best-ranked leg of each event', () => {
    const pool = [
      pick({ id: 'a', event_id: 'g1', odd: 3 }),
      pick({ id: 'b', event_id: 'g1', odd: 2.8 }),
      pick({ id: 'c', event_id: 'g2', odd: 1.5 }),
    ]
    expect(ids(generateMultiple(pool, { mode: 'highest_odds', legs: 2 }))).toEqual(['a', 'c'])
  })

  it('returns null when there are fewer events than legs', () => {
    const pool = [pick({ event_id: 'g1' }), pick({ event_id: 'g1' }), pick({ event_id: 'g2' })]
    expect(generateMultiple(pool, { mode: 'confidence', legs: 3 })).toBeNull()
  })

  it('never puts two legs of one event in a target_odd multiple', () => {
    const pool = [
      pick({ id: 'a', event_id: 'g1', odd: 2 }),
      pick({ id: 'b', event_id: 'g1', odd: 2 }),
      pick({ id: 'c', event_id: 'g2', odd: 3 }),
    ]
    const result = generateMultiple(pool, { mode: 'target_odd', targetOdd: 4 })
    expect(new Set(result?.legs.map((leg) => leg.event_id)).size).toBe(result?.legs.length)
    expect(result?.totalOdd).toBeCloseTo(6)
    expect(result?.withinTolerance).toBe(false)
  })
})

describe('generateMultiple: filters', () => {
  const pool = [
    pick({ id: 'a', confidence: 4, odd: 1.4, league_id: 'pt', market_id: 'btts' }),
    pick({ id: 'b', confidence: 2, odd: 2.1, league_id: 'pt', market_id: '1x2', is_punter: true }),
    pick({ id: 'c', confidence: 3, odd: 1.8, league_id: 'es', market_id: 'btts' }),
    pick({ id: 'd', confidence: 5, odd: 3.5, league_id: null, market_id: 'ou' }),
    pick({ id: 'e', confidence: 1, odd: 1.2, league_id: 'es', market_id: '1x2' }),
  ]
  const sorted = (params: Omit<GeneratorParams, 'mode' | 'legs'>, legs = 2) =>
    ids(generateMultiple(pool, { mode: 'lowest_odds', legs, ...params }))?.sort()

  it('minimum confidence', () => {
    expect(sorted({ minConfidence: 3 }, 3)).toEqual(['a', 'c', 'd'])
  })

  it('odd range per leg, inclusive', () => {
    expect(sorted({ minOdd: 1.4, maxOdd: 2.1 }, 3)).toEqual(['a', 'b', 'c'])
  })

  it('leagues, leaving out predictions with no league', () => {
    expect(sorted({ leagueIds: ['es'] })).toEqual(['c', 'e'])
  })

  it('markets', () => {
    expect(sorted({ marketIds: ['btts'] })).toEqual(['a', 'c'])
  })

  it('non-punter pool', () => {
    expect(sorted({ pool: 'non_punter' }, 4)).toEqual(['a', 'c', 'd', 'e'])
    expect(generateMultiple(pool, { mode: 'lowest_odds', legs: 5, pool: 'non_punter' })).toBeNull()
  })

  it('returns null when fewer than 2 candidates survive', () => {
    expect(generateMultiple(pool, { mode: 'lowest_odds', legs: 2, minConfidence: 5 })).toBeNull()
    expect(
      generateMultiple(pool, { mode: 'target_odd', targetOdd: 3, minConfidence: 5 }),
    ).toBeNull()
    expect(generateMultiple([], { mode: 'random', legs: 2 })).toBeNull()
  })
})

describe('generateMultiple: random', () => {
  const pool = Array.from({ length: 12 }, (_, i) => pick({ id: `r${i}`, odd: 1.5 + i / 10 }))

  it('is reproducible with a seed', () => {
    const first = generateMultiple(pool, { mode: 'random', legs: 4, seed: 42 })
    const again = generateMultiple([...pool].reverse(), { mode: 'random', legs: 4, seed: 42 })
    expect(ids(first)).toEqual(ids(again))
    expect(first?.legs).toHaveLength(4)
  })

  it('varies with the seed', () => {
    const results = new Set(
      [1, 2, 3, 4, 5].map((seed) =>
        ids(generateMultiple(pool, { mode: 'random', legs: 4, seed }))?.join(),
      ),
    )
    expect(results.size).toBeGreaterThan(1)
  })

  it('works without a seed', () => {
    expect(generateMultiple(pool, { mode: 'random', legs: 3 })?.legs).toHaveLength(3)
  })

  it('mulberry32 yields numbers in [0, 1)', () => {
    const random = mulberry32(7)
    const values = Array.from({ length: 100 }, random)
    expect(values.every((v) => v >= 0 && v < 1)).toBe(true)
    expect(mulberry32(7)()).toBe(values[0])
  })
})

describe('generateMultiple: target_odd', () => {
  const pool = [
    pick({ id: 'a', odd: 1.5, probability: 0.75 }),
    pick({ id: 'b', odd: 2, probability: 0.4 }),
    pick({ id: 'c', odd: 2, probability: 0.55 }),
    pick({ id: 'd', odd: 3, probability: 0.4 }),
    pick({ id: 'e', odd: 1.25, probability: 0.85 }),
  ]

  it('finds a combination within tolerance and prefers the higher EV', () => {
    // Within 4.0 ± 10%: b×c = 4.00 (EV −0.12), d×e = 3.75 (EV +0.275), a×c×e = 3.75 (EV +0.316).
    const result = generateMultiple(pool, { mode: 'target_odd', targetOdd: 4 })
    expect(result?.withinTolerance).toBe(true)
    expect(Math.abs((result?.totalOdd ?? 0) / 4 - 1)).toBeLessThanOrEqual(0.1)
    expect(ids(result)?.sort()).toEqual(['a', 'c', 'e'])
    expect(result?.ev).toBeCloseTo(0.75 * 0.55 * 0.85 * 3.75 - 1)
  })

  it('respects a custom tolerance', () => {
    const result = generateMultiple(pool, { mode: 'target_odd', targetOdd: 4, tolerance: 0 })
    expect(result?.totalOdd).toBeCloseTo(4)
    expect(result?.withinTolerance).toBe(true)
  })

  it('returns the closest with withinTolerance false when nothing fits', () => {
    const result = generateMultiple(pool, { mode: 'target_odd', targetOdd: 100 })
    expect(result?.withinTolerance).toBe(false)
    expect(result?.legs).toHaveLength(5)
    expect(result?.totalOdd).toBeCloseTo(1.5 * 2 * 2 * 3 * 1.25)
  })

  it('fixes the number of legs when given', () => {
    // Two legs within 4.0 ± 10%: b×c = 4.00 (EV −0.12) and d×e = 3.75 (EV +0.275).
    const result = generateMultiple(pool, { mode: 'target_odd', targetOdd: 4, legs: 2 })
    expect(ids(result)?.sort()).toEqual(['d', 'e'])
    expect(
      generateMultiple(pool, { mode: 'target_odd', targetOdd: 4, legs: 2, tolerance: 0 })?.totalOdd,
    ).toBeCloseTo(4)
  })

  it('reaches a high target over many legs', () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      pick({ id: `m${i}`, odd: 1.3 + (i % 7) / 10 }),
    )
    const result = generateMultiple(many, { mode: 'target_odd', targetOdd: 50 })
    expect(result?.withinTolerance).toBe(true)
    expect(result?.legs.length).toBeLessThanOrEqual(10)
  })
})

describe('generateMultiple: parameters', () => {
  it('rejects a missing or out-of-range number of legs', () => {
    expect(() => generateMultiple([], { mode: 'confidence' })).toThrow(RangeError)
    expect(() => generateMultiple([], { mode: 'confidence', legs: 1 })).toThrow(RangeError)
    expect(() => generateMultiple([], { mode: 'confidence', legs: 11 })).toThrow(RangeError)
    expect(() => generateMultiple([], { mode: 'confidence', legs: 2.5 })).toThrow(RangeError)
  })

  it('rejects a missing or impossible target odd and a negative tolerance', () => {
    expect(() => generateMultiple([], { mode: 'target_odd' })).toThrow(RangeError)
    expect(() => generateMultiple([], { mode: 'target_odd', targetOdd: 1 })).toThrow(RangeError)
    expect(() =>
      generateMultiple([], { mode: 'target_odd', targetOdd: 3, tolerance: -0.1 }),
    ).toThrow(RangeError)
  })
})

describe('swapLeg', () => {
  const pool = [
    pick({ id: 'a', event_id: 'g1', odd: 3.0 }),
    pick({ id: 'a2', event_id: 'g1', odd: 1.1 }),
    pick({ id: 'b', event_id: 'g2', odd: 2.5 }),
    pick({ id: 'c', event_id: 'g3', odd: 2.0 }),
    pick({ id: 'd', event_id: 'g4', odd: 1.6, league_id: 'other' }),
    pick({ id: 'e', event_id: 'g5', odd: 1.4 }),
  ]

  it('replaces the leg in place with the best remaining candidate', () => {
    const params: GeneratorParams = { mode: 'highest_odds', legs: 2 }
    const current = generateMultiple(pool, params)
    expect(ids(current)).toEqual(['a', 'b'])
    const swapped = swapLeg(current!, 'a', pool, params)
    expect(ids(swapped)).toEqual(['c', 'b'])
    expect(swapped?.totalOdd).toBeCloseTo(5)
  })

  it('skips events already in the multiple, the replaced one included', () => {
    const params: GeneratorParams = { mode: 'lowest_odds', legs: 2 }
    const current = generateMultiple(pool, params)
    expect(ids(current)).toEqual(['a2', 'e'])
    expect(ids(swapLeg(current!, 'a2', pool, params))).toEqual(['d', 'e'])
  })

  it('keeps the filters', () => {
    const params: GeneratorParams = { mode: 'lowest_odds', legs: 2, leagueIds: ['liga'] }
    const current = generateMultiple(pool, params)
    expect(ids(swapLeg(current!, 'a2', pool, params))).toEqual(['c', 'e'])
  })

  it('is reproducible in random mode with a seed', () => {
    const params: GeneratorParams = { mode: 'random', legs: 2, seed: 9 }
    const current = generateMultiple(pool, params)!
    const first = swapLeg(current, current.legs[0]!.id, pool, params)
    const again = swapLeg(current, current.legs[0]!.id, pool, params)
    expect(ids(first)).toEqual(ids(again))
    expect(new Set(first?.legs.map((leg) => leg.event_id)).size).toBe(2)
  })

  it('picks the replacement that keeps a target_odd multiple closest to the target', () => {
    const params: GeneratorParams = { mode: 'target_odd', targetOdd: 5, legs: 2 }
    const current = generateMultiple(pool, params)
    expect(ids(current)?.sort()).toEqual(['b', 'c'])
    const swapped = swapLeg(current!, 'c', pool, params)
    // b (2.5) with a 3.0 = 7.5, d 1.6 = 4.0, e 1.4 = 3.5 → d is closest in log space.
    expect(ids(swapped)).toEqual(['b', 'd'])
    expect(swapped?.withinTolerance).toBe(false)
  })

  it('returns null when nothing is left or the leg is unknown', () => {
    const params: GeneratorParams = { mode: 'highest_odds', legs: 2 }
    const two = pool.slice(0, 3)
    const current = generateMultiple(two, params)!
    expect(swapLeg(current, 'a', two, params)).toBeNull()
    expect(swapLeg(current, 'missing', pool, params)).toBeNull()
  })
})
