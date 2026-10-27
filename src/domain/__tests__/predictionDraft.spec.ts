import { describe, expect, it } from 'vitest'
import {
  emptyNewGame,
  emptyPredictionDraft,
  marketInput,
  predictionInput,
} from '../predictionDraft'
import { predictionFormSchema } from '../schemas'

const draft = {
  ...emptyPredictionDraft(),
  category: 'Handicap',
  marketName: 'Handicap',
  selection: 'Benfica',
  line: '−1,5',
  odd: '2,10',
  confidence: 3 as const,
}

describe('predictionInput', () => {
  it('parses typed numbers and validates', () => {
    const parsed = predictionFormSchema.parse(predictionInput(draft))
    expect(parsed).toMatchObject({ line: -1.5, odd: 2.1, confidence: 3, is_punter: false })
  })

  it('sends stake and bookmaker only for a punter bet', () => {
    const typed = { ...draft, stake: '2', bookmaker: ' Betano ' }
    expect(predictionInput(typed)).toMatchObject({ stake_units: null, bookmaker: null })
    expect(predictionInput({ ...typed, isPunter: true })).toMatchObject({
      stake_units: 2,
      bookmaker: 'Betano',
    })
  })

  it('leaves blank odd and confidence missing so validation asks for them', () => {
    const input = predictionInput(emptyPredictionDraft())
    expect(input.odd).toBeUndefined()
    expect(input.confidence).toBeUndefined()
    expect(input.notes).toBeNull()
  })
})

describe('marketInput', () => {
  it('maps the market fields', () => {
    expect(marketInput(draft)).toEqual({ category: 'Handicap', name: 'Handicap' })
  })
})

describe('emptyNewGame', () => {
  it('is dated today, local time', () => {
    expect(emptyNewGame(new Date(2026, 0, 5, 23, 30))).toEqual({
      date: '2026-01-05',
      time: '',
      league: '',
      home: '',
      away: '',
    })
  })
})
