import { describe, expect, it } from 'vitest'
import {
  confidenceAnchorsSchema,
  eventCreateSchema,
  marketFormSchema,
  newGameFormSchema,
  predictionCreateSchema,
  predictionFormSchema,
} from '../schemas'

const EVENT_ID = '0b9f7c1e-3d1a-4c9e-9a51-1f2d3c4b5a60'
const MARKET_ID = '6a1e2f3d-4c5b-4a69-8b7c-0d1e2f3a4b5c'
const BENFICA = '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f'
const PORTO = '2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a'

const prediction = {
  event_id: EVENT_ID,
  market_id: MARKET_ID,
  selection: 'Benfica',
  odd: 1.8,
  confidence: 3,
}

function issuePaths(result: { success: boolean; error?: { issues: { path: PropertyKey[] }[] } }) {
  return result.error?.issues.map((issue) => issue.path.join('.')) ?? []
}

describe('predictionCreateSchema', () => {
  it('accepts a minimal history-only prediction and defaults the punter flag to off', () => {
    const parsed = predictionCreateSchema.parse(prediction)
    expect(parsed.is_punter).toBe(false)
  })

  it('rejects an odd of 1 or less', () => {
    expect(issuePaths(predictionCreateSchema.safeParse({ ...prediction, odd: 1 }))).toEqual(['odd'])
    expect(predictionCreateSchema.safeParse({ ...prediction, odd: 1.01 }).success).toBe(true)
  })

  it('only accepts whole confidence levels from 1 to 5', () => {
    for (const confidence of [0, 6, 2.5]) {
      expect(issuePaths(predictionCreateSchema.safeParse({ ...prediction, confidence }))).toEqual([
        'confidence',
      ])
    }
    for (const confidence of [1, 5]) {
      expect(predictionCreateSchema.safeParse({ ...prediction, confidence }).success).toBe(true)
    }
  })

  it('requires stake_units when the punter flag is on', () => {
    const result = predictionCreateSchema.safeParse({ ...prediction, is_punter: true })
    expect(issuePaths(result)).toEqual(['stake_units'])
    expect(
      predictionCreateSchema.safeParse({ ...prediction, is_punter: true, stake_units: 0.5 })
        .success,
    ).toBe(true)
  })

  it('rejects a non-positive stake and an empty selection', () => {
    expect(issuePaths(predictionCreateSchema.safeParse({ ...prediction, stake_units: 0 }))).toEqual(
      ['stake_units'],
    )
    expect(
      issuePaths(predictionCreateSchema.safeParse({ ...prediction, selection: '  ' })),
    ).toEqual(['selection'])
  })

  it('rejects a closing odd of 1 or less', () => {
    expect(
      issuePaths(predictionCreateSchema.safeParse({ ...prediction, closing_odd: 0.9 })),
    ).toEqual(['closing_odd'])
  })
})

describe('eventCreateSchema', () => {
  const event = {
    kickoff_at: '2026-10-27T20:00:00Z',
    home_team_id: BENFICA,
    away_team_id: PORTO,
  }

  it('accepts an event with different teams', () => {
    expect(eventCreateSchema.safeParse(event).success).toBe(true)
    expect(
      eventCreateSchema.safeParse({ ...event, kickoff_at: '2026-10-27T20:00:00+00:00' }).success,
    ).toBe(true)
  })

  it('rejects the same team at home and away', () => {
    expect(issuePaths(eventCreateSchema.safeParse({ ...event, away_team_id: BENFICA }))).toEqual([
      'away_team_id',
    ])
  })

  it('rejects an invalid kickoff', () => {
    expect(issuePaths(eventCreateSchema.safeParse({ ...event, kickoff_at: 'amanhã' }))).toEqual([
      'kickoff_at',
    ])
  })
})

describe('confidenceAnchorsSchema', () => {
  it('parses the jsonb anchors into numeric keys', () => {
    expect(
      confidenceAnchorsSchema.parse({ '1': 0.4, '2': 0.55, '3': 0.65, '4': 0.75, '5': 0.85 }),
    ).toEqual({ 1: 0.4, 2: 0.55, 3: 0.65, 4: 0.75, 5: 0.85 })
  })

  it('rejects missing levels and probabilities outside (0, 1)', () => {
    expect(confidenceAnchorsSchema.safeParse({ '1': 0.4 }).success).toBe(false)
    expect(
      confidenceAnchorsSchema.safeParse({ '1': 0.4, '2': 0.55, '3': 0.65, '4': 0.75, '5': 1 })
        .success,
    ).toBe(false)
  })
})

describe('predictionFormSchema', () => {
  const { event_id: _event, market_id: _market, ...fields } = prediction

  it('validates the prediction fields without game or market ids', () => {
    expect(predictionFormSchema.safeParse(fields).success).toBe(true)
    expect(issuePaths(predictionFormSchema.safeParse({ ...fields, is_punter: true }))).toEqual([
      'stake_units',
    ])
  })

  it('asks for the confidence and odd in PT-PT when missing', () => {
    const result = predictionFormSchema.safeParse({ selection: 'Benfica' })
    expect(result.error?.issues.map((i) => i.message)).toEqual([
      'Odd inválida',
      'Escolhe a confiança',
    ])
  })
})

describe('marketFormSchema', () => {
  it('tidies names and requires both', () => {
    expect(marketFormSchema.parse({ category: ' Golos ', name: 'Mais  de' })).toEqual({
      category: 'Golos',
      name: 'Mais de',
    })
    expect(issuePaths(marketFormSchema.safeParse({ category: ' ', name: '' }))).toEqual([
      'category',
      'name',
    ])
  })
})

describe('newGameFormSchema', () => {
  const game = { date: '2026-10-27', time: '20:15', league: '', home: 'Benfica', away: 'Porto' }

  it('reads date and time as local time and leaves a blank league out', () => {
    expect(newGameFormSchema.parse(game)).toEqual({
      kickoff_at: new Date(2026, 9, 27, 20, 15).toISOString(),
      league: null,
      home: 'Benfica',
      away: 'Porto',
    })
  })

  it('requires date, time and both teams', () => {
    const result = newGameFormSchema.safeParse({ ...game, time: '', home: ' ', away: '' })
    expect(issuePaths(result)).toEqual(['time', 'home', 'away'])
  })

  it('rejects the same team twice, ignoring case and extra spaces', () => {
    const result = newGameFormSchema.safeParse({
      ...game,
      home: 'Sporting  CP',
      away: 'sporting cp',
    })
    expect(issuePaths(result)).toEqual(['away'])
  })
})
