import { describe, expect, it } from 'vitest'
import { toDayKey } from '../days'
import { periodRange, periodStart } from '../periods'

// Wednesday 28 October 2026.
const today = new Date(2026, 9, 28, 21, 30)

describe('periodStart', () => {
  it('starts the week on Monday, the month on the 1st and the year on 1 January', () => {
    expect(toDayKey(periodStart('week', today)!)).toBe('2026-10-26')
    expect(toDayKey(periodStart('month', today)!)).toBe('2026-10-01')
    expect(toDayKey(periodStart('year', today)!)).toBe('2026-01-01')
    expect(periodStart('all', today)).toBeNull()
  })

  it('counts a Sunday in the week that began the Monday before', () => {
    expect(toDayKey(periodStart('week', new Date(2026, 10, 1))!)).toBe('2026-10-26')
    expect(toDayKey(periodStart('week', new Date(2026, 9, 26))!)).toBe('2026-10-26')
  })
})

describe('periodRange', () => {
  it('ends today', () => {
    expect(periodRange('month', today)).toEqual({ from: '2026-10-01', to: '2026-10-28' })
  })

  it('starts everything at the earliest bet, or today without bets', () => {
    const dates = ['2026-10-20T12:00:00Z', '2026-03-03T12:00:00Z', '2026-07-01T12:00:00Z']
    expect(periodRange('all', today, dates)).toEqual({ from: '2026-03-03', to: '2026-10-28' })
    expect(periodRange('all', today)).toEqual({ from: '2026-10-28', to: '2026-10-28' })
  })
})
