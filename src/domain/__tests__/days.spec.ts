import { describe, expect, it } from 'vitest'
import { addDays, fromDayKey, startOfDay, toDayKey } from '../days'

describe('days', () => {
  it('takes the local midnight', () => {
    expect(startOfDay(new Date(2026, 9, 27, 23, 59))).toEqual(new Date(2026, 9, 27))
  })

  it('round-trips a local date through its key', () => {
    const date = new Date(2026, 9, 5)
    expect(toDayKey(date)).toBe('2026-10-05')
    expect(fromDayKey('2026-10-05')).toEqual(date)
  })

  it('rejects malformed or impossible keys', () => {
    expect(fromDayKey('hoje')).toBeNull()
    expect(fromDayKey('2026-02-30')).toBeNull()
  })

  it('adds days across month ends', () => {
    expect(toDayKey(addDays(new Date(2026, 9, 31), 1))).toBe('2026-11-01')
    expect(toDayKey(addDays(new Date(2026, 10, 1), -1))).toBe('2026-10-31')
  })
})
