import { describe, expect, it } from 'vitest'
import { sameName, suggestNames, tidyName } from '../names'

describe('tidyName', () => {
  it('trims and collapses inner whitespace', () => {
    expect(tidyName('  Sporting   CP ')).toBe('Sporting CP')
  })
})

describe('sameName', () => {
  it('ignores case and extra spaces', () => {
    expect(sameName('Sporting  CP', 'sporting cp ')).toBe(true)
    expect(sameName('Benfica', 'Porto')).toBe(false)
  })
})

describe('suggestNames', () => {
  const names = ['Benfica', 'Benfica B', 'benfica', 'Porto', 'Sporting CP']

  it('keeps names containing the query, ignoring case, without duplicates', () => {
    expect(suggestNames(names, 'BEN')).toEqual(['Benfica', 'Benfica B'])
    expect(suggestNames(names, 'sporting  cp')).toEqual(['Sporting CP'])
  })

  it('lists everything for a blank query, up to the limit', () => {
    expect(suggestNames(names, '  ')).toEqual(['Benfica', 'Benfica B', 'Porto', 'Sporting CP'])
    expect(suggestNames(names, '', 2)).toEqual(['Benfica', 'Benfica B'])
  })
})
