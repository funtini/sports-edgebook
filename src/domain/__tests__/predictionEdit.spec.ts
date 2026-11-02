import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIDENCE_ANCHORS } from '../confidence'
import { editDraftFrom, editedProbability, predictionEditInput } from '../predictionEdit'
import { predictionUpdateSchema } from '../schemas'

const stored = {
  odd: 1.85,
  confidence: 4,
  is_live: false,
  is_punter: true,
  stake_units: 2.5,
  bookmaker: 'Betano',
  notes: null,
}

describe('editDraftFrom', () => {
  it('fills the form from the stored row, numbers in the active language', () => {
    expect(editDraftFrom(stored)).toEqual({
      odd: '1,85',
      confidence: 4,
      isLive: false,
      isPunter: true,
      stake: '2,5',
      bookmaker: 'Betano',
      notes: '',
    })
    expect(editDraftFrom({ ...stored, odd: 1234.5 }, 'en-GB').odd).toBe('1234.5')
  })

  it('leaves the stake blank without one', () => {
    expect(editDraftFrom({ ...stored, is_punter: false, stake_units: null }).stake).toBe('')
  })
})

describe('predictionEditInput', () => {
  it('round-trips an untouched row', () => {
    const parsed = predictionUpdateSchema.parse(predictionEditInput(editDraftFrom(stored)))
    expect(parsed).toEqual(stored)
  })

  it('drops the stake and bookmaker when the punter flag is off', () => {
    const draft = { ...editDraftFrom(stored), isPunter: false }
    expect(predictionUpdateSchema.parse(predictionEditInput(draft))).toMatchObject({
      is_punter: false,
      stake_units: null,
      bookmaker: null,
    })
  })

  it('needs a stake for a punter bet and an odd above 1', () => {
    const draft = { ...editDraftFrom(stored), stake: '', odd: '1' }
    const issues = predictionUpdateSchema.safeParse(predictionEditInput(draft)).error?.issues
    expect(issues?.map((i) => [i.path[0], i.message])).toEqual([
      ['odd', 'validation.oddAboveOne'],
      ['stake_units', 'validation.punterStakeRequired'],
    ])
  })

  it('trims notes and saves blank ones as null', () => {
    const draft = { ...editDraftFrom(stored), notes: '  late goal  ', bookmaker: ' ' }
    expect(predictionEditInput(draft)).toMatchObject({ notes: 'late goal', bookmaker: null })
    expect(predictionEditInput({ ...draft, notes: '   ' }).notes).toBeNull()
  })
})

describe('editedProbability', () => {
  const anchors = { ...DEFAULT_CONFIDENCE_ANCHORS, 3: 0.6 }

  it('keeps the probability stored at logging time while the level is the same', () => {
    expect(editedProbability({ confidence: 3, probability: 0.65 }, 3, anchors)).toBe(0.65)
  })

  it("takes a new level's probability from the current anchors", () => {
    expect(editedProbability({ confidence: 4, probability: 0.8 }, 3, anchors)).toBe(0.6)
  })
})
