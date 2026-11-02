import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { argsOf, fakeSupabase, has, type Responder } from './fakeSupabase'
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
    ).rejects.toThrow(/validation.teamsDifferent/)
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
      useEventsStore().setScore('0b9f7c1e-3d1a-4c9e-9a51-1f2d3c4b5a60', {
        home_score: 2,
        away_score: null,
      }),
    ).rejects.toThrow(/validation.bothGoalsRequired/)
    expect(queries).toHaveLength(0)
  })

  it('rejects a malformed id when saving the score', async () => {
    const queries = setup(() => ({}))
    await expect(useEventsStore().setScore('e1', { home_score: 1, away_score: 0 })).rejects.toThrow(
      /validation.idInvalid/,
    )
    expect(queries).toHaveLength(0)
  })

  describe('editing', () => {
    const ID = '0b9f7c1e-3d1a-4c9e-9a51-1f2d3c4b5a60'
    const KEPT = '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f'
    const HOME = '2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f60'
    const AWAY = '3e4f5a6b-7c8d-4e9f-8a1b-2c3d4e5f6071'
    const row = (id: string, score: number | null = null) =>
      ({ id, home_score: score, away_score: score }) as never

    it('updates kickoff, league and teams, not the score', async () => {
      const queries = setup(() => ({ data: { id: ID } }))
      await useEventsStore().update(ID, {
        kickoff_at: '2026-10-27T20:00:00Z',
        home_team_id: HOME,
        away_team_id: AWAY,
      })
      expect(argsOf(queries[0]!, 'update')).toEqual([
        {
          kickoff_at: '2026-10-27T20:00:00Z',
          league_id: null,
          home_team_id: HOME,
          away_team_id: AWAY,
        },
      ])
      expect(argsOf(queries[0]!, 'eq')).toEqual(['id', ID])
    })

    it('rejects the same team at home and away', async () => {
      const queries = setup(() => ({}))
      await expect(
        useEventsStore().update(ID, {
          kickoff_at: '2026-10-27T20:00:00Z',
          home_team_id: HOME,
          away_team_id: HOME,
        }),
      ).rejects.toThrow(/validation.teamsDifferent/)
      expect(queries).toHaveLength(0)
    })

    it('lists the events on the local day of a kickoff', async () => {
      const queries = setup(() => ({ data: [] }))
      await useEventsStore().onDayOf(new Date(2026, 9, 27, 20).toISOString())
      expect(argsOf(queries[0]!, 'gte')).toEqual([
        'kickoff_at',
        new Date(2026, 9, 27).toISOString(),
      ])
      expect(argsOf(queries[0]!, 'lt')).toEqual(['kickoff_at', new Date(2026, 9, 28).toISOString()])
    })

    it('merges: moves the predictions first, then deletes the source', async () => {
      const queries = setup(() => ({ data: null }))
      const kept = row(KEPT, 1)
      expect(await useEventsStore().merge(row(ID), kept)).toBe(kept)
      expect(queries.map((q) => q.table)).toEqual(['predictions', 'events'])
      expect(argsOf(queries[0]!, 'update')).toEqual([{ event_id: KEPT }])
      expect(argsOf(queries[0]!, 'eq')).toEqual(['event_id', ID])
      expect(has(queries[1]!, 'delete')).toBe(true)
      expect(argsOf(queries[1]!, 'eq')).toEqual(['id', ID])
    })

    it("gives the kept event the source's score when it has none", async () => {
      const queries = setup((q) =>
        has(q, 'update') && q.table === 'events' ? { data: row(KEPT, 2) } : { data: null },
      )
      const kept = await useEventsStore().merge(row(ID, 2), row(KEPT))
      expect(kept.home_score).toBe(2)
      expect(queries.map((q) => q.table)).toEqual(['predictions', 'events', 'events'])
      expect(argsOf(queries[1]!, 'update')).toEqual([{ home_score: 2, away_score: 2 }])
    })

    it('stops before deleting when the predictions cannot move', async () => {
      const queries = setup(() => ({ error: { message: 'boom' } }))
      await expect(useEventsStore().merge(row(ID), row(KEPT))).rejects.toBeTruthy()
      expect(queries).toHaveLength(1)
    })

    it('refuses to merge an event into itself', async () => {
      const queries = setup(() => ({}))
      await expect(useEventsStore().merge(row(ID), row(ID))).rejects.toThrow(/into itself/)
      expect(queries).toHaveLength(0)
    })
  })

  it('throws a clear error when Supabase is not configured', async () => {
    mocked.client = null
    await expect(useEventsStore().getById('0b9f7c1e-3d1a-4c9e-9a51-1f2d3c4b5a60')).rejects.toThrow(
      /errors.supabaseNotConfigured/,
    )
  })
})
