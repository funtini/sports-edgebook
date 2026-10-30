import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import PrimeVue from 'primevue/config'
import { fakeSupabase, has } from '@/stores/__tests__/fakeSupabase'
import { i18n } from '@/i18n'
import { betFromMultiple, betFromPrediction, type BetPrediction } from '@/domain/bets'
import { formatPercent } from '@/domain/intl'
import { breakdown, cumulativeSeries, scope, summary, type Bet } from '@/domain/metrics'
import { formatMoney } from '@/domain/money'
import type { BetStatus } from '@/domain/settlement'
import type { BetType, Market } from '@/domain/markets'
import DashboardView from '../DashboardView.vue'

const mocked = vi.hoisted(() => ({ client: null as unknown }))
vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return mocked.client
  },
}))

const settingsRow = {
  user_id: 'u',
  unit_value: 20,
  currency: 'EUR',
  starting_bankroll_units: null,
  money_display: 'units',
  confidence_anchors: { '1': 0.4, '2': 0.55, '3': 0.65, '4': 0.75, '5': 0.85 },
  odds_bands: [1.5, 1.8, 2.2, 3, 5],
}

let id = 0
function prediction(
  day: string,
  status: BetStatus,
  odd: number,
  stake: number | null,
  market: [Market, BetType] = ['goals', 'total'],
): BetPrediction & { id: string } {
  return {
    id: `p${++id}`,
    odd,
    status,
    is_punter: stake != null,
    stake_units: stake,
    probability: 0.65,
    confidence: 3,
    bookmaker: stake != null ? 'Betano' : null,
    event: {
      kickoff_at: `2026-10-${day}T19:00:00Z`,
      home_team: { name: 'Benfica' },
      away_team: { name: 'Porto' },
      league: { name: 'Liga Portugal' },
    },
    market: market[0],
    bet_type: market[1],
    period: 'FT',
  }
}

// October 2026: four punter bets, two virtual ones, one void.
const predictions = [
  prediction('05', 'won', 1.9, 2),
  prediction('07', 'lost', 2.1, 1, ['result', '1x2']),
  prediction('12', 'won', 1.6, 1.5),
  prediction('20', 'void', 1.8, 1),
  prediction('21', 'won', 2.4, null),
  prediction('26', 'lost', 1.7, null, ['result', '1x2']),
]

const multiples = [
  {
    id: 'm1',
    is_placed: true,
    stake_units: 1,
    legs: [
      {
        odd_at_selection: 1.9,
        prediction: {
          status: 'won',
          probability: 0.65,
          event: { kickoff_at: predictions[0]!.event.kickoff_at },
        },
      },
      {
        odd_at_selection: 1.6,
        prediction: {
          status: 'won',
          probability: 0.65,
          event: { kickoff_at: predictions[2]!.event.kickoff_at },
        },
      },
    ],
  },
]

/** The bets the view should compute from, mapped the same way. */
const bets: Bet[] = [
  ...predictions.map(betFromPrediction),
  ...multiples.map((m) => betFromMultiple(m as Parameters<typeof betFromMultiple>[0])!),
]

function setup(rows = predictions) {
  const fake = fakeSupabase((q) => {
    if (q.table === 'user_settings') return { data: settingsRow }
    if (q.table === 'predictions') return { data: rows }
    return { data: rows.length ? multiples : [] }
  })
  mocked.client = fake.client
  return fake.queries
}

async function render() {
  const wrapper = mount(DashboardView, {
    global: { plugins: [PrimeVue], stubs: { ProfitChart: true } },
  })
  await flushPromises()
  return wrapper
}

const kpi = (wrapper: VueWrapper, key: string) => wrapper.get(`[data-kpi="${key}"]`)
const button = (wrapper: VueWrapper, label: string) =>
  wrapper.findAll('button').find((b) => b.text() === label)!
const pct = (value: number, signed = false) =>
  formatPercent(value, 'pt-PT', { decimals: 1, signed })

beforeEach(() => {
  setActivePinia(createPinia())
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(new Date(2026, 9, 28, 21, 0))
  id = 0
})

afterEach(() => {
  vi.useRealTimers()
})

