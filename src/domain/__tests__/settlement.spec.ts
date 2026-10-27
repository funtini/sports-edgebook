import { describe, expect, it } from 'vitest'
import {
  betProfit,
  isPunterBet,
  multipleOdd,
  multipleStatus,
  predictionProfit,
  stakeFor,
  unitsToCurrency,
  type SettleablePrediction,
} from '../settlement'

const bet = (overrides: Partial<SettleablePrediction> = {}): SettleablePrediction => ({
  odd: 2,
  status: 'pending',
  is_punter: false,
  stake_units: null,
  ...overrides,
})

describe('betProfit', () => {
  it('pays stake × (odd − 1) on a win', () => {
    expect(betProfit(2, 1.9, 'won')).toBeCloseTo(1.8)
  })

  it('loses the stake, refunds a void and waits on pending', () => {
    expect(betProfit(2, 1.9, 'lost')).toBe(-2)
    expect(betProfit(2, 1.9, 'void')).toBe(0)
    expect(betProfit(2, 1.9, 'pending')).toBeNull()
  })
})

describe('multiples', () => {
  it('is lost as soon as one leg loses, even with others pending', () => {
    expect(
      multipleStatus([
        { odd: 1.5, status: 'pending' },
        { odd: 2, status: 'lost' },
      ]),
    ).toBe('lost')
  })

  it('drops void legs from the odd and still wins', () => {
    const legs = [
      { odd: 1.5, status: 'won' as const },
      { odd: 2, status: 'void' as const },
      { odd: 1.8, status: 'won' as const },
    ]
    expect(multipleStatus(legs)).toBe('won')
    expect(multipleOdd(legs)).toBeCloseTo(2.7)
  })

  it('is void when every leg is void', () => {
    expect(multipleStatus([{ odd: 1.5, status: 'void' }])).toBe('void')
  })
})

describe('unitsToCurrency', () => {
  it('converts units with the configured unit value', () => {
    expect(unitsToCurrency(-1.5, 20)).toBe(-30)
  })
})

describe('stakeFor and predictionProfit', () => {
  it('uses the real stake for punter bets', () => {
    const p = bet({ is_punter: true, stake_units: 2, odd: 1.9, status: 'won' })
    expect(isPunterBet(p)).toBe(true)
    expect(stakeFor(p)).toBe(2)
    expect(predictionProfit(p)).toBeCloseTo(1.8)
  })

  it('uses a virtual unit for non-punter predictions', () => {
    expect(stakeFor(bet())).toBe(1)
    expect(predictionProfit(bet({ status: 'lost' }))).toBe(-1)
  })

  it('falls back to a virtual unit for a punter flag without a stake', () => {
    const p = bet({ is_punter: true })
    expect(isPunterBet(p)).toBe(false)
    expect(stakeFor(p)).toBe(1)
  })

  it('is null while pending', () => {
    expect(predictionProfit(bet())).toBeNull()
  })
})
