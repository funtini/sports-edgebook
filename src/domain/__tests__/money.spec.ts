import { describe, expect, it } from 'vitest'
import { formatEuros, formatMoney, formatUnits } from '../money'

describe('money', () => {
  it('shows signed units and euros side by side', () => {
    expect(formatMoney(1.8, 20)).toBe('+1,80 u · +36,00 €')
    expect(formatMoney(-1, 10)).toBe('-1,00 u · -10,00 €')
  })

  it('shows zero without a sign', () => {
    expect(formatMoney(0, 10)).toBe('0,00 u · 0,00 €')
    expect(formatMoney(-0.001, 10)).toBe('0,00 u · -0,01 €')
  })

  it('rounds to two decimals', () => {
    expect(formatMoney(0.125, 30)).toBe('+0,13 u · +3,75 €')
  })

  it('groups thousands in PT-PT format', () => {
    expect(formatEuros(12345.6)).toMatch(/^12\s345,60 €$/)
  })

  it('omits the sign when not signed', () => {
    expect(formatUnits(50)).toBe('50,00 u')
    expect(formatMoney(50, 20, { signed: false })).toBe('50,00 u · 1000,00 €')
  })
})
