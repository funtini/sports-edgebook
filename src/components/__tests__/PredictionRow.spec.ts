import { describe, expect, it } from 'vitest'
import { nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import { i18n } from '@/i18n'
import PredictionRow from '../PredictionRow.vue'
import type { MoneyDisplay } from '@/domain/money'
import type { BetStatus, PredictionWithRelations } from '@/types/db'

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
    probability: 0.65,
    is_punter: true,
    stake_units: 2,
    status: 'pending',
    ...overrides,
  }) as PredictionWithRelations

const mountRow = (
  status: BetStatus,
  overrides: Partial<PredictionWithRelations> = {},
  moneyDisplay: MoneyDisplay = 'units',
) =>
  mount(PredictionRow, {
    props: { prediction: prediction({ status, ...overrides }), unitValue: 10, moneyDisplay },
  })

const box = (wrapper: ReturnType<typeof mountRow>, name: 'stake' | 'result') =>
  wrapper.get(`[data-box="${name}"]`)

const button = (wrapper: ReturnType<typeof mountRow>, label: string) =>
  wrapper.findAll('button').find((b) => b.text() === label)!

describe('PredictionRow', () => {
  it('settles with one tap', async () => {
    const wrapper = mountRow('pending')
    await button(wrapper, 'Perdido').trigger('click')
    expect(wrapper.emitted('settle')).toEqual([['lost']])
  })

  it('returns to pending when the active outcome is tapped again', async () => {
    const wrapper = mountRow('won')
    expect(button(wrapper, 'Ganho').attributes('aria-pressed')).toBe('true')
    await button(wrapper, 'Ganho').trigger('click')
    expect(wrapper.emitted('settle')).toEqual([['pending']])
  })

  it('shows the stake and the real profit of a punter bet', () => {
    const won = mountRow('won')
    expect(box(won, 'stake').text()).toBe('Apostado2,00')
    expect(box(won, 'stake').classes()).toContain('bg-eb-info-soft')
    expect(box(won, 'result').text()).toBe('Lucro+1,80')
    expect(box(won, 'result').classes()).toContain('bg-eb-pos-soft')
    expect(box(mountRow('lost'), 'result').text()).toBe('Prejuízo-2,00')
    expect(box(mountRow('void'), 'result').text()).toBe('Nulo0,00')
  })

  it('shows a pending row with its stake and no result yet', () => {
    const pending = mountRow('pending')
    expect(box(pending, 'stake').text()).toBe('Apostado2,00')
    expect(box(pending, 'result').text()).toBe('Por resolver—')
  })

  it('marks non-punter results as virtual, on 1 unit', () => {
    const virtual = mountRow('lost', { is_punter: false, stake_units: null })
    expect(box(virtual, 'stake').text()).toBe('Sem aposta—')
    expect(box(virtual, 'result').text()).toBe('Prejuízovirtual-1,00')
    expect(box(virtual, 'result').classes()).toContain('bg-eb-neg-soft')
  })

  it('shows money in euros when chosen', () => {
    const won = mountRow('won', {}, 'euros')
    expect(box(won, 'stake').text()).toBe('Apostado20,00\u00a0€')
    expect(box(won, 'result').text()).toBe('Lucro+18,00\u00a0€')
  })

  it('shows the confidence level in a badge, with its label as the accessible name', () => {
    const badge = mountRow('pending', { confidence: 4 }).get('[data-confidence-badge]')
    expect(badge.text()).toBe('4')
    expect(badge.attributes('aria-label')).toBe('Confiança 4 de 5 · Alta')
    expect(badge.attributes('title')).toBe('Confiança 4 de 5 · Alta')
  })

  it('shows the value pill on the band soft fill', () => {
    const pill = mountRow('pending', { odd: 2.2 }).get('[data-band]')
    expect(pill.classes()).toEqual(expect.arrayContaining(['text-eb-purple', 'bg-eb-purple-soft']))
    expect(pill.attributes('title')).toBe('Índice de valor (probabilidade × odd)')
    expect(mountRow('pending', { odd: 1.55 }).get('[data-band]').classes()).toContain(
      'bg-eb-surface-2',
    )
  })

  it('labels the value band with its index', () => {
    // 65% at 1.90 → 1.235, shown as 1,23 (floating point).
    expect(mountRow('pending').get('[data-band]').text()).toContain('Favorável 1,23')
    expect(mountRow('pending', { odd: 2.2 }).get('[data-band]').text()).toContain('Banger 1,43')
    expect(mountRow('pending', { odd: 1.55 }).get('[data-band]').text()).toMatch(/Neutro$/)
    expect(mountRow('pending', { odd: 1.4 }).get('[data-band]').text()).toContain(
      'Valor reduzido 0,91',
    )
    expect(mountRow('pending', { odd: 1.2 }).get('[data-band]').text()).toContain(
      'Odd sem valor 0,78',
    )
  })
})

describe('PredictionRow live tag', () => {
  it('tags a live prediction only', () => {
    expect(mountRow('pending').find('[data-live]').exists()).toBe(false)
    expect(mountRow('pending', { is_live: true }).get('[data-live]').text()).toBe('Live')
  })
})

describe('PredictionRow in English', () => {
  it('translates labels, the bet summary and numbers live', async () => {
    const wrapper = mountRow('won', {}, 'euros')
    expect(wrapper.text()).toContain('Golos - Total - FT')
    expect(wrapper.text()).toContain('+2,5')
    i18n.global.locale.value = 'en'
    await nextTick()
    expect(wrapper.text()).toContain('Goals - Total - FT')
    expect(wrapper.text()).toContain('+2.5')
    expect(box(wrapper, 'stake').text()).toBe('Staked€20.00')
    expect(box(wrapper, 'result').text()).toBe('Profit+€18.00')
    expect(wrapper.get('[data-confidence-badge]').attributes('aria-label')).toBe(
      'Confidence 3 of 5 · Good',
    )
    expect(wrapper.get('[data-band]').text()).toContain('Favourable 1.23')
    expect(button(wrapper, 'Won').attributes('aria-pressed')).toBe('true')
  })

  it('stacks by default and becomes one grid line from lg with layout="line"', () => {
    const card = mountRow('pending')
    expect(card.attributes('data-layout')).toBe('card')
    expect(card.classes()).not.toContain('@container')
    expect(
      card
        .get('[data-grid]')
        .classes()
        .some((c) => c.includes('grid-cols')),
    ).toBe(false)

    const line = mount(PredictionRow, {
      props: { prediction: prediction(), unitValue: 10, moneyDisplay: 'units', layout: 'line' },
    })
    expect(line.attributes('data-layout')).toBe('line')
    // The row's own width picks the grid: compact from 680px (Evento), full from 880px (Hoje).
    expect(line.classes()).toContain('@container')
    expect(line.get('[data-grid]').classes()).toEqual(
      expect.arrayContaining([
        'flex-col',
        'lg:@min-[680px]:grid',
        'lg:@min-[880px]:grid-cols-[minmax(0,1fr)_76px_176px_120px_120px_204px]',
      ]),
    )
    expect(box(line, 'stake').classes()).toContain('lg:@min-[880px]:col-start-4')
    expect(box(line, 'result').classes()).toContain('lg:@min-[880px]:col-start-5')
  })
})
