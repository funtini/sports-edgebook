import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { argsOf, fakeSupabase, type Responder } from './fakeSupabase'
import { useEventsStore } from '../events'

const mocked = vi.hoisted(() => ({ client: null as unknown }))
vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return mocked.client
  },
}))

function setup(respond: Responder) {
  const fake = fakeSupabase(respond)
  mocked.client = fake.client
  return fake.queries
}

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('events store', () => {
  it('searches events by team name or alias, upcoming first', async () => {
    vi.useFakeTimers({ now: new Date('2026-10-27T12:00:00Z') })
    const queries = setup((q) => {
      if (q.table === 'teams') return { data: [{ id: 't1' }] }
      if (q.table === 'team_aliases') return { data: [{ team_id: 't2' }, { team_id: 't1' }] }
      return {
        data: [
          { id: 'past', kickoff_at: '2026-10-20T20:00:00Z' },
          { id: 'next', kickoff_at: '2026-10-28T20:00:00Z' },
        ],
      }
    })

    const events = await useEventsStore().search(' benfica ')
    vi.useRealTimers()

    expect(events.map((e) => e.id)).toEqual(['next', 'past'])
    expect(argsOf(queries[0]!, 'ilike')).toEqual(['name', '%benfica%'])
    expect(argsOf(queries[2]!, 'or')).toEqual(['home_team_id.in.(t1,t2),away_team_id.in.(t1,t2)'])
  })

  it('returns no events when no team matches', async () => {
    const queries = setup(() => ({ data: [] }))
    expect(await useEventsStore().search('xyz')).toEqual([])
    expect(queries.map((q) => q.table)).toEqual(['teams', 'team_aliases'])
  })

  it('rejects an event with the same team at home and away', async () => {
    const queries = setup(() => ({}))
    const team = '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f'
    await expect(
      useEventsStore().create({
        kickoff_at: '2026-10-27T20:00:00Z',
        home_team_id: team,
        away_team_id: team,
      }),
    ).rejects.toThrow(/têm de ser diferentes/)
    expect(queries).toHaveLength(0)
  })

  it('treats a malformed id as no event without querying', async () => {
    const queries = setup(() => ({}))
    expect(await useEventsStore().getById('not-a-uuid')).toBeNull()
    expect(queries).toHaveLength(0)
  })

  it('saves the final score', async () => {
    const id = '0b9f7c1e-3d1a-4c9e-9a51-1f2d3c4b5a60'
    const queries = setup(() => ({ data: { id, home_score: 2, away_score: 1 } }))
    await useEventsStore().setScore(id, { home_score: 2, away_score: 1 })
    expect(argsOf(queries[0]!, 'update')).toEqual([{ home_score: 2, away_score: 1 }])
    expect(argsOf(queries[0]!, 'eq')).toEqual(['id', id])
  })

  it('rejects a score for one team only', async () => {
    const queries = setup(() => ({}))
    await expect(
      useEventsStore().setScore('e1', { home_score: 2, away_score: null }),
    ).rejects.toThrow(/duas equipas/)
    expect(queries).toHaveLength(0)
  })

  it('throws a clear error when Supabase is not configured', async () => {
    mocked.client = null
    await expect(useEventsStore().getById('0b9f7c1e-3d1a-4c9e-9a51-1f2d3c4b5a60')).rejects.toThrow(
      /Supabase não está configurado/,
    )
  })
})
