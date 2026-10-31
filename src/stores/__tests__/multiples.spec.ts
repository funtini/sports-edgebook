import { beforeEach, describe, expect, it, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { argsOf, fakeSupabase, has, type Responder } from './fakeSupabase'
import { useMultiplesStore } from '../multiples'
import type { MultipleCreate } from '@/domain/schemas'

const mocked = vi.hoisted(() => ({ client: null as unknown }))
vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return mocked.client
  },
}))

const A = '0b9f7c1e-3d1a-4c9e-9a51-1f2d3c4b5a60'
const B = '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f'
const C = '2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a'

const generator = { mode: 'value' as const, params: { legs: 2, pool: 'all' } }

function setup(respond: Responder = (q) => (q.table === 'multiples' ? { data: { id: 'm' } } : {})) {
  const fake = fakeSupabase(respond)
  mocked.client = fake.client
  return fake.queries
}

const payload = (queries: ReturnType<typeof setup>) => ({
  multiple: argsOf(
    queries.find((q) => q.table === 'multiples')!,
    'insert',
  )?.[0],
  legs: argsOf(
    queries.find((q) => q.table === 'multiple_legs')!,
    'insert',
  )?.[0],
})

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('multiples store', () => {
  it('saves a placed mixed multiple with its legs, their origins and odds', async () => {
    const queries = setup()
    await useMultiplesStore().create({
      legs: [
        { prediction_id: A, odd: 1.85, origin: 'manual' },
        { prediction_id: B, odd: 2.1, origin: 'generated' },
        { prediction_id: C, odd: 1.333, origin: 'generated' },
      ],
      is_placed: true,
      stake_units: 1.5,
      generator,
    })
    const { multiple, legs } = payload(queries)
    expect(multiple).toEqual({
      origin: 'mixed',
      generator_mode: 'value',
      generator_params: { legs: 2, pool: 'all' },
      // 1,85 × 2,10 × 1,333 = 5,178705, kept to 3 decimals.
      total_odd: 5.179,
      is_placed: true,
      stake_units: 1.5,
    })
    expect(legs).toEqual([
      { multiple_id: 'm', prediction_id: A, odd_at_selection: 1.85, origin: 'manual' },
      { multiple_id: 'm', prediction_id: B, odd_at_selection: 2.1, origin: 'generated' },
      { multiple_id: 'm', prediction_id: C, odd_at_selection: 1.333, origin: 'generated' },
    ])
  })

  it('saves a simulated manual multiple without stake or generator', async () => {
    const queries = setup()
    await useMultiplesStore().create({
      legs: [
        { prediction_id: A, odd: 2, origin: 'manual' },
        { prediction_id: B, odd: 1.5, origin: 'manual' },
      ],
      is_placed: false,
      stake_units: 3,
      generator,
    })
    expect(payload(queries).multiple).toMatchObject({
      origin: 'manual',
      generator_mode: null,
      generator_params: null,
      total_odd: 3,
      is_placed: false,
      stake_units: null,
    })
  })

  it('marks an all-generated multiple as generated', async () => {
    const queries = setup()
    await useMultiplesStore().create({
      legs: [
        { prediction_id: A, odd: 2, origin: 'generated' },
        { prediction_id: B, odd: 1.5, origin: 'generated' },
      ],
      is_placed: false,
      generator: { mode: 'target_odd', params: { targetOdd: 3, tolerance: 0.1 } },
    })
    expect(payload(queries).multiple).toMatchObject({
      origin: 'generated',
      generator_mode: 'target_odd',
      generator_params: { targetOdd: 3, tolerance: 0.1 },
    })
  })

  it.each<[string, Partial<MultipleCreate>, RegExp]>([
    ['one leg', { legs: [{ prediction_id: A, odd: 2, origin: 'manual' }] }, /multipleMinLegs/],
    [
      'the same prediction twice',
      {
        legs: [
          { prediction_id: A, odd: 2, origin: 'manual' },
          { prediction_id: A, odd: 2, origin: 'manual' },
        ],
      },
      /multipleRepeatedLeg/,
    ],
    ['a placed bet without stake', { is_placed: true, stake_units: null }, /multipleStakeRequired/],
  ])('rejects %s before touching the database', async (_, override, error) => {
    const queries = setup()
    const input: MultipleCreate = {
      legs: [
        { prediction_id: A, odd: 2, origin: 'manual' },
        { prediction_id: B, odd: 1.5, origin: 'manual' },
      ],
      is_placed: false,
      ...override,
    }
    await expect(useMultiplesStore().create(input)).rejects.toThrow(error)
    expect(queries).toHaveLength(0)
  })

  it('deletes the multiple again when its legs fail to save', async () => {
    const queries = setup((q) => {
      if (q.table === 'multiple_legs') return { error: new Error('permission denied') }
      return { data: { id: 'm' } }
    })
    await expect(
      useMultiplesStore().create({
        legs: [
          { prediction_id: A, odd: 2, origin: 'manual' },
          { prediction_id: B, odd: 1.5, origin: 'manual' },
        ],
        is_placed: false,
      }),
    ).rejects.toThrow('permission denied')
    const cleanup = queries.filter((q) => q.table === 'multiples' && has(q, 'delete'))
    expect(cleanup).toHaveLength(1)
    expect(argsOf(cleanup[0]!, 'eq')).toEqual(['id', 'm'])
  })
})
