import { beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import PrimeVue from 'primevue/config'
import ToastService from 'primevue/toastservice'
import { createMemoryHistory, createRouter, type Router } from 'vue-router'
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

const DAY = 24 * 60 * 60 * 1000
const sid = (i: number) => `00000000-0000-4000-9000-00000000000${i}`
const prediction = (
  i: number,
  kickoff: Date,
  odd: number,
  status: string,
  eventIndex = 10 + i,
) => ({
  ...predictions[0]!,
  id: sid(i),
  event_id: `e${eventIndex}`,
  event: { ...event(eventIndex), kickoff_at: kickoff.toISOString() },
  odd,
  status,
})

/**
 * Saved multiples, newest first. `placed`: won leg, void leg, pending leg (stored as pending,
 * so it stays). `simulated`: lost leg, so the stored `pending` is out of date. `reusable`: one
 * game already started and two to come, with its mode.
 */
function savedRows() {
  const past = new Date(Date.now() - DAY)
  const future = new Date(Date.now() + DAY)
  return [
    {
      id: 'reusable',
      origin: 'mixed',
      generator_mode: 'confidence',
      generator_params: { mode: 'confidence', legs: 2 },
      total_odd: 5.4,
      stake_units: 2,
      is_placed: true,
      status: 'pending',
      created_at: '2026-10-30T18:00:00.000Z',
      settled_at: null,
      legs: [
        {
          odd_at_selection: 1.5,
          origin: 'manual',
          prediction: prediction(1, past, 1.5, 'pending'),
        },
        {
          odd_at_selection: 2,
          origin: 'generated',
          prediction: prediction(2, future, 2, 'pending'),
        },
        {
          odd_at_selection: 1.8,
          origin: 'manual',
          prediction: prediction(3, future, 1.8, 'pending'),
        },
      ],
    },
    {
      id: 'simulated',
      origin: 'manual',
      generator_mode: null,
      generator_params: null,
      total_odd: 3,
      stake_units: null,
      is_placed: false,
      status: 'pending',
      created_at: '2026-10-29T18:00:00.000Z',
      settled_at: null,
      legs: [
        { odd_at_selection: 1.5, origin: 'manual', prediction: prediction(4, past, 1.5, 'won') },
        { odd_at_selection: 2, origin: 'manual', prediction: prediction(5, past, 2, 'lost') },
      ],
    },
    {
      id: 'placed',
      origin: 'generated',
      generator_mode: 'target_odd',
      generator_params: { mode: 'target_odd', targetOdd: 5 },
      total_odd: 4.52,
      stake_units: 2,
      is_placed: true,
      status: 'won',
      created_at: '2026-10-28T18:00:00.000Z',
      settled_at: '2026-10-28T23:00:00.000Z',
      legs: [
        {
          odd_at_selection: 2.26,
          origin: 'generated',
          prediction: prediction(6, past, 2.26, 'won'),
        },
        { odd_at_selection: 2, origin: 'generated', prediction: prediction(7, past, 2, 'void') },
      ],
    },
  ]
}

function setup() {
  const fake = fakeSupabase((q) => {
    if (q.table === 'user_settings') return { data: settingsRow }
    if (q.table === 'predictions') return { data: predictions }
    if (q.table === 'multiples' && has(q, 'insert')) return { data: { id: 'm' } }
    if (q.table === 'multiples' && has(q, 'select')) return { data: savedRows() }
    return {}
  })
  mocked.client = fake.client
  return fake.queries
}

let router: Router

async function render(path = '/multiplas') {
  router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/multiplas', name: 'multiples', component: MultiplesView }],
  })
  await router.push(path)
  await router.isReady()
  const wrapper = mount(MultiplesView, {
    global: { plugins: [PrimeVue, ToastService, router], stubs: { Toast: true } },
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

  it('swapping one row again and again never repeats until every prediction was shown', async () => {
    setup()
    const wrapper = await render()
    await addByHand(wrapper, 0)
    await generate(wrapper)
    expect(legIds(wrapper)).toEqual([id(0), id(5), id(8), id(3)])

    // Games e1, e3, e5, e6 are free: p2, p4, p6, p7, each shown once, in Melhor valor order.
    const shown = [id(3)]
    const last = (list: string[]) => Number(list[list.length - 1]!.slice(-1))
    for (let step = 0; step < 4; step++) {
      await leg(wrapper, last(shown)).get('[data-action="swap"]').trigger('click')
      const ids = legIds(wrapper)
      expect(ids.slice(0, 3)).toEqual([id(0), id(5), id(8)])
      expect(shown).not.toContain(ids[3])
      shown.push(ids[3]!)
    }
    expect([...shown].sort()).toEqual([id(2), id(3), id(4), id(6), id(7)])
    expect(shown.slice(1, 3)).toEqual([id(4), id(7)])

    // All shown: it starts again from the best one, p3.
    await leg(wrapper, last(shown)).get('[data-action="swap"]').trigger('click')
    expect(legIds(wrapper)[3]).toBe(id(3))
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

describe('MultiplesView · Guardadas', () => {
  const card = (wrapper: VueWrapper, multipleId: string) =>
    wrapper.get(`[data-multiple="${multipleId}"]`)

  it('lists saved multiples with origin, void note, boxes and leg status', async () => {
    setup()
    const wrapper = await render('/multiplas?vista=guardadas')
    expect(wrapper.findAll('[data-multiple]').map((c) => c.attributes('data-multiple'))).toEqual([
      'reusable',
      'simulated',
      'placed',
    ])

    const placed = card(wrapper, 'placed')
    expect(placed.get('[data-origin]').text()).toBe('Odd alvo')
    expect(placed.get('[data-void-note]').text()).toBe('1 nula · odd 2,26')
    expect(placed.get('[data-box="stake"]').text()).toBe('Apostado2,00')
    // 2 × (2,26 − 1) with the void leg at 1,00.
    expect(placed.get('[data-box="result"]').text()).toBe('Lucro+2,52')
    expect(placed.findAll('[data-dot]').map((d) => d.text())).toEqual(['✓', '–'])

    const simulated = card(wrapper, 'simulated')
    expect(simulated.get('[data-origin]').text()).toBe('Manual')
    expect(simulated.get('[data-box="stake"]').text()).toBe('Simulada—')
    expect(simulated.get('[data-box="result"]').text()).toBe('Prejuízovirtual-1,00')

    const mixed = card(wrapper, 'reusable')
    expect(mixed.get('[data-origin]').text()).toBe('Mista · Mais confiança')
    expect(mixed.get('[data-box="result"]').text()).toBe('Por resolver—')
    expect(mixed.find('[data-void-note]').exists()).toBe(false)
  })

  it('writes the status from the legs when it changed since it was stored', async () => {
    const queries = setup()
    await render('/multiplas?vista=guardadas')
    const updates = queries.filter((q) => q.table === 'multiples' && has(q, 'update'))
    expect(updates).toHaveLength(1)
    expect(argsOf(updates[0]!, 'update')?.[0]).toMatchObject({ status: 'lost' })
    expect(argsOf(updates[0]!, 'eq')).toEqual(['id', 'simulated'])
  })

  it('filters by placed and simulated', async () => {
    setup()
    const wrapper = await render('/multiplas?vista=guardadas')
    const chip = (label: string) => wrapper.findAll('button').find((b) => b.text() === label)!
    await chip('Simuladas').trigger('click')
    expect(wrapper.findAll('[data-multiple]').map((c) => c.attributes('data-multiple'))).toEqual([
      'simulated',
    ])
    await chip('Apostadas').trigger('click')
    expect(wrapper.findAll('[data-multiple]').map((c) => c.attributes('data-multiple'))).toEqual([
      'reusable',
      'placed',
    ])
  })

  it('Reutilizar opens Criar with the legs pinned, origins kept and started games left out', async () => {
    const queries = setup()
    const wrapper = await render('/multiplas?vista=guardadas')
    await card(wrapper, 'reusable').get('[data-action="reuse"]').trigger('click')
    await flushPromises()

    expect(router.currentRoute.value.query.vista).toBeUndefined()
    expect(wrapper.find('[data-slip-header]').exists()).toBe(true)
    expect(legIds(wrapper)).toEqual([sid(2), sid(3)])
    expect(wrapper.get(`[data-leg="${sid(2)}"] [data-origin]`).text()).toBe('Gerado')
    expect(wrapper.get(`[data-leg="${sid(3)}"] [data-origin]`).text()).toBe('Manual')
    for (const pin of wrapper.findAll('[data-action="pin"]')) {
      expect(pin.attributes('aria-pressed')).toBe('true')
    }
    const note = wrapper.get('[data-reuse-note]').text()
    expect(note).toContain('Vem toda fixada: desfixa o que queres gerar de novo.')
    expect(note).toContain('1 prognóstico ficou de fora porque o jogo já começou.')

    // Saving keeps the generation it came with.
    await wrapper.get('[data-action="simulate"]').trigger('click')
    await flushPromises()
    expect(inserted(queries, 'multiples')).toMatchObject({
      origin: 'mixed',
      generator_mode: 'confidence',
      is_placed: false,
    })
    expect(wrapper.find('[data-reuse-note]').exists()).toBe(false)
  })

  it('closes the Reutilizar note', async () => {
    setup()
    const wrapper = await render('/multiplas?vista=guardadas')
    await card(wrapper, 'reusable').get('[data-action="reuse"]').trigger('click')
    await wrapper.get('[data-action="close-note"]').trigger('click')
    expect(wrapper.find('[data-reuse-note]').exists()).toBe(false)
  })

  it('deletes a simulated multiple after an inline confirmation; placed ones cannot', async () => {
    const queries = setup()
    const wrapper = await render('/multiplas?vista=guardadas')
    expect(card(wrapper, 'placed').find('[data-action="delete"]').exists()).toBe(false)

    await card(wrapper, 'simulated').get('[data-action="delete"]').trigger('click')
    expect(card(wrapper, 'simulated').get('[data-confirm]').text()).toContain(
      'Apagar esta múltipla simulada?',
    )
    await card(wrapper, 'simulated').get('[data-action="cancel-delete"]').trigger('click')
    expect(queries.some((q) => q.table === 'multiples' && has(q, 'delete'))).toBe(false)

    await card(wrapper, 'simulated').get('[data-action="delete"]').trigger('click')
    await card(wrapper, 'simulated').get('[data-action="confirm-delete"]').trigger('click')
    await flushPromises()
    const deleted = queries.find((q) => q.table === 'multiples' && has(q, 'delete'))!
    expect(deleted.ops.filter(([m]) => m === 'eq').map(([, args]) => args)).toEqual([
      ['id', 'simulated'],
      ['is_placed', false],
    ])
    expect(wrapper.find('[data-multiple="simulated"]').exists()).toBe(false)
  })
})
