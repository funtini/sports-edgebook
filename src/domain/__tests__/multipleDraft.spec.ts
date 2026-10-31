import { describe, expect, it } from 'vitest'
import {
  multipleOrigin,
  potentialProfit,
  slipTotals,
  toCandidate,
  withinTolerance,
} from '../multipleDraft'

describe('toCandidate', () => {
  it('takes kickoff and league from the event', () => {
    expect(
      toCandidate({
        id: 'p',
        event_id: 'e',
        market: 'goals',
        odd: 1.8,
        probability: 0.65,
        confidence: 3,
        is_punter: true,
        event: { kickoff_at: '2026-10-31T20:00:00Z', league_id: 'l' },
      }),
    ).toEqual({
      id: 'p',
      event_id: 'e',
      kickoff_at: '2026-10-31T20:00:00Z',
      league_id: 'l',
      market: 'goals',
      odd: 1.8,
      probability: 0.65,
      confidence: 3,
      is_punter: true,
    })
  })
})

describe('multipleOrigin', () => {
  it('is manual or generated when every leg agrees, mixed otherwise', () => {
    expect(multipleOrigin(['manual', 'manual'])).toBe('manual')
    expect(multipleOrigin(['generated', 'generated'])).toBe('generated')
    expect(multipleOrigin(['manual', 'generated'])).toBe('mixed')
  })
})

describe('slipTotals', () => {
  it('multiplies odds and probabilities; EV is p × odd − 1', () => {
    const totals = slipTotals([
      { odd: 2, probability: 0.55 },
      { odd: 1.5, probability: 0.75 },
    ])
    expect(totals.totalOdd).toBeCloseTo(3)
    expect(totals.probability).toBeCloseTo(0.4125)
    expect(totals.ev).toBeCloseTo(0.2375)
  })

  it('is odd 1, probability 1 and EV 0 without legs', () => {
    expect(slipTotals([])).toEqual({ totalOdd: 1, probability: 1, ev: 0 })
  })
})

describe('withinTolerance', () => {
  it('is relative to the target', () => {
    expect(withinTolerance(5.45, 5, 0.1)).toBe(true)
    expect(withinTolerance(5.6, 5, 0.1)).toBe(false)
    expect(withinTolerance(4.6, 5)).toBe(true)
  })
})

describe('potentialProfit', () => {
  it('is stake × (odd − 1)', () => {
    expect(potentialProfit(2, 3.5)).toBeCloseTo(5)
  })
})
