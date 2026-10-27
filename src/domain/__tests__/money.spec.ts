import { describe, expect, it } from 'vitest'
import { formatDecimal, formatEuros, formatMoney } from '../money'

describe('money', () => {
  it('formats plain two-decimal numbers such as odds', () => {
    expect(formatDecimal(1.8)).toBe('1,80')
  })

  it('shows units as a bare signed number', () => {
    expect(formatMoney(1.81, 20, 'units')).toBe('+1,81')
    expect(formatMoney(-1, 10, 'units')).toBe('-1,00')
  })

  it('shows euros as units × unit value', () => {
    expect(formatMoney(1.81, 20, 'euros')).toBe('+36,20 €')
    expect(formatMoney(-1, 10, 'euros')).toBe('-10,00 €')
  })

  it('shows zero without a sign', () => {
    expect(formatMoney(0, 10, 'units')).toBe('0,00')
    expect(formatMoney(0, 10, 'euros')).toBe('0,00 €')
    expect(formatMoney(-0.001, 10, 'units')).toBe('0,00')
  })

  it('rounds to two decimals', () => {
    expect(formatMoney(0.125, 30, 'units')).toBe('+0,13')
    expect(formatMoney(0.125, 30, 'euros')).toBe('+3,75 €')
  })

  it('groups thousands in PT-PT format', () => {
    expect(formatEuros(12345.6)).toMatch(/^12\s345,60 €$/)
  })

  it('omits the sign when not signed', () => {
    expect(formatMoney(50, 20, 'units', { signed: false })).toBe('50,00')
    expect(formatMoney(50, 20, 'euros', { signed: false })).toBe('1000,00 €')
  })
})
