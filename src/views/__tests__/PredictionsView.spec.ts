import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import PrimeVue from 'primevue/config'
import ToastService from 'primevue/toastservice'
import {
  argsOf,
  fakeSupabase,
  has,
  type Query,
  type Responder,
} from '@/stores/__tests__/fakeSupabase'
import { i18n } from '@/i18n'
import PredictionsView from '../PredictionsView.vue'

const mocked = vi.hoisted(() => ({ client: null as unknown }))
vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return mocked.client
  },
}))

const EVENT_ID = '0b9f7c1e-3d1a-4c9e-9a51-1f2d3c4b5a60'

const settingsRow = {
  user_id: 'u',
  unit_value: 10,
  currency: 'EUR',
  starting_bankroll_units: null,
  confidence_anchors: { '1': 0.4, '2': 0.55, '3': 0.65, '4': 0.75, '5': 0.85 },
  odds_bands: [1.5, 1.8, 2.2, 3, 5],
}

const TEAM_IDS: Record<string, string> = {
  Benfica: '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f',
  Porto: '2d3e4f5a-6b7c-4d8e-9f0a-1b2c3d4e5f6a',
}
const team = (name: string) => ({ id: TEAM_IDS[name], name, league_id: null })

/** A backend with no history, where saving a prediction succeeds unless `failPrediction`. */
function backend(options: { failPrediction?: () => boolean } = {}): Responder {
  return (q) => {
    const insert = argsOf(q, 'insert')?.[0] as Record<string, unknown> | undefined
    switch (q.table) {
      case 'user_settings':
        return { data: settingsRow }
      case 'teams':
        return insert ? { data: team(String(insert.name)) } : { data: [] }
      case 'events':
        return {
          data: {
            id: EVENT_ID,
            kickoff_at: '2026-10-27T20:00:00Z',
            ...insert,
            source: 'manual',
            external_id: null,
            home_team: team('Benfica'),
            away_team: team('Porto'),
            league: null,
          },
        }
      case 'predictions':
        if (!insert) return { data: [] }
        return options.failPrediction?.()
          ? { error: { code: '42501', message: 'permission denied for table predictions' } }
          : { data: { id: 'p', ...insert } }
      default:
        return { data: [] }
    }
  }
}

function setup(respond: Responder) {
  const fake = fakeSupabase(respond)
  mocked.client = fake.client
  return fake.queries
}

const inserted = (queries: Query[], table: string) =>
  queries.filter((q) => q.table === table && has(q, 'insert'))

