import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { argsOf, fakeSupabase, type Query, type Responder } from './fakeSupabase'
import { usePredictionsStore } from '../predictions'
import { useSettingsStore } from '../settings'

const mocked = vi.hoisted(() => ({ client: null as unknown }))
vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return mocked.client
  },
}))

const input = {
  event_id: '0b9f7c1e-3d1a-4c9e-9a51-1f2d3c4b5a60',
  market_id: '6a1e2f3d-4c5b-4a69-8b7c-0d1e2f3a4b5c',
  selection: 'Benfica',
  odd: 1.8,
  confidence: 3,
}

const settingsRow = (anchor3: number) => ({
  user_id: 'u',
  unit_value: 10,
  currency: 'EUR',
  starting_bankroll_units: null,
  confidence_anchors: { '1': 0.4, '2': 0.55, '3': anchor3, '4': 0.75, '5': 0.85 },
  odds_bands: [1.5, 1.8, 2.2, 3, 5],
})

function setup(respond: Responder = () => ({})) {
  const fake = fakeSupabase(respond)
  mocked.client = fake.client
  return fake.queries
}

const inserts = (queries: Query[]) =>
  queries.filter((q) => q.table === 'predictions').map((q) => argsOf(q, 'insert')?.[0])

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('predictions store', () => {
  it('throws a clear error when Supabase is not configured', async () => {
    mocked.client = null
    await expect(usePredictionsStore().listPending()).rejects.toThrow(
      /Supabase não está configurado/,
    )
  })

  it("stores the probability from the user's anchors at creation time", async () => {
    let anchor3 = 0.7
    const queries = setup((q) =>
      q.table === 'user_settings' ? { data: settingsRow(anchor3) } : { data: { id: 'p' } },
    )
    const store = usePredictionsStore()

    await store.create(input)
    expect(inserts(queries)[0]).toMatchObject({ confidence: 3, probability: 0.7 })

    // Recalibrating changes new predictions only; the first insert keeps 0.7.
    anchor3 = 0.6
    await useSettingsStore().load()
    await store.create(input)
    expect(inserts(queries).map((row) => (row as { probability: number }).probability)).toEqual([
      0.7, 0.6,
    ])
  })

  it('validates input before touching the database', async () => {
    const queries = setup()
    await expect(usePredictionsStore().create({ ...input, odd: 1 })).rejects.toThrow(/maior que 1/)
    expect(queries).toHaveLength(0)
  })

  it('sets settled_at when settling and clears it when back to pending', async () => {
    const queries = setup(() => ({ data: { id: 'p' } }))
    const store = usePredictionsStore()

    await store.settle('p', 'won')
    const settled = argsOf(queries[0]!, 'update')?.[0] as { status: string; settled_at: string }
    expect(settled.status).toBe('won')
    expect(Date.parse(settled.settled_at)).not.toBeNaN()

    await store.settle('p', 'pending')
    expect(argsOf(queries[1]!, 'update')?.[0]).toEqual({ status: 'pending', settled_at: null })
  })

  it('lists predictions on games of a local day, by kickoff', async () => {
    const row = (id: string, kickoff_at: string) => ({
      id,
      created_at: '2026-10-01T00:00:00Z',
      event: { kickoff_at },
    })
    const queries = setup(() => ({
      data: [row('late', '2026-10-27T21:00:00Z'), row('early', '2026-10-27T15:00:00Z')],
    }))

    const day = new Date(2026, 9, 27, 13, 30)
    const rows = await usePredictionsStore().listByDate(day)

    expect(rows.map((r) => r.id)).toEqual(['early', 'late'])
    expect(argsOf(queries[0]!, 'gte')).toEqual([
      'event.kickoff_at',
      new Date(2026, 9, 27).toISOString(),
    ])
    expect(argsOf(queries[0]!, 'lt')).toEqual([
      'event.kickoff_at',
      new Date(2026, 9, 28).toISOString(),
    ])
  })

  it('lists bookmakers used before, most used first', async () => {
    const queries = setup(() => ({
      data: [{ bookmaker: 'Betclic' }, { bookmaker: 'Betano' }, { bookmaker: 'Betano' }],
    }))
    expect(await usePredictionsStore().listBookmakers()).toEqual(['Betano', 'Betclic'])
    expect(argsOf(queries[0]!, 'not')).toEqual(['bookmaker', 'is', null])
  })

  it('surfaces database errors', async () => {
    setup(() => ({ error: new Error('permission denied') }))
    await expect(usePredictionsStore().remove('p')).rejects.toThrow('permission denied')
  })
})
