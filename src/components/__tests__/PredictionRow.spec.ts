import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import PredictionRow from '../PredictionRow.vue'
import type { BetStatus, PredictionWithRelations } from '@/types/db'

const prediction = (overrides: Partial<PredictionWithRelations> = {}) =>
  ({
    id: 'p',
    event_id: 'e',
    selection: 'Mais de',
    line: 2.5,
    odd: 1.9,
    confidence: 3,
    probability: 0.65,
    is_punter: true,
    stake_units: 2,
    status: 'pending',
    market: { id: 'm', user_id: 'u', category: 'Golos', name: 'Mais de' },
    ...overrides,
  }) as PredictionWithRelations

const mountRow = (status: BetStatus, overrides: Partial<PredictionWithRelations> = {}) =>
  mount(PredictionRow, {
    props: { prediction: prediction({ status, ...overrides }), unitValue: 10 },
  })

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

  it('shows real profit for punter bets and virtual profit otherwise', () => {
    expect(mountRow('won').text()).toContain('+1,80 u · +18,00 €')
    expect(mountRow('pending').text()).not.toContain(' u · ')
    const virtual = mountRow('lost', { is_punter: false, stake_units: null }).text()
    expect(virtual).toContain('-1,00 u (virtual)')
  })
})
