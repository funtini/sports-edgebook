import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import PrimeVue from 'primevue/config'
import ToastService from 'primevue/toastservice'
import { argsOf, fakeSupabase, has, type Query } from '@/stores/__tests__/fakeSupabase'
import { formatDecimal } from '@/domain/money'
import MultiplesView from '../MultiplesView.vue'

const mocked = vi.hoisted(() => ({ client: null as unknown }))
vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return mocked.client
  },
}))

const settingsRow = {
  user_id: 'u',
  unit_value: 10,
  currency: 'EUR',
  starting_bankroll_units: null,
  confidence_anchors: { '1': 0.4, '2': 0.55, '3': 0.65, '4': 0.75, '5': 0.85 },
  odds_bands: [1.5, 1.8, 2.2, 3, 5],
  money_display: 'units',
}

const id = (i: number) => `00000000-0000-4000-8000-00000000000${i}`
const noon = new Date()
noon.setHours(12, 0, 0, 0)

const team = (name: string) => ({ id: name, name, league_id: null })
const event = (i: number) => ({
  id: `e${i}`,
  kickoff_at: noon.toISOString(),
  league_id: null,
  home_team: team(`Casa ${i}`),
  away_team: team(`Fora ${i}`),
  league: null,
})

/** [event, odd, confidence, probability]; value index p × odd in the comment. */
const ROWS: [number, number, number, number][] = [
  [0, 1.5, 4, 0.75], // p0 1,125
  [0, 2.0, 3, 0.65], // p1 1,30, same game as p0
  [1, 1.8, 3, 0.65], // p2 1,17
  [2, 2.2, 2, 0.55], // p3 1,21
  [3, 1.6, 4, 0.75], // p4 1,20
  [4, 2.5, 2, 0.55], // p5 1,375
  [5, 1.4, 5, 0.85], // p6 1,19
  [6, 3.0, 1, 0.4], // p7 1,20
  [7, 1.9, 3, 0.65], // p8 1,235
]
const predictions = ROWS.map(([e, odd, confidence, probability], i) => ({
  id: id(i),
  event_id: `e${e}`,
  event: event(e),
  market: 'result',
  bet_type: '1x2',
  period: 'FT',
  selection: 'home',
  line: null,
  odd,
  confidence,
  probability,
  is_punter: false,
  stake_units: null,
  status: 'pending',
  is_live: false,
  created_at: noon.toISOString(),
}))

function setup() {
  const fake = fakeSupabase((q) => {
    if (q.table === 'user_settings') return { data: settingsRow }
    if (q.table === 'predictions') return { data: predictions }
    if (q.table === 'multiples') return { data: { id: 'm' } }
    return {}
  })
  mocked.client = fake.client
  return fake.queries
}

async function render() {
  const wrapper = mount(MultiplesView, {
    global: { plugins: [PrimeVue, ToastService], stubs: { Toast: true } },
    attachTo: document.body,
  })
  await flushPromises()
  return wrapper
}

const legIds = (wrapper: VueWrapper) =>
  wrapper.findAll('[data-leg]').map((leg) => leg.attributes('data-leg'))
const leg = (wrapper: VueWrapper, i: number) => wrapper.get(`[data-leg="${id(i)}"]`)
const totalOdd = (wrapper: VueWrapper) => wrapper.get('[data-total="odd"]').text()
const odd = (...odds: number[]) => formatDecimal(odds.reduce((a, b) => a * b, 1))

async function addByHand(wrapper: VueWrapper, i: number) {
  if (!wrapper.find('[data-panel="add"]').exists()) {
    await wrapper.get('[data-panel-button="add"]').trigger('click')
  }
  await wrapper.get(`[data-prediction="${id(i)}"] [data-action="add"]`).trigger('click')
}

async function generate(wrapper: VueWrapper) {
  await wrapper.get('[data-panel-button="generator"]').trigger('click')
  await wrapper.get('[data-action="generate"]').trigger('click')
}

const inserted = (queries: Query[], table: string) =>
  argsOf(
    queries.find((q) => q.table === table && has(q, 'insert'))!,
    'insert',
  )?.[0]

beforeEach(() => {
  setActivePinia(createPinia())
})

