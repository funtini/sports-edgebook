import { describe, expect, it } from 'vitest'
import { parseDecimal, toggleSign } from '../decimal'

describe('parseDecimal', () => {
  it('accepts a comma or a dot as decimal separator', () => {
    expect(parseDecimal('1,85')).toBe(1.85)
    expect(parseDecimal('1.85')).toBe(1.85)
    expect(parseDecimal(' 2 ')).toBe(2)
    expect(parseDecimal(',5')).toBe(0.5)
  })

  it('accepts negatives with a hyphen or a Unicode minus', () => {
    expect(parseDecimal('-0,5')).toBe(-0.5)
    expect(parseDecimal('−1.5')).toBe(-1.5)
  })

  it('returns null for blank input', () => {
    expect(parseDecimal('')).toBeNull()
    expect(parseDecimal('   ')).toBeNull()
  })

  it('returns NaN for anything else', () => {
    expect(parseDecimal('abc')).toBeNaN()
    expect(parseDecimal('1,8,5')).toBeNaN()
    expect(parseDecimal('1.85x')).toBeNaN()
  })
})

describe('toggleSign', () => {
  it('flips the sign of the typed number', () => {
    expect(toggleSign('2,5')).toBe('-2,5')
    expect(toggleSign('-2,5')).toBe('2,5')
    expect(toggleSign('−1.5')).toBe('1.5')
  })

  it('starts a negative number from blank input', () => {
    expect(toggleSign('')).toBe('-')
    expect(toggleSign('-')).toBe('')
  })
})