describe('DashboardView', () => {
  it('shows the punter summary of the month from the metrics engine', async () => {
    setup()
    const wrapper = await render()
    const s = summary(scope(bets, 'punter'))

    expect(wrapper.get('[data-subtitle]').text()).toContain('4 apostas liquidadas')
    expect(kpi(wrapper, 'profit').get('[data-value]').text()).toBe(
      formatMoney(s.profit, 20, 'units'),
    )
    expect(kpi(wrapper, 'profit').get('[data-hint]').text()).toBe('4,50 unidades apostadas')
    expect(kpi(wrapper, 'yield').get('[data-value]').text()).toBe(pct(s.yield!, true))
    expect(kpi(wrapper, 'hitRate').get('[data-value]').text()).toBe(pct(s.hitRate!))
    expect(kpi(wrapper, 'hitRate').get('[data-hint]').text()).toBe('2 de 3 · nulos excluídos')
    expect(kpi(wrapper, 'edge').get('[data-hint]').text()).toBe(
      `break-even ${pct(s.breakEvenHitRate!)}`,
    )
    expect(kpi(wrapper, 'edge').get('[data-value]').text()).toBe(
      `${s.edge! > 0 ? '+' : ''}${(s.edge! * 100).toFixed(1).replace('.', ',')} pp`,
    )
  })

  it('draws the punter and multiples lines from cumulativeSeries', async () => {
    setup()
    const wrapper = await render()
    const chart = wrapper.findComponent({ name: 'ProfitChart' })
    const lines = chart.props('lines') as { name: string; values: number[] }[]

    expect(lines.map((l) => l.name)).toEqual(['Punter', 'Múltiplas'])
    expect(lines[0]!.values).toEqual(
      cumulativeSeries(scope(bets, 'punter'), '2026-10-01', '2026-10-28').map((p) => p.profit),
    )
    expect(lines[1]!.values).toEqual(
      cumulativeSeries(scope(bets, 'multiples'), '2026-10-01', '2026-10-28').map((p) => p.profit),
    )
    expect(chart.props('days')).toHaveLength(28)
  })

  it('compares punter and multiples, flagging small samples', async () => {
    setup()
    const wrapper = await render()
    const multiplesSide = wrapper.get('[data-versus="multiples"]')

    expect(multiplesSide.get('[data-value]').text()).toBe(
      formatMoney(summary(scope(bets, 'multiples')).profit, 20, 'units'),
    )
    expect(multiplesSide.text()).toContain('1 aposta')
    expect(multiplesSide.find('[data-small-sample]').exists()).toBe(true)
  })

  it('lists segments from breakdown, dimmed below 30 bets', async () => {
    setup()
    const wrapper = await render()
    const expected = breakdown(scope(bets, 'punter'), 'betType')
    const rows = wrapper.findAll('[data-segment]')

    expect(rows).toHaveLength(expected.length)
    expect(rows[0]!.text()).toContain('Golos - Total')
    expect(rows[0]!.text()).toContain('amostra pequena')
    expect(rows[0]!.classes()).toContain('text-eb-muted')
    expect(rows[0]!.text()).toContain(formatMoney(expected[0]!.profit, 20, 'units'))

    await button(wrapper, 'Faixa de odd').trigger('click')
    const bands = wrapper.findAll('[data-segment]').map((r) => r.text())
    expect(bands.some((text) => text.startsWith('1,80–2,19'))).toBe(true)
    expect(bands.some((text) => text.startsWith('1,50–1,79'))).toBe(true)
  })

  it('switches scope and money display without saving the setting', async () => {
    const queries = setup()
    const wrapper = await render()

    await button(wrapper, 'Todos').trigger('click')
    expect(wrapper.get('[data-subtitle]').text()).toContain('6 apostas liquidadas')

    await button(wrapper, '€').trigger('click')
    const s = summary(scope(bets, 'all'))
    expect(kpi(wrapper, 'profit').get('[data-value]').text()).toBe(
      formatMoney(s.profit, 20, 'euros'),
    )
    expect(queries.some((q) => has(q, 'update'))).toBe(false)

    await button(wrapper, 'Múltiplas').trigger('click')
    expect(wrapper.text()).toContain('Os segmentos contam só prognósticos simples')
  })

  it('shows an empty state without settled bets, in English too', async () => {
    i18n.global.locale.value = 'en'
    setup([])
    const wrapper = await render()

    expect(wrapper.find('[data-empty]').text()).toContain('No settled bets in this period.')
    expect(wrapper.find('[data-kpi]').exists()).toBe(false)
  })
})
