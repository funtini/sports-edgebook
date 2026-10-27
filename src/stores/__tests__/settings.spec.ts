import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { argsOf, fakeSupabase, has, type Responder } from './fakeSupabase'
import { useSettingsStore } from '../settings'
import { DEFAULT_CONFIDENCE_ANCHORS } from '@/domain/confidence'
import { DEFAULT_MARKETS } from '@/domain/markets'

const mocked = vi.hoisted(() => ({ client: null as unknown }))
vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return mocked.client
  },
}))

const row = {
  user_id: 'u',
  unit_value: 20,
  currency: 'EUR',
  starting_bankroll_units: null,
  confidence_anchors: { '1': 0.45, '2': 0.55, '3': 0.65, '4': 0.75, '5': 0.85 },
  odds_bands: [1.5, 1.8, 2.2, 3, 5],
}

function setup(respond: Responder) {
  const fake = fakeSupabase(respond)
  mocked.client = fake.client
  return fake.queries
}

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('settings store', () => {
  it('exposes defaults before loading', () => {
    const store = useSettingsStore()
    expect(store.unitValue).toBe(10)
    expect(store.confidenceAnchors).toEqual(DEFAULT_CONFIDENCE_ANCHORS)
  })

  it('loads an existing row without seeding markets', async () => {
    const queries = setup(() => ({ data: row }))
    const store = useSettingsStore()
    await store.load()

    expect(queries.map((q) => q.table)).toEqual(['user_settings'])
    expect(store.unitValue).toBe(20)
    expect(store.confidenceAnchors[1]).toBe(0.45)
  })

  it('creates the row and seeds the default markets on first load', async () => {
    const queries = setup((q) => ({ data: has(q, 'maybeSingle') ? null : row }))
    await useSettingsStore().load()

    expect(queries.map((q) => q.table)).toEqual(['user_settings', 'user_settings', 'markets'])
    expect(argsOf(queries[1]!, 'insert')).toEqual([{}])
    const [markets, options] = argsOf(queries[2]!, 'upsert') as [unknown[], object]
    expect(markets).toEqual(DEFAULT_MARKETS)
    expect(options).toMatchObject({ ignoreDuplicates: true })
  })

  it('loads only once across concurrent callers', async () => {
    const queries = setup(() => ({ data: row }))
    const store = useSettingsStore()
    await Promise.all([store.ensureLoaded(), store.ensureLoaded()])
    await store.ensureLoaded()
    expect(queries).toHaveLength(1)
  })

  it('throws a clear error when Supabase is not configured', async () => {
    mocked.client = null
    await expect(useSettingsStore().load()).rejects.toThrow(/Supabase não está configurado/)
  })
})
