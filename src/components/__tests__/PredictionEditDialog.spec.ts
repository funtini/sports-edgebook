import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import PrimeVue from 'primevue/config'
import ToastService from 'primevue/toastservice'
import { argsOf, fakeSupabase, has, type Query } from '@/stores/__tests__/fakeSupabase'
import type { PredictionWithRelations } from '@/types/db'
import PredictionEditDialog from '../PredictionEditDialog.vue'

const mocked = vi.hoisted(() => ({ client: null as unknown }))
vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return mocked.client
  },
}))

const prediction = (overrides: Partial<PredictionWithRelations> = {}) =>
  ({
    id: 'p',
    event_id: 'e',
    market: 'goals',
    bet_type: 'total',
    period: 'FT',
    selection: 'over',
    line: 2.5,
    odd: 1.9,
    confidence: 3,
    probability: 0.62,
    is_live: false,
    is_punter: false,
    stake_units: null,
    bookmaker: null,
    notes: null,
    status: 'won',
    event: {
      id: 'e',
      kickoff_at: '2026-11-02T20:00:00Z',
      home_team: { id: 'h', name: 'Benfica' },
      away_team: { id: 'a', name: 'Porto' },
      league: null,
    },
    ...overrides,
  }) as PredictionWithRelations

const settingsRow = {
  user_id: 'u',
  unit_value: 10,
  currency: 'EUR',
  starting_bankroll_units: null,
  confidence_anchors: { '1': 0.4, '2': 0.55, '3': 0.65, '4': 0.7, '5': 0.85 },
  odds_bands: [1.5, 1.8, 2.2, 3, 5],
}

function setup(fail = false) {
  const fake = fakeSupabase((q: Query) => {
    if (q.table === 'user_settings') return { data: settingsRow }
    if (has(q, 'update')) {
      if (fail) return { error: { message: 'boom' } }
      const fields = argsOf(q, 'update')![0] as object
      return { data: { ...prediction(), ...fields } }
    }
    return { data: [{ bookmaker: 'Betano' }] }
  })
  mocked.client = fake.client
  return fake.queries
}

const mounted: VueWrapper[] = []
afterEach(() => mounted.splice(0).forEach((w) => w.unmount()))

function render(row = prediction()) {
  const wrapper = mount(PredictionEditDialog, {
    props: { prediction: row },
    global: { plugins: [PrimeVue, ToastService] },
    attachTo: document.body,
  })
  mounted.push(wrapper)
  return wrapper
}

const updates = (queries: Query[]) =>
  queries.filter((q) => has(q, 'update')).map((q) => argsOf(q, 'update')![0])

beforeEach(() => {
  setActivePinia(createPinia())
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('PredictionEditDialog', () => {
  it('starts from the stored row, with the game and the bet summary', async () => {
    setup()
    const wrapper = render()
    await flushPromises()
    expect(wrapper.find('[data-event]').text()).toBe('Benfica – Porto')
    expect(wrapper.find('[data-summary]').text()).toContain('Golos - Total - FT')
    expect((wrapper.find('#edit-odd').element as HTMLInputElement).value).toBe('1,9')
    const pressed = wrapper.findAll('button[aria-pressed="true"]').map((b) => b.text())
    expect(pressed).toEqual(['Pré-jogo', '3Boa'])
  })

  it('turns the punter bet on and saves the edited fields, keeping the stored probability', async () => {
    const queries = setup()
    const wrapper = render()
    await flushPromises()

    await wrapper.find('#edit-odd').setValue('2,05')
    await wrapper.find('#is-punter').setValue(true)
    expect((wrapper.find('#stake').element as HTMLInputElement).value).toBe('1')
    await wrapper.find('#stake').setValue('2,5')
    await wrapper.find('form').trigger('submit')
    await flushPromises()

    expect(updates(queries)).toEqual([
      {
        odd: 2.05,
        confidence: 3,
        is_live: false,
        is_punter: true,
        stake_units: 2.5,
        bookmaker: null,
        notes: null,
        probability: 0.62,
      },
    ])
    const saved = wrapper.emitted('saved')![0]![0] as PredictionWithRelations
    expect(saved).toMatchObject({ odd: 2.05, stake_units: 2.5, status: 'won' })
  })

  it("takes a new level's probability from the current anchors", async () => {
    const queries = setup()
    const wrapper = render()
    await flushPromises()
    const level4 = wrapper.findAll('button[aria-pressed]').find((b) => b.text().startsWith('4'))!
    await level4.trigger('click')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(updates(queries)[0]).toMatchObject({ confidence: 4, probability: 0.7 })
  })

  it('shows field errors and saves nothing while invalid', async () => {
    const queries = setup()
    const wrapper = render(prediction({ is_punter: true, stake_units: 1 }))
    await flushPromises()
    await wrapper.find('#edit-odd').setValue('1')
    await wrapper.find('#stake').setValue('')
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('A odd tem de ser maior que 1')
    expect(wrapper.find('#stake-error').exists()).toBe(true)
    expect(updates(queries)).toHaveLength(0)
    expect(wrapper.emitted('saved')).toBeUndefined()
  })

  it('keeps the dialog open with a message when the save fails', async () => {
    setup(true)
    const wrapper = render()
    await flushPromises()
    await wrapper.find('form').trigger('submit')
    await flushPromises()
    expect(wrapper.text()).toContain('Não foi possível guardar as alterações.')
    expect(wrapper.emitted('saved')).toBeUndefined()
  })

  it('closes with Escape, the close button and Cancelar', async () => {
    setup()
    const wrapper = render()
    await flushPromises()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await wrapper.find('[aria-label="Fechar"]').trigger('click')
    const cancel = wrapper.findAll('button').find((b) => b.text() === 'Cancelar')!
    await cancel.trigger('click')
    expect(wrapper.emitted('close')).toHaveLength(3)
  })
})
