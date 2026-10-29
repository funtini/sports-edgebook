import { describe, expect, it } from 'vitest'
import { daySummary, groupByEvent } from '../daySummary'
import type { SettleablePrediction } from '../settlement'

const bet = (overrides: Partial<SettleablePrediction> = {}): SettleablePrediction => ({
  odd: 2,
  status: 'pending',
  is_punter: false,
  stake_units: null,
  ...overrides,
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
      won: 2,
      open: 1,
      hitRate: 2 / 3,
      punterProfit: 0,
      punterBets: 3,
      punterStaked: 6,
    })
  })

  it('is empty for an empty day', () => {
    expect(daySummary([])).toEqual({
      total: 0,
      settled: 0,
      won: 0,
      open: 0,
      hitRate: null,
      punterProfit: 0,
      punterBets: 0,
      punterStaked: 0,
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
