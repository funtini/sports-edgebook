import { describe, expect, it } from 'vitest'
import {
  dayMultiples,
  matchesFilter,
  multipleKickoff,
  reusableLegs,
  settleMultiple,
  statusUpdate,
  type SettleableMultiple,
} from '../savedMultiples'
import type { BetStatus } from '../settlement'

const leg = (odd: number, status: BetStatus, kickoff = '2026-10-30T19:00:00.000Z') => ({
  odd_at_selection: odd,
  prediction: { status, event: { kickoff_at: kickoff } },
})

const multiple = (
  legs: SettleableMultiple['legs'],
  overrides: Partial<SettleableMultiple> = {},
): SettleableMultiple => ({
  is_placed: true,
  stake_units: 2,
  status: 'pending',
  legs,
  ...overrides,
})

describe('settleMultiple', () => {
  it('wins at stake × (odd − 1) when every leg wins', () => {
    const s = settleMultiple(multiple([leg(1.5, 'won'), leg(2, 'won')]))
    expect(s.status).toBe('won')
    expect(s.effectiveOdd).toBeCloseTo(3)
    expect(s.profit).toBeCloseTo(4)
    expect(s.real).toBe(true)
  })

  it('counts void legs at 1,00', () => {
    const s = settleMultiple(multiple([leg(2.26, 'won'), leg(2, 'void')]))
    expect(s.status).toBe('won')
    expect(s.voidLegs).toBe(1)
    expect(s.effectiveOdd).toBeCloseTo(2.26)
    expect(s.profit).toBeCloseTo(2.52)
  })

  it('loses the stake when any leg lost, even with others pending or void', () => {
    const s = settleMultiple(multiple([leg(1.5, 'pending'), leg(2, 'lost'), leg(3, 'void')]))
    expect(s.status).toBe('lost')
    expect(s.profit).toBe(-2)
  })

  it('stays pending, with no profit, while a leg is open and none lost', () => {
    const s = settleMultiple(multiple([leg(1.5, 'won'), leg(2, 'pending')]))
    expect(s.status).toBe('pending')
    expect(s.profit).toBeNull()
  })

  it('is void with 0 profit when every leg is void', () => {
    const s = settleMultiple(multiple([leg(1.5, 'void'), leg(2, 'void')]))
    expect(s.status).toBe('void')
    expect(s.effectiveOdd).toBe(1)
    expect(s.profit).toBe(0)
  })

  it('evaluates a simulated multiple on 1 virtual unit', () => {
    const s = settleMultiple(
      multiple([leg(1.5, 'won'), leg(2, 'won')], { is_placed: false, stake_units: null }),
    )
    expect(s.real).toBe(false)
    expect(s.stake).toBe(1)
    expect(s.profit).toBeCloseTo(2)
  })
})

describe('statusUpdate', () => {
  const now = new Date('2026-10-31T10:00:00.000Z')

  it('is null when the stored status already follows the legs', () => {
    expect(statusUpdate({ ...multiple([leg(1.5, 'pending')]), settled_at: null }, now)).toBeNull()
  })

  it('settles with the time when the legs decide it', () => {
    expect(statusUpdate({ ...multiple([leg(1.5, 'lost')]), settled_at: null }, now)).toEqual({
      status: 'lost',
      settled_at: now.toISOString(),
    })
  })

  it('keeps the first settled_at when the result changes, clears it back to pending', () => {
    const settled = '2026-10-30T22:00:00.000Z'
    expect(
      statusUpdate(
        { ...multiple([leg(1.5, 'won')], { status: 'lost' }), settled_at: settled },
        now,
      ),
    ).toEqual({ status: 'won', settled_at: settled })
    expect(
      statusUpdate(
        { ...multiple([leg(1.5, 'pending')], { status: 'won' }), settled_at: settled },
        now,
      ),
    ).toEqual({ status: 'pending', settled_at: null })
  })
})

describe('matchesFilter', () => {
  it('splits placed and simulated', () => {
    expect(matchesFilter({ is_placed: true }, 'placed')).toBe(true)
    expect(matchesFilter({ is_placed: true }, 'simulated')).toBe(false)
    expect(matchesFilter({ is_placed: false }, 'simulated')).toBe(true)
    expect(matchesFilter({ is_placed: false }, 'all')).toBe(true)
  })
})

describe('dayMultiples', () => {
  const day = new Date(2026, 9, 30, 20)
  const other = new Date(2026, 9, 31, 20)

  it('counts placed multiples whose first leg is on the day, with their settled P/L', () => {
    const rows = [
      multiple([leg(2, 'won', day.toISOString()), leg(1.5, 'won', other.toISOString())]),
      multiple([leg(2, 'lost', day.toISOString())]),
      multiple([leg(2, 'pending', day.toISOString())]),
      multiple([leg(2, 'won', day.toISOString())], { is_placed: false, stake_units: null }),
      multiple([leg(2, 'won', other.toISOString())]),
    ]
    // +4 (2 × (3 − 1)) − 2, the pending one counted but not in the P/L.
    expect(dayMultiples(rows, '2026-10-30')).toEqual({ count: 3, profit: 2, settled: 2 })
    expect(dayMultiples(rows, '2026-10-29')).toEqual({ count: 0, profit: 0, settled: 0 })
  })

  it('dates a multiple by its first kickoff', () => {
    expect(
      multipleKickoff(
        multiple([leg(2, 'won', other.toISOString()), leg(2, 'won', day.toISOString())]),
      ),
    ).toBe(day.toISOString())
    expect(multipleKickoff(multiple([]))).toBeNull()
  })
})

describe('reusableLegs', () => {
  it('keeps games still to start, with their origin, and counts the rest', () => {
    const now = new Date('2026-10-31T18:00:00.000Z')
    const at = (kickoff_at: string) => ({ event: { kickoff_at } })
    const { kept, dropped } = reusableLegs(
      [
        { origin: 'manual', prediction: at('2026-10-31T17:00:00.000Z') },
        { origin: 'generated', prediction: at('2026-10-31T18:00:00.000Z') },
        { origin: 'generated', prediction: at('2026-10-31T20:00:00.000Z') },
      ],
      now,
    )
    expect(kept).toEqual([{ origin: 'generated', prediction: at('2026-10-31T20:00:00.000Z') }])
    expect(dropped).toBe(2)
  })
})
