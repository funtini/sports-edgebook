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

  it('escapes wildcards when matching names', async () => {
    const queries = setup((q) => ({ data: has(q, 'insert') ? { id: 't1' } : [] }))
    await useReferenceStore().ensureTeam('Sub_23 100%', null)

    expect(argsOf(queries[0]!, 'ilike')).toEqual(['name', 'Sub\\_23 100\\%'])
  })

  it('rejects empty names', async () => {
    setup(() => ({}))
    await expect(useReferenceStore().ensureLeague('   ')).rejects.toThrow('errors.emptyName')
  })

  it('throws a clear error when Supabase is not configured', async () => {
    mocked.client = null
    await expect(useReferenceStore().load()).rejects.toThrow(/errors.supabaseNotConfigured/)
  })

  describe('removeIfUnused', () => {
    const TEAM = '2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f60'

    it('deletes a team no event uses', async () => {
      const queries = setup(() => ({ data: [] }))
      const store = useReferenceStore()
      store.teams = [{ id: TEAM, name: 'Cantos Marítimo' } as never]
      expect(await store.removeIfUnused(TEAM)).toBe(true)
      expect(argsOf(queries[0]!, 'or')).toEqual([`home_team_id.eq.${TEAM},away_team_id.eq.${TEAM}`])
      expect(queries[1]!.table).toBe('teams')
      expect(has(queries[1]!, 'delete')).toBe(true)
      expect(store.teams).toEqual([])
    })

    it('keeps a team an event still uses', async () => {
      const queries = setup(() => ({ data: [{ id: 'e' }] }))
      expect(await useReferenceStore().removeIfUnused(TEAM)).toBe(false)
      expect(queries).toHaveLength(1)
    })

    it('rejects a malformed id without querying', async () => {
      const queries = setup(() => ({}))
      await expect(useReferenceStore().removeIfUnused('x),id.neq.(y')).rejects.toThrow(
        /validation.idInvalid/,
      )
      expect(queries).toHaveLength(0)
    })
  })
})
