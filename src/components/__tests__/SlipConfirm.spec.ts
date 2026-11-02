import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import PrimeVue from 'primevue/config'
import { fakeSupabase, has, type Query } from '@/stores/__tests__/fakeSupabase'
import { DEFAULT_CONFIDENCE_ANCHORS } from '@/domain/confidence'
import type { ContextPrediction } from '@/domain/slipImport'
import type { SlipLeg, SlipRead } from '@/domain/slipRead'
import type { EventWithTeams } from '@/types/db'
import SlipConfirm, { type SlipContext } from '../SlipConfirm.vue'

const mocked = vi.hoisted(() => ({ client: null as unknown }))
vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return mocked.client
  },
}))

const KICKOFF = '2026-11-02T20:00:00Z'

const leg = (over: Partial<SlipLeg> = {}): SlipLeg => ({
  rawText: 'Sporting CP - Rio Ave · 1X2 · Sporting CP',
  homeTeam: 'Sporting CP',
  awayTeam: 'Rio Ave',
  league: 'Liga Portugal',
  kickoffAt: KICKOFF,
  timing: 'pre',
  market: 'result',
  betType: '1x2',
  period: 'FT',
  selection: 'home',
  line: null,
  odd: 1.5,
  status: null,
  unsure: [],
  ...over,
})

const team = (id: string, name: string) => ({ id, name }) as EventWithTeams['home_team']
const event = (id: string, home: string, away: string): EventWithTeams =>
  ({
    id,
    kickoff_at: KICKOFF,
    home_team: team(`${id}-home`, home),
    away_team: team(`${id}-away`, away),
    league: null,
  }) as EventWithTeams

const EVENTS = [
  event('e-benfica', 'Benfica', 'Porto'),
  // Only "Sporting" matches: the leg asks.
  event('e-sporting', 'Sporting', 'Moreirense'),
]

const context = (predictions: ContextPrediction[] = []): SlipContext => ({
  events: EVENTS,
  teams: EVENTS.flatMap((e) => [e.home_team, e.away_team]),
  leagues: [],
  aliases: [],
  predictions,
  anchors: DEFAULT_CONFIDENCE_ANCHORS,
  now: new Date('2026-11-02T10:00:00Z'),
})

const multiple: SlipRead = {
  kind: 'multiple',
  bookmaker: 'Betano',
  stake: 10,
  totalOdd: 4.2,
  status: 'pending',
  legs: [
    leg({ homeTeam: 'Benfica', awayTeam: 'Porto', rawText: 'Benfica - Porto' }),
    leg({ awayTeam: 'Rio Ave', rawText: 'Sporting CP - Rio Ave' }),
    leg({ homeTeam: 'Braga', awayTeam: 'Vitória', rawText: 'Braga - Vitória', odd: 2.1 }),
  ],
}

function setup() {
  let n = 0
  const fake = fakeSupabase((q: Query) =>
    has(q, 'insert') || has(q, 'upsert')
      ? { data: has(q, 'single') ? { id: `${q.table}-${++n}` } : [{ id: `${q.table}-${++n}` }] }
      : { data: [] },
  )
  mocked.client = fake.client
  return fake.queries
}

const mounted: VueWrapper[] = []
afterEach(() => mounted.splice(0).forEach((w) => w.unmount()))

function render(read: SlipRead, ctx = context()) {
  const wrapper = mount(SlipConfirm, {
    props: { read, context: ctx, imageUrl: 'blob:slip', bookmakers: ['Bet365'], unitValue: 10 },
    global: { plugins: [PrimeVue] },
    attachTo: document.body,
  })
  mounted.push(wrapper)
  return wrapper
}

const card = (wrapper: VueWrapper, index: number) => wrapper.find(`[data-leg="${index}"]`)
const missing = (wrapper: VueWrapper) => wrapper.find('[data-missing]').text()
const saveButton = (wrapper: VueWrapper) => wrapper.find('[data-save]')