async function render(props: { eventId?: string } = {}) {
  const wrapper = mount(PredictionsView, {
    props,
    global: { plugins: [PrimeVue, ToastService], stubs: { Toast: true } },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

const button = (wrapper: VueWrapper, label: string) =>
  wrapper.findAll('button').find((b) => b.text() === label)!

async function fillNewGame(wrapper: VueWrapper) {
  await button(wrapper, 'Novo evento').trigger('click')
  await wrapper.get('#new-time').setValue('20:00')
  await wrapper.get('#new-home').setValue('Benfica')
  await wrapper.get('#new-away').setValue('Porto')
}

async function fillPrediction(wrapper: VueWrapper) {
  await button(wrapper, 'Golos').trigger('click')
  await button(wrapper, 'Total').trigger('click')
  await wrapper.get('#line').setValue('2,5')
  await wrapper.get('#odd').setValue('1,85')
  await button(wrapper, '3Boa').trigger('click')
}

async function submit(wrapper: VueWrapper) {
  await wrapper.get('form').trigger('submit')
  await flushPromises()
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('PredictionsView', () => {
  it('shows only the event search until an event is picked', async () => {
    setup(backend())
    const wrapper = await render()

    expect(wrapper.find('#game').exists()).toBe(true)
    expect(wrapper.find('#odd').exists()).toBe(false)
    expect(button(wrapper, 'Resultado')).toBeUndefined()

    await button(wrapper, 'Novo evento').trigger('click')
    expect(wrapper.find('#odd').exists()).toBe(true)
  })

  it('shows inline PT-PT errors and saves nothing when the prediction is empty', async () => {
    const queries = setup(backend())
    const wrapper = await render({ eventId: EVENT_ID })

    await submit(wrapper)

    expect(wrapper.text()).toContain('Indica a seleção')
    expect(wrapper.text()).toContain('Odd inválida')
    expect(wrapper.text()).toContain('Escolhe a confiança')
    expect(inserted(queries, 'predictions')).toHaveLength(0)
  })

  it('saves a new game and prediction, then resets but keeps the game', async () => {
    const queries = setup(backend())
    const wrapper = await render()
    await fillNewGame(wrapper)
    await fillPrediction(wrapper)

    await submit(wrapper)

    expect(argsOf(inserted(queries, 'predictions')[0]!, 'insert')?.[0]).toMatchObject({
      event_id: EVENT_ID,
      market: 'goals',
      bet_type: 'total',
      period: 'FT',
      selection: 'over',
      line: 2.5,
      odd: 1.85,
      confidence: 3,
      probability: 0.65,
      is_punter: false,
      stake_units: null,
    })
    expect(wrapper.text()).toContain('Mesmo evento')
    expect(wrapper.text()).toContain('Benfica – Porto')
    expect((wrapper.get('#odd').element as HTMLInputElement).value).toBe('')
    expect(button(wrapper, '3Boa').attributes('aria-pressed')).toBe('false')
    expect(button(wrapper, 'Resultado').attributes('aria-pressed')).toBe('true')

    // Another market for the same game: no new event.
    await fillPrediction(wrapper)
    await submit(wrapper)
    expect(inserted(queries, 'events')).toHaveLength(1)
    expect(inserted(queries, 'predictions')).toHaveLength(2)

    await button(wrapper, 'Outro evento').trigger('click')
    expect(wrapper.find('#game').exists()).toBe(true)
  })

  it('keeps a game it created when the prediction fails, so a retry does not duplicate it', async () => {
    let fail = true
    const queries = setup(backend({ failPrediction: () => fail }))
    const wrapper = await render()
    await fillNewGame(wrapper)
    await fillPrediction(wrapper)

    await submit(wrapper)
    expect(wrapper.text()).toContain('Não foi possível guardar o prognóstico.')
    expect(wrapper.text()).not.toContain('permission denied')
    expect(wrapper.text()).toContain('Benfica – Porto')
    expect(wrapper.text()).not.toContain('Mesmo evento')
    // The prediction stays filled in for the retry.
    expect((wrapper.get('#odd').element as HTMLInputElement).value).toBe('1,85')

    fail = false
    await submit(wrapper)
    expect(inserted(queries, 'events')).toHaveLength(1)
    expect(inserted(queries, 'predictions')).toHaveLength(2)
    expect(wrapper.text()).toContain('Mesmo evento')
  })

  it('preselects the game from ?evento', async () => {
    setup(backend())
    const wrapper = await render({ eventId: EVENT_ID })

    expect(wrapper.text()).toContain('Benfica – Porto')
    expect(wrapper.find('#game').exists()).toBe(false)
  })

  it('still loads the form when the ?evento game cannot be loaded', async () => {
    const respond = backend()
    setup((q) => {
      if (q.table === 'events') return { error: { message: 'network down' } }
      if (q.table === 'predictions') return { data: [{ bookmaker: 'Betano' }] }
      return respond(q)
    })
    const wrapper = await render({ eventId: EVENT_ID })

    expect(wrapper.text()).not.toContain('Não foi possível carregar os dados.')
    expect(wrapper.find('#game').exists()).toBe(true)
    expect(wrapper.get('fieldset').attributes('disabled')).toBeUndefined()
  })

  it('flips the sign of the line for keyboards without a minus key', async () => {
    setup(backend())
    const wrapper = await render({ eventId: EVENT_ID })
    expect(wrapper.find('#line').exists()).toBe(false)
    await button(wrapper, 'Handicap').trigger('click')
    const line = wrapper.get('#line')
    await line.setValue('1,5')

    await wrapper.get('[aria-label="Trocar o sinal da linha"]').trigger('click')
    expect((line.element as HTMLInputElement).value).toBe('-1,5')
  })

  it('defaults to pre-match for an upcoming event and to live once it has started', async () => {
    vi.useFakeTimers({ toFake: ['Date'], now: new Date('2026-10-27T19:00:00Z') })
    const queries = setup(backend())
    const wrapper = await render({ eventId: EVENT_ID })
    expect(button(wrapper, 'Pré-jogo').attributes('aria-pressed')).toBe('true')

    vi.setSystemTime(new Date('2026-10-27T20:30:00Z'))
    await button(wrapper, 'Outro evento').trigger('click')
    await fillNewGame(wrapper)
    await wrapper.get('#new-date').setValue('2026-10-27')
    await wrapper.get('#new-time').setValue('00:00')
    expect(button(wrapper, 'Live').attributes('aria-pressed')).toBe('true')

    await fillPrediction(wrapper)
    await submit(wrapper)
    expect(argsOf(inserted(queries, 'predictions')[0]!, 'insert')?.[0]).toMatchObject({
      is_live: true,
    })
    vi.useRealTimers()
  })

  it('picks a recent event without searching', async () => {
    const respond = backend()
    setup((q) => {
      if (q.table === 'predictions' && has(q, 'limit')) {
        return {
          data: [
            {
              created_at: '2026-10-27T10:00:00Z',
              event: {
                id: EVENT_ID,
                kickoff_at: '2026-10-27T20:00:00Z',
                home_score: null,
                source: 'manual',
                external_id: null,
                home_team: team('Benfica'),
                away_team: team('Porto'),
                league: null,
              },
            },
          ],
        }
      }
      return respond(q)
    })
    const wrapper = await render()

    await wrapper.findAll('[data-recent-events] button')[0]!.trigger('click')
    expect(wrapper.text()).toContain('Benfica – Porto')
    expect(wrapper.find('#game').exists()).toBe(false)
    expect(wrapper.find('#odd').exists()).toBe(true)
  })

  it('offers the types of the market and only the sides of the type', async () => {
    setup(backend())
    const wrapper = await render({ eventId: EVENT_ID })
    const labels = () => wrapper.findAll('[role="group"] button').map((b) => b.text())

    expect(labels()).toEqual(expect.arrayContaining(['1X2', 'Dupla hipótese', 'Casa', 'Empate']))
    await button(wrapper, 'Golos').trigger('click')
    expect(labels()).not.toContain('1X2')
    expect(labels()).not.toContain('Casa')
    expect(labels()).toContain('Ambas marcam')

    await button(wrapper, 'Outro').trigger('click')
    expect(wrapper.find('#selection').exists()).toBe(true)
    expect(wrapper.find('#line').exists()).toBe(false)
  })

  it('in English, saves the catalogue codes', async () => {
    i18n.global.locale.value = 'en'
    const queries = setup(backend())
    const wrapper = await render()
    await button(wrapper, 'New event').trigger('click')
    await wrapper.get('#new-time').setValue('20:00')
    await wrapper.get('#new-home').setValue('Benfica')
    await wrapper.get('#new-away').setValue('Porto')
    await button(wrapper, 'Corners').trigger('click')
    await button(wrapper, 'Team total').trigger('click')
    await button(wrapper, 'HT').trigger('click')
    await button(wrapper, 'Away').trigger('click')
    await wrapper.get('#line').setValue('-1.5')
    await wrapper.get('#odd').setValue('1.85')
    await button(wrapper, '3Good').trigger('click')

    await submit(wrapper)

    expect(argsOf(inserted(queries, 'predictions')[0]!, 'insert')?.[0]).toMatchObject({
      market: 'corners',
      bet_type: 'team_total',
      period: 'HT',
      selection: 'away_under',
      line: 1.5,
    })
    expect(inserted(queries, 'markets')).toHaveLength(0)
  })
})
