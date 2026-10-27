import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import ValueIndex from '../ValueIndex.vue'

const render = (odd: number | null, probability: number | null) =>
  mount(ValueIndex, { props: { odd, probability } })

describe('ValueIndex', () => {
  it('shows a hint until odd and confidence are set', () => {
    expect(render(null, 0.65).text()).toContain('Indica a odd e a confiança')
    expect(render(1.8, null).text()).toContain('Indica a odd e a confiança')
    expect(render(Number.NaN, 0.65).find('output').exists()).toBe(false)
  })

  it('shows the value index, odd and fair odd, favourable in the positive colour', () => {
    // Level 3 (65%) at 1.80 → 1.17.
    const output = render(1.8, 0.65).get('output')
    expect(output.attributes('data-band')).toBe('favourable')
    expect(output.classes()).toContain('bg-eb-pos-soft')
    expect(output.text()).toContain('1,17')
    expect(output.text()).toContain('odd 1,80 vs justa 1,54')
    expect(output.text()).toContain('Favorável')
  })

  it.each([
    [2.2, 0.65, 'banger', 'Banger', 'bg-eb-purple-soft'],
    [1.54, 0.65, 'neutral', 'Neutro', 'bg-eb-surface'],
    // Level 4 (75%) at 1.25 → 0.94.
    [1.25, 0.75, 'reduced', 'Desfavorável', 'bg-eb-amber-soft'],
    [1.2, 0.65, 'no_value', 'Sem valor', 'bg-eb-neg-soft'],
  ])('shows odd %s at p %s as %s', (odd, probability, band, pill, card) => {
    const output = render(odd, probability).get('output')
    expect(output.attributes('data-band')).toBe(band)
    expect(output.text()).toContain(pill)
    expect(output.classes()).toContain(card)
  })

  it('updates live when the odd changes', async () => {
    const wrapper = render(1.25, 0.75)
    await wrapper.setProps({ odd: 2 })
    expect(wrapper.get('output').attributes('data-band')).toBe('banger')
    expect(wrapper.get('output').text()).toContain('1,50')
  })
})
