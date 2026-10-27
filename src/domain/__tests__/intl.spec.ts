import { describe, expect, it } from 'vitest'
import { dateTimeFormat, formatPercent, formatTime, numberFormat } from '../intl'

describe('intl', () => {
  it('reuses one formatter per locale and options', () => {
    expect(numberFormat('pt-PT', { style: 'percent' })).toBe(
      numberFormat('pt-PT', { style: 'percent' }),
    )
    expect(numberFormat('pt-PT')).not.toBe(numberFormat('en-GB'))
    expect(dateTimeFormat('en-GB', { hour: '2-digit' })).toBe(
      dateTimeFormat('en-GB', { hour: '2-digit' }),
    )
  })

  it('formats percentages in both languages', () => {
    expect(formatPercent(0.65)).toMatch(/^65\s?%$/)
    expect(formatPercent(0.654, 'en-GB')).toBe('65%')
  })

  it('formats the time of day in both languages', () => {
    const date = new Date(2026, 9, 27, 20, 5)
    expect(formatTime(date)).toBe('20:05')
    expect(formatTime(date, 'en-GB')).toBe('20:05')
  })
})
