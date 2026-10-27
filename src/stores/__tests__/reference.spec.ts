import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { argsOf, fakeSupabase, has, type Responder } from './fakeSupabase'
import { useReferenceStore } from '../reference'

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

describe('reference store', () => {
  it('returns an existing league matched case-insensitively', async () => {
    const existing = { id: 'l1', name: 'Liga Portugal' }
    const queries = setup(() => ({ data: [existing] }))

    expect(await useReferenceStore().ensureLeague('  liga   portugal ')).toBe(existing)
    expect(argsOf(queries[0]!, 'ilike')).toEqual(['name', 'liga portugal'])
    expect(queries).toHaveLength(1)
  })

  it('creates a team in the given league when none matches', async () => {
    const created = { id: 't1', name: 'Benfica', league_id: 'l1' }
    const queries = setup((q) => ({ data: has(q, 'insert') ? created : [] }))
    const store = useReferenceStore()

    expect(await store.ensureTeam('Benfica', 'l1')).toBe(created)
    expect(argsOf(queries[1]!, 'insert')).toEqual([{ name: 'Benfica', league_id: 'l1' }])
    expect(store.teams).toEqual([created])
  })

  it('matches markets on category and name, escaping wildcards', async () => {
    const queries = setup((q) => ({ data: has(q, 'insert') ? { id: 'm1' } : [] }))
    await useReferenceStore().ensureMarket('Golos', 'Mais_de 100%')

    expect(queries[0]!.ops.filter(([m]) => m === 'ilike').map(([, args]) => args)).toEqual([
      ['category', 'Golos'],
      ['name', 'Mais\\_de 100\\%'],
    ])
  })

  it('rejects empty names', async () => {
    setup(() => ({}))
    await expect(useReferenceStore().ensureLeague('   ')).rejects.toThrow(
      'O nome não pode estar vazio.',
    )
  })

  it('throws a clear error when Supabase is not configured', async () => {
    mocked.client = null
    await expect(useReferenceStore().load()).rejects.toThrow(/Supabase não está configurado/)
  })
})
