import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, RouterLinkStub, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import PrimeVue from 'primevue/config'
import { argsOf, fakeSupabase, has, type Responder } from '@/stores/__tests__/fakeSupabase'
import EventView from '../EventView.vue'

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

const event = (overrides: Record<string, unknown> = {}) => ({
  id: EVENT_ID,
  kickoff_at: '2026-10-27T20:00:00Z',
  home_score: null,
  away_score: null,
  source: 'manual',
  external_id: null,
  home_team: { id: 'h', name: 'Benfica' },
  away_team: { id: 'a', name: 'Porto' },
  league: { id: 'l', name: 'Liga Portugal' },
  ...overrides,
})

const prediction = {
  id: 'p1',
  event_id: EVENT_ID,
  selection: 'Benfica',
  line: null,
  odd: 2,
  confidence: 3,
  probability: 0.65,
  is_punter: true,
  stake_units: 1,
  status: 'pending',
  created_at: '2026-10-27T10:00:00Z',
  market: { id: 'm', user_id: 'u', category: '1X2', name: '1X2' },
  event: event(),
}

interface Options {
  found?: boolean
  failSettle?: boolean
}

function backend({ found = true, failSettle = false }: Options = {}): Responder {
  return (q) => {
    const update = argsOf(q, 'update')?.[0] as Record<string, unknown> | undefined
    switch (q.table) {
      case 'user_settings':
        return { data: settingsRow }
      case 'events':
        if (update) return { data: event(update) }
        return { data: found ? event() : null }
      case 'predictions':
        if (update) {
          return failSettle
            ? { error: { message: 'network down' } }
            : { data: { ...prediction, ...update } }
        }
        return { data: [prediction] }
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

async function render(id = EVENT_ID) {
  const wrapper = mount(EventView, {
    props: { id },
    global: { plugins: [PrimeVue], stubs: { RouterLink: RouterLinkStub } },
  })
  await flushPromises()
  return wrapper
}

const button = (wrapper: VueWrapper, label: string) =>
  wrapper.findAll('button').find((b) => b.text() === label)!

beforeEach(() => {
  setActivePinia(createPinia())
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('EventView', () => {
  it('shows the game and its predictions', async () => {
    setup(backend())
    const wrapper = await render()

    expect(wrapper.text()).toContain('Liga Portugal')
    expect(wrapper.get('h1').text()).toMatch(/^Benfica\s*vs\s*Porto$/)
    expect(wrapper.get('h2').text()).toBe('Prognósticos')
    expect(wrapper.text()).toContain('Odd 2,00')
    expect(wrapper.text()).toContain('Análise do jogo')
  })

  it('says the game was not found for an unknown or malformed id', async () => {
    setup(backend({ found: false }))
    expect((await render()).text()).toContain('Jogo não encontrado')

    const queries = setup(backend())
    expect((await render('nope')).text()).toContain('Jogo não encontrado')
    expect(queries.filter((q) => q.table === 'events')).toHaveLength(0)
  })

  it('saves the final score and shows it in the header', async () => {
    const queries = setup(backend())
    const wrapper = await render()

    await wrapper.get('#home-score').setValue('2')
    await wrapper.get('#away-score').setValue('1')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    const saved = queries.find((q) => q.table === 'events' && has(q, 'update'))!
    expect(argsOf(saved, 'update')).toEqual([{ home_score: 2, away_score: 1 }])
    expect(wrapper.get('h1').text()).toMatch(/^Benfica\s*2 – 1\s*Porto$/)
  })

  it('asks for both scores and saves nothing when one is missing', async () => {
    const queries = setup(backend())
    const wrapper = await render()

    await wrapper.get('#home-score').setValue('2')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    expect(wrapper.text()).toContain('Indica os golos das duas equipas')
    expect(queries.some((q) => q.table === 'events' && has(q, 'update'))).toBe(false)
  })

  it('settles a prediction and rolls back with a message when the save fails', async () => {
    setup(backend({ failSettle: true }))
    const wrapper = await render()

    await button(wrapper, 'Ganho').trigger('click')
    await flushPromises()

    expect(button(wrapper, 'Ganho').attributes('aria-pressed')).toBe('false')
    expect(wrapper.text()).toContain('Não foi possível guardar a liquidação.')
  })

  it('ignores a score save that ends after moving to another game', async () => {
    const other = 'c4b5a60e-1f2d-4c3b-9a51-0b9f7c1e3d1a'
    let finishSave: (response: { data: unknown }) => void = () => {}
    const respond = backend()
    setup((q) => {
      if (q.table === 'events' && has(q, 'update')) {
        return new Promise((resolve) => (finishSave = resolve))
      }
      if (q.table === 'events' && argsOf(q, 'eq')?.[1] === other) {
        return { data: event({ id: other, home_team: { id: 'x', name: 'Sporting' } }) }
      }
      return respond(q)
    })
    const wrapper = await render()

    await wrapper.get('#home-score').setValue('2')
    await wrapper.get('#away-score').setValue('1')
    await wrapper.get('form').trigger('submit')
    await wrapper.setProps({ id: other })
    await flushPromises()
    finishSave({ data: event({ home_score: 2, away_score: 1 }) })
    await flushPromises()

    expect(wrapper.get('h1').text()).toMatch(/^Sporting\s*vs\s*Porto$/)
    expect((wrapper.get('#home-score').element as HTMLInputElement).value).toBe('')
  })

  it('clears a score error when another game loads', async () => {
    const other = 'c4b5a60e-1f2d-4c3b-9a51-0b9f7c1e3d1a'
    setup(backend())
    const wrapper = await render()
    await wrapper.get('#home-score').setValue('2')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.text()).toContain('Indica os golos das duas equipas')

    await wrapper.setProps({ id: other })
    await flushPromises()
    expect(wrapper.text()).not.toContain('Indica os golos das duas equipas')
  })

  it('links to the logging form with this game preselected', async () => {
    setup(backend())
    const wrapper = await render()
    const link = wrapper
      .findAllComponents(RouterLinkStub)
      .find((l) => l.text() === 'Registar prognóstico')!
    expect(link.props('to')).toEqual({ name: 'predictions', query: { evento: EVENT_ID } })
  })
})