describe('MultiplesView', () => {
  it('starts empty and loads the pending predictions of the next 14 days', async () => {
    const queries = setup()
    const wrapper = await render()
    expect(wrapper.find('[data-slip-empty]').text()).toContain('Múltipla vazia')
    expect(wrapper.find('[data-totals]').exists()).toBe(false)
    const query = queries.find((q) => q.table === 'predictions')!
    expect(argsOf(query, 'eq')).toEqual(['status', 'pending'])
  })

  it('adds predictions by hand, pinned, one per game, with live totals', async () => {
    setup()
    const wrapper = await render()
    await addByHand(wrapper, 0)

    expect(legIds(wrapper)).toEqual([id(0)])
    expect(leg(wrapper, 0).get('[data-action="pin"]').attributes('aria-pressed')).toBe('true')
    expect(leg(wrapper, 0).get('[data-origin]').text()).toBe('Manual')
    expect(wrapper.get(`[data-prediction="${id(0)}"] [data-state]`).text()).toBe('Na múltipla')
    expect(wrapper.get(`[data-prediction="${id(1)}"] [data-state]`).text()).toBe(
      'Jogo já na múltipla',
    )
    expect(totalOdd(wrapper)).toBe(odd(1.5))
    expect(wrapper.get('[data-action="place"]').attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-min-legs]').exists()).toBe(true)

    await addByHand(wrapper, 2)
    expect(totalOdd(wrapper)).toBe(odd(1.5, 1.8))
    expect(wrapper.get('[data-total="probability"]').text()).toBe('48,8%')
    expect(wrapper.get('[data-action="place"]').attributes('disabled')).toBeUndefined()
    expect(wrapper.find('[data-min-legs]').exists()).toBe(false)
  })

  it('appends generated legs after the ones already there and highlights them', async () => {
    setup()
    const wrapper = await render()
    await addByHand(wrapper, 0)
    await generate(wrapper)

    // Melhor valor, 3 legs, game e0 already used: p5, p8, p3.
    expect(legIds(wrapper)).toEqual([id(0), id(5), id(8), id(3)])
    expect(wrapper.findAll('[data-fresh]').map((l) => l.attributes('data-leg'))).toEqual([
      id(5),
      id(8),
      id(3),
    ])
    expect(leg(wrapper, 5).get('[data-origin]').text()).toBe('Gerado')
    expect(leg(wrapper, 5).get('[data-action="pin"]').attributes('aria-pressed')).toBe('false')
    expect(wrapper.find('[data-panel]').exists()).toBe(false)
    expect(totalOdd(wrapper)).toBe(odd(1.5, 2.5, 1.9, 2.2))
    expect(wrapper.get('[data-slip-header]').text()).toContain('1 manual · 3 gerados · 1 fixado')
  })

  it('Gerar outra replaces only the unpinned legs; swap and remove update the totals', async () => {
    setup()
    const wrapper = await render()
    await addByHand(wrapper, 0)
    await generate(wrapper)
    await leg(wrapper, 5).get('[data-action="pin"]').trigger('click')
    expect(wrapper.findAll('[data-fresh]')).toHaveLength(0)

    const regenerate = wrapper.get('[data-action="regenerate"]')
    expect(regenerate.text()).toBe('Gerar outra (2)')
    await regenerate.trigger('click')
    // Pinned p0 and p5 stay; p8 and p3 are avoided, so p4 and p7 come in.
    expect(legIds(wrapper)).toEqual([id(0), id(5), id(4), id(7)])
    expect(totalOdd(wrapper)).toBe(odd(1.5, 2.5, 1.6, 3))

    await leg(wrapper, 4).get('[data-action="swap"]').trigger('click')
    // Best value from a game not in the multiple: p8, in p4's place.
    expect(legIds(wrapper)).toEqual([id(0), id(5), id(8), id(7)])
    expect(totalOdd(wrapper)).toBe(odd(1.5, 2.5, 1.9, 3))

    await leg(wrapper, 7).get('[data-action="remove"]').trigger('click')
    expect(legIds(wrapper)).toEqual([id(0), id(5), id(8)])
    expect(totalOdd(wrapper)).toBe(odd(1.5, 2.5, 1.9))
  })

  it('keeps the multiple when the screen is left and opened again', async () => {
    setup()
    const first = await render()
    await addByHand(first, 0)
    first.unmount()
    const second = await render()
    expect(legIds(second)).toEqual([id(0)])
  })

  it('places the multiple with its legs, origins and stake, then clears the slip', async () => {
    const queries = setup()
    const wrapper = await render()
    await addByHand(wrapper, 0)
    await generate(wrapper)
    await leg(wrapper, 3).get('[data-action="remove"]').trigger('click')
    await wrapper.get('[data-step="up"]').trigger('click')
    await wrapper.get('[data-action="place"]').trigger('click')
    await flushPromises()

    expect(inserted(queries, 'multiples')).toMatchObject({
      origin: 'mixed',
      generator_mode: 'value',
      generator_params: { mode: 'value', legs: 3, pool: 'all' },
      total_odd: 7.125,
      is_placed: true,
      stake_units: 1.5,
    })
    expect(inserted(queries, 'multiple_legs')).toEqual([
      { multiple_id: 'm', prediction_id: id(0), odd_at_selection: 1.5, origin: 'manual' },
      { multiple_id: 'm', prediction_id: id(5), odd_at_selection: 2.5, origin: 'generated' },
      { multiple_id: 'm', prediction_id: id(8), odd_at_selection: 1.9, origin: 'generated' },
    ])
    expect(wrapper.find('[data-slip-empty]').exists()).toBe(true)
  })

  it('says so when too few predictions pass the filters', async () => {
    setup()
    const wrapper = await render()
    await wrapper.get('[data-panel-button="generator"]').trigger('click')
    await wrapper.get('[data-toggle="filters"]').trigger('click')
    await wrapper.get('[data-filter="min-odd"]').setValue('2,9')
    await wrapper.get('[data-action="generate"]').trigger('click')
    expect(wrapper.text()).toContain('Não há prognósticos suficientes com estes filtros.')
    expect(wrapper.find('[data-leg]').exists()).toBe(false)
  })
})
