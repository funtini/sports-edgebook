import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { argsOf, fakeSupabase, has, type Responder } from './fakeSupabase'
import { useSettingsStore } from '../settings'
import { DEFAULT_CONFIDENCE_ANCHORS } from '@/domain/confidence'

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
  money_display: 'units',
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
    expect(store.moneyDisplay).toBe('units')
    expect(store.confidenceAnchors).toEqual(DEFAULT_CONFIDENCE_ANCHORS)
  })

  it('loads an existing row', async () => {
    const queries = setup(() => ({ data: row }))
    const store = useSettingsStore()
    await store.load()

    expect(queries.map((q) => q.table)).toEqual(['user_settings'])
    expect(store.unitValue).toBe(20)
    expect(store.confidenceAnchors[1]).toBe(0.45)
  })

  it('creates the row with defaults on first load', async () => {
    const queries = setup((q) => ({ data: has(q, 'maybeSingle') ? null : row }))
    await useSettingsStore().load()

    expect(queries.map((q) => q.table)).toEqual(['user_settings', 'user_settings'])
    expect(argsOf(queries[1]!, 'insert')).toEqual([{}])
  })

  it('loads only once across concurrent callers', async () => {
    const queries = setup(() => ({ data: row }))
    const store = useSettingsStore()
    await Promise.all([store.ensureLoaded(), store.ensureLoaded()])
    await store.ensureLoaded()
    expect(queries).toHaveLength(1)
  })

  it('saves the unit value and bankroll for the loaded user', async () => {
    const queries = setup((q) =>
      has(q, 'update')
        ? { data: { ...row, unit_value: 30, starting_bankroll_units: 50 } }
        : { data: row },
    )
    const store = useSettingsStore()
    await store.update({ unit_value: 30, starting_bankroll_units: 50 })

    const update = queries[1]!
    expect(argsOf(update, 'update')).toEqual([{ unit_value: 30, starting_bankroll_units: 50 }])
    expect(argsOf(update, 'eq')).toEqual(['user_id', 'u'])
    expect(store.unitValue).toBe(30)
    expect(store.settings?.starting_bankroll_units).toBe(50)
  })

  it('saves and exposes the money display', async () => {
    const queries = setup((q) =>
      has(q, 'update') ? { data: { ...row, money_display: 'euros' } } : { data: row },
    )
    const store = useSettingsStore()
    await store.update({ unit_value: 20, starting_bankroll_units: null, money_display: 'euros' })

    expect(argsOf(queries[1]!, 'update')).toEqual([
      { unit_value: 20, starting_bankroll_units: null, money_display: 'euros' },
    ])
    expect(store.moneyDisplay).toBe('euros')
  })

  it('rejects an invalid unit value without querying', async () => {
    const queries = setup(() => ({ data: row }))
    await expect(
      useSettingsStore().update({ unit_value: 0, starting_bankroll_units: null }),
    ).rejects.toThrow(/validation.unitValuePositive/)
    expect(queries).toHaveLength(0)
  })

  it('throws a clear error when Supabase is not configured', async () => {
    mocked.client = null
    await expect(useSettingsStore().load()).rejects.toThrow(/errors.supabaseNotConfigured/)
  })

  it('averages the last priced reads of each choice, null with none', async () => {
    const queries = setup((q) => {
      const models = argsOf(q, 'in')?.[1] as string[]
      if (models.includes('claude-sonnet-5-5')) {
        return { data: [{ model: 'claude-sonnet-5-5', input_tokens: 2000, output_tokens: 1000 }] }
      }
      return { data: [] }
    })
    const costs = await useSettingsStore().recentSlipCosts()

    expect(costs.economy).toBeNull()
    expect(costs.best).toBeNull()
    expect(costs.balanced?.reads).toBe(1)
    expect(costs.balanced?.usd).toBeCloseTo(0.014)
    expect(queries.map((q) => q.table)).toEqual(['slip_reads', 'slip_reads', 'slip_reads'])
    expect(argsOf(queries[0]!, 'order')).toEqual(['created_at', { ascending: false }])
    expect(argsOf(queries[0]!, 'limit')).toEqual([3])
  })
})
