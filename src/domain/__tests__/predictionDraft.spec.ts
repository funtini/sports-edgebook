import { describe, expect, it } from 'vitest'
import { emptyNewGame, emptyPredictionDraft, predictionInput } from '../predictionDraft'
import { predictionFormSchema } from '../schemas'

const draft = {
  ...emptyPredictionDraft(),
  market: 'result' as const,
  betType: 'handicap' as const,
  pick: 'home',
  line: '−1,5',
  odd: '2,10',
  confidence: 3 as const,
}

describe('predictionInput', () => {
  it('parses typed numbers and validates', () => {
    const parsed = predictionFormSchema.parse(predictionInput(draft))
    expect(parsed).toMatchObject({ line: -1.5, odd: 2.1, confidence: 3, is_punter: false })
    expect(parsed).toMatchObject({ market: 'result', bet_type: 'handicap', period: 'FT' })
  })

  it("stores a total's sign as over / under", () => {
    const total = { ...draft, market: 'goals' as const, betType: 'total' as const, pick: '' }
    expect(predictionInput({ ...total, line: '2,5' })).toMatchObject({
      selection: 'over',
      line: 2.5,
    })
    expect(
      predictionInput({ ...total, betType: 'team_total', pick: 'away', line: '-1.5' }),
    ).toMatchObject({ selection: 'away_under', line: 1.5 })
  })

  it('drops the line of a type without one', () => {
    expect(predictionInput({ ...draft, betType: '1x2', line: '2' }).line).toBeNull()
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
