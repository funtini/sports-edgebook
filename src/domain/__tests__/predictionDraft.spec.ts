import { describe, expect, it } from 'vitest'
import {
  emptyNewGame,
  emptyPredictionDraft,
  pickDraftFrom,
  pickInput,
  predictionInput,
} from '../predictionDraft'
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

  it("stores a total's side as over / under, with the line unsigned", () => {
    const total = { ...draft, market: 'goals' as const, betType: 'total' as const, pick: '' }
    expect(predictionInput({ ...total, line: '2,5' })).toMatchObject({
      selection: 'over',
      line: 2.5,
    })
    expect(
      predictionInput({
        ...total,
        betType: 'team_total',
        pick: 'away',
        line: '1.5',
        overUnder: 'under',
      }),
    ).toMatchObject({ selection: 'away_under', line: 1.5 })
    // A typed sign does not pick the side.
    expect(predictionInput({ ...total, line: '-2,5' })).toMatchObject({
      selection: 'over',
      line: 2.5,
    })
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

const stored = { market: 'goals', bet_type: 'total', period: 'FT', selection: 'over', line: 2.5 }

describe('pickDraftFrom', () => {
  const pick = (bet_type: string, selection: string, line: number | null) =>
    pickDraftFrom({ market: 'goals', bet_type, period: 'HT', selection, line })

  it("shows a total's side in over / under and its size in Linha", () => {
    expect(pick('total', 'under', 2.5)).toEqual({
      market: 'goals',
      betType: 'total',
      period: 'HT',
      pick: '',
      line: '2,5',
      overUnder: 'under',
    })
    expect(pick('team_total', 'home_over', 1.5)).toMatchObject({
      pick: 'home',
      line: '1,5',
      overUnder: 'over',
    })
  })

  it('keeps a handicap signed and a side without a line blank', () => {
    expect(pick('handicap', 'away', -1)).toMatchObject({ pick: 'away', line: '-1' })
    expect(pick('btts', 'yes', null)).toMatchObject({ pick: 'yes', line: '' })
    expect(pickDraftFrom({ ...stored, line: 0.75 }, 'en-GB').line).toBe('0.75')
  })

  it('round-trips through pickInput', () => {
    for (const row of [
      stored,
      { ...stored, bet_type: 'result_total', market: 'result', selection: '1x_under', line: 3.5 },
      { ...stored, bet_type: 'other', selection: 'Golo nos 10 min', line: null },
    ]) {
      expect(pickInput(pickDraftFrom(row))).toEqual(row)
    }
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
