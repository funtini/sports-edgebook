import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import PrimeVue from 'primevue/config'
import PunterFields from '../PunterFields.vue'
import type { MoneyDisplay } from '@/domain/money'

function render(
  props: {
    isPunter?: boolean
    stake?: string
    stakeError?: string
    unitValue?: number
    moneyDisplay?: MoneyDisplay
  } = {},
) {
  const wrapper = mount(PunterFields, {
    props: {
      isPunter: false,
      stake: '',
      bookmaker: '',
      bookmakers: ['Betano', 'Betclic'],
      ...props,
      'onUpdate:isPunter': (v: boolean) => wrapper.setProps({ isPunter: v }),
      'onUpdate:stake': (v: string) => wrapper.setProps({ stake: v }),
    },
    global: { plugins: [PrimeVue] },
  })
  return wrapper
}

describe('PunterFields', () => {
  it('hides stake and bookmaker while punter is off', () => {
    const wrapper = render()
    expect(wrapper.find('#stake').exists()).toBe(false)
    expect(wrapper.find('#bookmaker').exists()).toBe(false)
  })

  it('shows the stake at 1 unit and the bookmaker when switched on', async () => {
    const wrapper = render()
    await wrapper.get('#is-punter').setValue(true)

    expect(wrapper.props('isPunter')).toBe(true)
    expect((wrapper.get('#stake').element as HTMLInputElement).value).toBe('1')
    expect(wrapper.find('#bookmaker').exists()).toBe(true)
  })

  it('keeps a stake already typed', async () => {
    const wrapper = render({ stake: '2,5' })
    await wrapper.get('#is-punter').setValue(true)
    expect((wrapper.get('#stake').element as HTMLInputElement).value).toBe('2,5')
  })

  it('hides the fields again when switched off', async () => {
    const wrapper = render({ isPunter: true, stake: '1' })
    await wrapper.get('#is-punter').setValue(false)
    expect(wrapper.find('#stake').exists()).toBe(false)
  })

  it('shows the stake error inline', () => {
    const wrapper = render({
      isPunter: true,
      stake: '0',
      stakeError: 'O stake tem de ser maior que 0',
    })
    expect(wrapper.get('#stake-error').text()).toBe('O stake tem de ser maior que 0')
  })

  it('types the stake in units and shows its euro value in euros mode', async () => {
    const hint = (wrapper: ReturnType<typeof render>) => wrapper.get('[data-hint="stake"]').text()
    expect(hint(render({ isPunter: true, stake: '2' }))).toBe('unidades')

    const euros = render({ isPunter: true, stake: '1,5', unitValue: 20, moneyDisplay: 'euros' })
    expect(hint(euros)).toBe('unidades · 30,00\u00a0€')
    await euros.setProps({ stake: 'x' })
    expect(hint(euros)).toBe('unidades')
  })
})
