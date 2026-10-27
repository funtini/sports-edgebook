import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ref } from 'vue'
import { flushPromises } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { fakeSupabase, type Responder } from '@/stores/__tests__/fakeSupabase'
import type { PredictionWithRelations } from '@/types/db'
import { useSettlement } from '../useSettlement'

const mocked = vi.hoisted(() => ({ client: null as unknown }))
vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return mocked.client
  },
}))

const prediction = { id: 'p1', status: 'pending' } as PredictionWithRelations

function setup(respond: Responder) {
  mocked.client = fakeSupabase(respond).client
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('useSettlement', () => {
  it('shows the new status at once and keeps the saved row', async () => {
    let finish: (response: { data: unknown }) => void = () => {}
    setup(() => new Promise((resolve) => (finish = resolve)))
    const rows = ref([prediction])
    const { settle, saving } = useSettlement(rows)

    const done = settle(prediction, 'won')
    expect(rows.value[0]!.status).toBe('won')
    expect(saving.value.has('p1')).toBe(true)

    await flushPromises()
    finish({ data: { ...prediction, status: 'won', settled_at: 'now' } })
    await done
    expect(rows.value[0]).toMatchObject({ status: 'won', settled_at: 'now' })
    expect(saving.value.size).toBe(0)
  })

  it('rolls back and reports its own error when the save fails', async () => {
    setup(() => ({ error: { message: 'network down' } }))
    const rows = ref([prediction])
    const { settle, error } = useSettlement(rows)

    await settle(prediction, 'lost')
    expect(rows.value[0]!.status).toBe('pending')
    expect(error.value).toBe('Não foi possível guardar a liquidação.')
  })

  it('ignores a save that fails after the rows were reset for another day or game', async () => {
    let fail: (response: { error: unknown }) => void = () => {}
    setup(() => new Promise((resolve) => (fail = resolve)))
    const rows = ref([prediction])
    const { settle, error, saving, reset } = useSettlement(rows)

    const done = settle(prediction, 'won')
    await flushPromises()
    reset()
    const other = { id: 'p2', status: 'pending' } as PredictionWithRelations
    rows.value = [other]
    fail({ error: { message: 'network down' } })
    await done

    expect(error.value).toBeNull()
    expect(saving.value.size).toBe(0)
    expect(rows.value).toEqual([other])
  })
})
