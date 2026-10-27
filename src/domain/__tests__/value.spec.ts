import { describe, expect, it } from 'vitest'
import { fairOdd, valueBand, valueIndex } from '../value'
import { DEFAULT_CONFIDENCE_ANCHORS, probabilityFor } from '../confidence'

describe('value', () => {
  it('computes the fair odd from a probability', () => {
    expect(fairOdd(0.65)).toBeCloseTo(1.538, 3)
    expect(() => fairOdd(0)).toThrow(RangeError)
  })

  it('flags a level 3 pick at 1.80 as favourable', () => {
    const index = valueIndex(probabilityFor(3), 1.8)
    expect(index).toBeCloseTo(1.17, 2)
    expect(valueBand(index)).toBe('favourable')
  })

  it('flags a level 4 pick at 1.25 as reduced value', () => {
    expect(valueBand(valueIndex(DEFAULT_CONFIDENCE_ANCHORS[4], 1.25))).toBe('reduced')
  })

  it('splits the index into five bands at the documented boundaries', () => {
    expect(valueBand(1.37)).toBe('banger')
    expect(valueBand(1.36)).toBe('banger')
    expect(valueBand(1.35)).toBe('favourable')
    expect(valueBand(1.06)).toBe('favourable')
    expect(valueBand(1.05)).toBe('neutral')
    expect(valueBand(1)).toBe('neutral')
    expect(valueBand(0.95)).toBe('neutral')
    expect(valueBand(0.94)).toBe('reduced')
    expect(valueBand(0.85)).toBe('reduced')
    expect(valueBand(0.84)).toBe('no_value')
    expect(valueBand(0.5)).toBe('no_value')
  })

  it('judges the index as shown, rounded to 2 decimals', () => {
    // Level 2 (55%) at 1.92 → 1.056, shown as 1,06.
    expect(valueBand(valueIndex(0.55, 1.92))).toBe('favourable')
    expect(valueBand(1.0549)).toBe('neutral')
    expect(valueBand(1.3549)).toBe('favourable')
    expect(valueBand(1.355)).toBe('banger')
    expect(valueBand(0.9449)).toBe('reduced')
    expect(valueBand(0.8449)).toBe('no_value')
  })
})