beforeEach(() => {
  setActivePinia(createPinia())
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('SlipConfirm', () => {
  it('shows each leg’s event state and what is missing, and saves once everything is answered', async () => {
    const queries = setup()
    const wrapper = render(multiple)

    expect(card(wrapper, 0).find('[data-event-state="linked"]').exists()).toBe(true)
    expect(card(wrapper, 1).find('[data-event-state="question"]').text()).toContain(
      'Na app: Sporting – Moreirense',
    )
    expect(card(wrapper, 2).find('[data-event-state="new"]').exists()).toBe(true)
    expect(missing(wrapper)).toBe('Falta responder a 1 pergunta e escolher 3 confianças.')
    expect(saveButton(wrapper).attributes('disabled')).toBeDefined()
    expect(wrapper.find('[data-stake-units]').text()).toBe('1,00 unidades')
    expect(wrapper.find('[data-possible-return]').text()).toContain('42,00')

    await card(wrapper, 1).find('[data-answer="yes"]').trigger('click')
    for (const index of [0, 1, 2]) {
      await card(wrapper, index).find('[data-confidence="4"]').trigger('click')
    }
    expect(card(wrapper, 1).find('[data-event-state="linked"]').exists()).toBe(true)
    expect(missing(wrapper)).toBe('Tudo pronto para registar.')
    expect(saveButton(wrapper).text()).toBe('Registar 3 prognósticos e a múltipla')
    expect(saveButton(wrapper).attributes('disabled')).toBeUndefined()

    await saveButton(wrapper).trigger('click')
    await flushPromises()
    expect(wrapper.emitted('saved')?.[0]).toEqual([
      { predictions: 3, multiple: true, upgraded: false },
    ])
    // "Sim" saves the slip's other team as an alias of the app's.
    const tables = queries.filter((q) => has(q, 'insert') || has(q, 'upsert')).map((q) => q.table)
    expect(tables).toEqual([
      'leagues',
      'teams',
      'teams',
      'events',
      'team_aliases',
      'predictions',
      'predictions',
      'predictions',
      'multiples',
      'multiple_legs',
    ])
  })

  it('makes a new event on "Não, é outro jogo"', async () => {
    setup()
    const wrapper = render(multiple)
    await card(wrapper, 1).find('[data-answer="no"]').trigger('click')
    expect(card(wrapper, 1).find('[data-event-state="new"]').exists()).toBe(true)
    expect(missing(wrapper)).toBe('Falta escolher 3 confianças.')
  })

  it('asks for unsure fields in "Campos a confirmar" until "Está certo", and blocks a missing one', async () => {
    setup()
    const read: SlipRead = {
      ...multiple,
      legs: [
        leg({ homeTeam: 'Benfica', awayTeam: 'Porto', unsure: ['betType'] }),
        leg({
          homeTeam: 'Benfica',
          awayTeam: 'Porto',
          market: 'goals',
          betType: 'total',
          selection: 'over',
          line: null,
          unsure: ['line'],
        }),
      ],
    }
    const wrapper = render(read)
    const block = (index: number) => card(wrapper, index).find('[data-to-confirm]')

    expect(block(0).find('[data-field="betType"]').exists()).toBe(true)
    await block(0).find('[data-looks-right]').trigger('click')
    expect(block(0).exists()).toBe(false)

    // The line is missing: confirming does not hide it.
    await block(1).find('[data-looks-right]').trigger('click')
    expect(block(1).find('[data-field="line"]').exists()).toBe(true)
    expect(missing(wrapper)).toContain('preencher 1 campo')

    await block(1).find('[data-field="line"] input').setValue('2,5')
    expect(block(1).exists()).toBe(false)
    expect(missing(wrapper)).toBe('Falta escolher 2 confianças.')
  })

  it('says a multiple left with one leg cannot be saved', async () => {
    setup()
    const read: SlipRead = { ...multiple, legs: multiple.legs.slice(0, 2) }
    const wrapper = render(read)
    await card(wrapper, 0).find('[data-edit]').trigger('click')
    expect(card(wrapper, 0).find('[data-remove]').text()).toBe('Tirar da múltipla')
    await card(wrapper, 0).find('[data-remove]').trigger('click')

    expect(card(wrapper, 0).exists()).toBe(false)
    expect(missing(wrapper)).toBe('Uma múltipla tem pelo menos 2 prognósticos.')
    expect(saveButton(wrapper).attributes('disabled')).toBeDefined()
  })

  describe('a single over an existing prediction', () => {
    const singleRead: SlipRead = {
      kind: 'single',
      bookmaker: 'Betano',
      stake: 20,
      totalOdd: 1.6,
      status: 'pending',
      legs: [leg({ homeTeam: 'Benfica', awayTeam: 'Porto', odd: 1.6 })],
    }
    const existing = (is_punter: boolean): ContextPrediction => ({
      id: 'p1',
      event_id: 'e-benfica',
      market: 'result',
      bet_type: '1x2',
      period: 'FT',
      selection: 'home',
      line: null,
      odd: 1.5,
      confidence: 3,
      is_punter,
    })

    it('becomes the real bet, keeping its confidence', async () => {
      const queries = setup()
      const wrapper = render(singleRead, context([existing(false)]))

      expect(wrapper.find('[data-duplicate="upgrade"]').text()).toContain('Odd 1,50 na app, 1,60')
      expect(wrapper.find('[data-confidence]').exists()).toBe(false)
      expect(saveButton(wrapper).text()).toBe('Marcar como aposta real')

      await saveButton(wrapper).trigger('click')
      await flushPromises()
      const update = queries.find((q) => has(q, 'update'))!
      expect(update.ops.find(([m]) => m === 'update')![1][0]).toEqual({
        is_punter: true,
        stake_units: 2,
        bookmaker: 'Betano',
        odd: 1.6,
      })
      expect(wrapper.emitted('saved')?.[0]).toEqual([
        { predictions: 1, multiple: false, upgraded: true },
      ])
    })

    it('says the bet is already logged and cannot be saved again', async () => {
      setup()
      const wrapper = render(singleRead, context([existing(true)]))
      expect(wrapper.find('[data-duplicate="already_logged"]').text()).toContain(
        'Esta aposta já está registada.',
      )
      expect(missing(wrapper)).toBe('Há uma aposta que já está registada: tira-a da importação.')
      expect(saveButton(wrapper).attributes('disabled')).toBeDefined()
    })
  })
})
