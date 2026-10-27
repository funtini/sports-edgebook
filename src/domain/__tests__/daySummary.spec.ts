import { describe, expect, it } from 'vitest'
import {
  addDays,
  daySummary,
  fromDayKey,
  groupByEvent,
  hitRate,
  predictionProfit,
  stakeFor,
  toDayKey,
  type SettleablePrediction,
} from '../daySummary'

const bet = (overrides: Partial<SettleablePrediction> = {}): SettleablePrediction => ({
  odd: 2,
  status: 'pending',
  is_punter: false,
  stake_units: null,
  ...overrides,
})

describe('stakeFor and predictionProfit', () => {
  it('uses the real stake for punter bets', () => {
    const p = bet({ is_punter: true, stake_units: 2, odd: 1.9, status: 'won' })
    expect(stakeFor(p)).toBe(2)
    expect(predictionProfit(p)).toBeCloseTo(1.8)
  })

  it('uses a virtual unit for non-punter predictions', () => {
    expect(stakeFor(bet())).toBe(1)
    expect(predictionProfit(bet({ status: 'lost' }))).toBe(-1)
  })

  it('is null while pending', () => {
    expect(predictionProfit(bet())).toBeNull()
  })
})

describe('hitRate', () => {
  it('excludes voids and pending', () => {
    expect(hitRate(['won', 'lost', 'void', 'pending', 'won'])).toBeCloseTo(2 / 3)
  })

  it('is null when nothing is won or lost', () => {
    expect(hitRate([])).toBeNull()
    expect(hitRate(['void', 'pending'])).toBeNull()
  })
})

describe('daySummary', () => {
  it('counts every prediction but only punter bets in P/L', () => {
    const summary = daySummary([
      bet({ is_punter: true, stake_units: 2, odd: 1.5, status: 'won' }),
      bet({ is_punter: true, stake_units: 1, status: 'lost' }),
      bet({ is_punter: true, stake_units: 3, status: 'pending' }),
      bet({ status: 'won', odd: 5 }),
      bet({ status: 'void' }),
    ])
    expect(summary).toEqual({
      total: 5,
      settled: 4,
      hitRate: 2 / 3,
      punterProfit: 0,
      punterBets: 3,
    })
  })

  it('is empty for an empty day', () => {
    expect(daySummary([])).toEqual({
      total: 0,
      settled: 0,
      hitRate: null,
      punterProfit: 0,
      punterBets: 0,
    })
  })
})

describe('groupByEvent', () => {
  it('keeps first-appearance order of events and of predictions within them', () => {
    const groups = groupByEvent([
      { id: 'a', event_id: 'e1' },
      { id: 'b', event_id: 'e2' },
      { id: 'c', event_id: 'e1' },
    ])
    expect(groups).toEqual([
      {
        eventId: 'e1',
        predictions: [
          { id: 'a', event_id: 'e1' },
          { id: 'c', event_id: 'e1' },
        ],
      },
      { eventId: 'e2', predictions: [{ id: 'b', event_id: 'e2' }] },
    ])
  })
})

describe('day keys', () => {
  it('round-trips a local date', () => {
    const date = new Date(2026, 9, 5)
    expect(toDayKey(date)).toBe('2026-10-05')
    expect(fromDayKey('2026-10-05')).toEqual(date)
  })

  it('rejects malformed or impossible dates', () => {
    expect(fromDayKey('hoje')).toBeNull()
    expect(fromDayKey('2026-02-30')).toBeNull()
  })

  it('adds days across month ends', () => {
    expect(toDayKey(addDays(new Date(2026, 9, 31), 1))).toBe('2026-11-01')
    expect(toDayKey(addDays(new Date(2026, 10, 1), -1))).toBe('2026-10-31')
  })
})
