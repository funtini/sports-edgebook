import { describe, expect, it } from 'vitest'
import { toDayKey } from '../days'
import { periodRange, periodStart } from '../periods'

// Wednesday 28 October 2026.
const today = new Date(2026, 9, 28, 21, 30)

describe('periodStart', () => {
  it('covers the last 7 and 30 days, and the year from 1 January', () => {
    expect(toDayKey(periodStart('week', today)!)).toBe('2026-10-22')
    expect(toDayKey(periodStart('month', today)!)).toBe('2026-09-29')
    expect(toDayKey(periodStart('year', today)!)).toBe('2026-01-01')
    expect(periodStart('all', today)).toBeNull()
  })

  it('still reaches back into last week and last month on a Monday the 2nd', () => {
    const monday = new Date(2026, 10, 2)
    expect(toDayKey(periodStart('week', monday)!)).toBe('2026-10-27')
    expect(toDayKey(periodStart('month', monday)!)).toBe('2026-10-04')
  })

  it('counts days across the end of summer time', () => {
    // Portugal leaves summer time on 25 October 2026.
    expect(toDayKey(periodStart('week', new Date(2026, 9, 29))!)).toBe('2026-10-23')
  })
})

describe('periodRange', () => {
  it('ends today', () => {
    expect(periodRange('month', today)).toEqual({ from: '2026-09-29', to: '2026-10-28' })
  })

  it('starts everything at the earliest bet, or today without bets', () => {
    const dates = ['2026-10-20T12:00:00Z', '2026-03-03T12:00:00Z', '2026-07-01T12:00:00Z']
    expect(periodRange('all', today, dates)).toEqual({ from: '2026-03-03', to: '2026-10-28' })
    expect(periodRange('all', today)).toEqual({ from: '2026-10-28', to: '2026-10-28' })
  })
})
