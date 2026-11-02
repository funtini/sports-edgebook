import { describe, expect, it } from 'vitest'
import { averageRecentCost, modelsForChoice, readCostUsd, type ReadUsage } from '../slipCost'

const read = (model: string | null, input: number | null, output: number | null): ReadUsage => ({
  model,
  input_tokens: input,
  output_tokens: output,
})

describe('readCostUsd', () => {
  it('prices input and output tokens per million', () => {
    expect(readCostUsd(read('claude-sonnet-5-5', 2000, 1000))).toBeCloseTo(0.004 + 0.01)
    expect(readCostUsd(read('claude-opus-5-5', 1_000_000, 0))).toBeCloseTo(4)
    expect(readCostUsd(read('claude-haiku-5-5', 2000, 1000))).toBeCloseTo(0.0002 + 0.0005)
  })

  it('uses the long prompt prices above the threshold', () => {
    expect(readCostUsd(read('claude-haiku-5-5', 200_000, 1000))).toBeCloseTo(0.1 + 0.0025)
  })

  it('is null for an unknown model or tokens not logged', () => {
    expect(readCostUsd(read('claude-unknown', 2000, 1000))).toBeNull()
    expect(readCostUsd(read(null, 2000, 1000))).toBeNull()
    expect(readCostUsd(read('claude-opus-5-5', null, null))).toBeNull()
  })
})

describe('averageRecentCost', () => {
  it('averages the newest three priced reads', () => {
    const reads = [
      read('claude-opus-5-5', 1000, 1000), // 0.024
      read('claude-opus-5-5', null, null), // skipped
      read('claude-opus-5-5', 2000, 2000), // 0.048
      read('claude-opus-5-5', 3000, 3000), // 0.072
      read('claude-opus-5-5', 100_000, 100_000), // beyond the last three
    ]
    const average = averageRecentCost(reads)!
    expect(average.reads).toBe(3)
    expect(average.usd).toBeCloseTo(0.048)
  })

  it('averages fewer reads when there are fewer, and is null with none', () => {
    expect(averageRecentCost([read('claude-sonnet-5-5', 1000, 0)])).toEqual({
      usd: 0.002,
      reads: 1,
    })
    expect(averageRecentCost([])).toBeNull()
    expect(averageRecentCost([read('claude-sonnet-5-5', null, null)])).toBeNull()
  })
})

describe('modelsForChoice', () => {
  it('maps each choice to its priced models', () => {
    expect(modelsForChoice('economy')).toEqual(['claude-haiku-5-5'])
    expect(modelsForChoice('balanced')).toEqual(['claude-sonnet-5-5'])
    expect(modelsForChoice('best')).toEqual(['claude-opus-5-5'])
  })
})
