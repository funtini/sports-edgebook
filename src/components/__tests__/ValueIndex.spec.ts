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

  it('shows the value index and fair odd, favourable in green', () => {
    // Level 3 (65%) at 1.80 → 1.17.
    const output = render(1.8, 0.65).get('output')
    expect(output.attributes('data-band')).toBe('favourable')
    expect(output.classes()).toContain('bg-green-50')
    expect(output.text()).toContain('1,17')
    expect(output.text()).toContain('Odd justa 1,54')
    expect(output.text()).toContain('Favorável')
  })

  it('colours neutral grey and unfavourable red', () => {
    const neutral = render(1.54, 0.65).get('output')
    expect(neutral.attributes('data-band')).toBe('neutral')
    expect(neutral.classes()).toContain('bg-surface-100')

    // Level 4 (75%) at 1.25 → 0.94.
    const unfavourable = render(1.25, 0.75).get('output')
    expect(unfavourable.attributes('data-band')).toBe('unfavourable')
    expect(unfavourable.classes()).toContain('bg-red-50')
    expect(unfavourable.text()).toContain('0,94')
  })

  it('updates live when the odd changes', async () => {
    const wrapper = render(1.25, 0.75)
    await wrapper.setProps({ odd: 2 })
    expect(wrapper.get('output').attributes('data-band')).toBe('favourable')
    expect(wrapper.get('output').text()).toContain('1,50')
  })
})
