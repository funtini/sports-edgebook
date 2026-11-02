import { describe, expect, it } from 'vitest'
import { MODEL_PRICES } from '../../../../src/domain/slipCost.ts'
import { SLIP_MODELS } from '../../../../src/domain/slipRead.ts'
import { READ_SLIP_MODELS } from '../config.ts'

describe('READ_SLIP_MODELS', () => {
  // Definições shows each choice's real cost from these prices; a model without one shows none.
  it('has a price for every model, under its own choice', () => {
    for (const choice of SLIP_MODELS) {
      expect(MODEL_PRICES[READ_SLIP_MODELS[choice].model]?.choice).toBe(choice)
    }
  })
})
