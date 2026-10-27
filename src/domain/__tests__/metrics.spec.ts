import { describe, expect, it } from 'vitest'
import { hitRate } from '../metrics'

describe('hitRate', () => {
  it('excludes voids and pending', () => {
    expect(hitRate(['won', 'lost', 'void', 'pending', 'won'])).toBeCloseTo(2 / 3)
  })

  it('is null when nothing is won or lost', () => {
    expect(hitRate([])).toBeNull()
    expect(hitRate(['void', 'pending'])).toBeNull()
  })
})
