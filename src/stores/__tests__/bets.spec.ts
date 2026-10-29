import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { argsOf, fakeSupabase, has } from './fakeSupabase'
import { useBetsStore } from '../bets'

const mocked = vi.hoisted(() => ({ client: null as unknown }))
vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return mocked.client
  },
}))

const prediction = (id: number) => ({
  id: `p${id}`,
  odd: 2,
  status: 'won',
  is_punter: false,
  stake_units: null,
  probability: 0.55,
  confidence: 2,
  bookmaker: null,
  event: {
    kickoff_at: '2026-10-27T19:00:00Z',
    home_team: { name: 'Benfica' },
    away_team: { name: 'Porto' },
    league: null,
  },
  market: { category: '1X2', name: 'Casa' },
})

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('bets store', () => {
  it('loads settled predictions of the period, page by page, and every multiple', async () => {
    const all = Array.from({ length: 1001 }, (_, i) => prediction(i))
    const fake = fakeSupabase((q) => {
      if (q.table === 'multiples') {
        return {
          data: [
            { id: 'empty', is_placed: false, stake_units: null, legs: [] },
            {
              id: 'm',
              is_placed: false,
              stake_units: null,
              legs: [
                {
                  odd_at_selection: 2,
                  prediction: {
                    status: 'lost',
                    probability: 0.5,
                    event: { kickoff_at: '2026-10-27T19:00:00Z' },
                  },
                },
              ],
            },
          ],
        }
      }
      const [from, to] = argsOf(q, 'range') as [number, number]
      return { data: all.slice(from, to + 1) }
    })
    mocked.client = fake.client

    const bets = await useBetsStore().listSettled(new Date(2026, 9, 1), new Date(2026, 9, 28))

    const predictionQueries = fake.queries.filter((q) => q.table === 'predictions')
    expect(predictionQueries.map((q) => argsOf(q, 'range'))).toEqual([
      [0, 999],
      [1000, 1999],
    ])
    expect(argsOf(predictionQueries[0]!, 'neq')).toEqual(['status', 'pending'])
    expect(argsOf(predictionQueries[0]!, 'gte')).toEqual([
      'event.kickoff_at',
      new Date(2026, 9, 1).toISOString(),
    ])
    expect(argsOf(predictionQueries[0]!, 'lt')).toEqual([
      'event.kickoff_at',
      new Date(2026, 9, 29).toISOString(),
    ])
    expect(bets.filter((b) => b.kind === 'single')).toHaveLength(1001)
    expect(bets.filter((b) => b.kind === 'multiple')).toEqual([
      expect.objectContaining({ status: 'lost', stake: 1, real: false }),
    ])
  })

  it('has no lower bound for all time', async () => {
    const fake = fakeSupabase(() => ({ data: [] }))
    mocked.client = fake.client
    await useBetsStore().listSettled(null, new Date(2026, 9, 28))
    expect(fake.queries.some((q) => has(q, 'gte'))).toBe(false)
  })
})
