import { describe, expect, it } from 'vitest'
import { betFromMultiple, betFromPrediction, type BetPrediction } from '../bets'
import type { BetStatus } from '../settlement'

const prediction = (overrides: Partial<BetPrediction> = {}): BetPrediction => ({
  odd: 1.8,
  status: 'won',
  is_punter: true,
  stake_units: 2,
  probability: 0.65,
  confidence: 3,
  bookmaker: 'Betano',
  is_live: false,
  event: {
    kickoff_at: '2026-10-27T20:00:00Z',
    home_team: { name: 'Benfica' },
    away_team: { name: 'Porto' },
    league: { name: 'Liga Portugal' },
  },
  market: 'goals',
  bet_type: 'total',
  period: 'HT',
  ...overrides,
})

describe('betFromPrediction', () => {
  it('maps a punter single with its dimensions', () => {
    expect(betFromPrediction(prediction())).toEqual({
      kind: 'single',
      status: 'won',
      odd: 1.8,
      stake: 2,
      real: true,
      probability: 0.65,
      date: '2026-10-27T20:00:00Z',
      market: 'goals',
      betType: 'total',
      period: 'HT',
      live: false,
      leagueName: 'Liga Portugal',
      teams: ['Benfica', 'Porto'],
      confidence: 3,
      valueBand: 'favourable',
      bookmaker: 'Betano',
    })
  })

  it('puts a non-punter single on 1 virtual unit, without a league', () => {
    const bet = betFromPrediction(
      prediction({
        is_punter: false,
        stake_units: null,
        event: { ...prediction().event, league: null },
      }),
    )
    expect(bet).toMatchObject({ stake: 1, real: false, leagueName: null })
  })
})

const leg = (status: BetStatus, odd: number, probability: number, kickoff: string) => ({
  odd_at_selection: odd,
  prediction: { status, probability, event: { kickoff_at: kickoff } },
})

describe('betFromMultiple', () => {
  it('follows the legs: void legs at 1.00, product of probabilities, first kickoff', () => {
    const bet = betFromMultiple({
      is_placed: true,
      stake_units: 3,
      legs: [
        leg('won', 1.8, 0.65, '2026-10-27T20:00:00Z'),
        leg('void', 2.1, 0.5, '2026-10-26T18:00:00Z'),
        leg('won', 1.5, 0.75, '2026-10-27T15:00:00Z'),
      ],
    })
    expect(bet).toMatchObject({
      kind: 'multiple',
      status: 'won',
      stake: 3,
      real: true,
      date: '2026-10-26T18:00:00Z',
    })
    expect(bet!.odd).toBeCloseTo(2.7)
    expect(bet!.probability).toBeCloseTo(0.65 * 0.5 * 0.75)
  })

  it('puts a simulated multiple on 1 virtual unit, lost when a leg lost', () => {
    const bet = betFromMultiple({
      is_placed: false,
      stake_units: null,
      legs: [
        leg('won', 1.8, 0.65, '2026-10-27T20:00:00Z'),
        leg('lost', 2, 0.5, '2026-10-27T20:00:00Z'),
      ],
    })
    expect(bet).toMatchObject({ status: 'lost', stake: 1, real: false })
  })

  it('is null without legs', () => {
    expect(betFromMultiple({ is_placed: false, stake_units: null, legs: [] })).toBeNull()
  })
})
