import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import PrimeVue from 'primevue/config'
import { argsOf, fakeSupabase, has, type Query } from '@/stores/__tests__/fakeSupabase'
import { useTheme } from '@/composables/useTheme'
import { i18n } from '@/i18n'
import { DARK_CLASS, LOCALE_STORAGE_KEY, THEME_STORAGE_KEY } from '@/lib/preferences'
import SettingsView from '../SettingsView.vue'

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
  starting_bankroll_units: null as number | null,
  money_display: 'units',
  slip_model: 'economy',
  confidence_anchors: { '1': 0.4, '2': 0.55, '3': 0.65, '4': 0.75, '5': 0.85 },
  odds_bands: [1.5, 1.8, 2.2, 3, 5],
}

/** A backend that stores the settings row and echoes each update. */
function setup(reads: unknown[] = []): Query[] {
  let row = { ...settingsRow }
  const fake = fakeSupabase((q) => {
    if (q.table === 'slip_reads') {
      const models = argsOf(q, 'in')?.[1] as string[]
      return { data: reads.filter((r) => models.includes((r as { model: string }).model)) }
    }
    const patch = argsOf(q, 'update')?.[0] as Partial<typeof settingsRow> | undefined
    if (patch) row = { ...row, ...patch }
    return { data: row }
  })
  mocked.client = fake.client
  return fake.queries
}

async function render() {
  const wrapper = mount(SettingsView, { global: { plugins: [PrimeVue] } })
  await flushPromises()
  return wrapper
}

const button = (wrapper: VueWrapper, label: string) =>
  wrapper.findAll('button').find((b) => b.text() === label)!
const submit = (wrapper: VueWrapper) => wrapper.get('button[type="submit"]')

beforeEach(() => {
  setActivePinia(createPinia())
})

afterEach(() => {
  localStorage.clear()
  document.documentElement.className = ''
})

describe('SettingsView', () => {
  it('can only save once a field changes, then confirms and locks again', async () => {
    const queries = setup()
    const wrapper = await render()

    expect(submit(wrapper).text()).toBe('Sem alterações')
    expect(submit(wrapper).attributes('disabled')).toBeDefined()

    await button(wrapper, 'Euros').trigger('click')
    expect(submit(wrapper).text()).toBe('Guardar alterações')
    expect(submit(wrapper).attributes('disabled')).toBeUndefined()

    await button(wrapper, 'Unidades').trigger('click')
    expect(submit(wrapper).text()).toBe('Sem alterações')

    await button(wrapper, '20\u00a0€').trigger('click')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    const update = queries.find((q) => q.table === 'user_settings' && has(q, 'update'))
    expect(argsOf(update!, 'update')?.[0]).toMatchObject({ unit_value: 20 })
    expect(wrapper.text()).toContain('Definições guardadas.')
    expect(submit(wrapper).text()).toBe('Sem alterações')
  })

  it('saves the slip reading model, Económico by default', async () => {
    const queries = setup()
    const wrapper = await render()
    const options = wrapper.findAll('[data-slot="slip-model"] button')
    expect(options.map((b) => b.attributes('aria-pressed'))).toEqual(['true', 'false', 'false'])
    expect(options[0]!.text()).toContain('Haiku')

    await options[1]!.trigger('click')
    expect(submit(wrapper).text()).toBe('Guardar alterações')
    await wrapper.get('form').trigger('submit')
    await flushPromises()

    const update = queries.find((q) => q.table === 'user_settings' && has(q, 'update'))
    expect(argsOf(update!, 'update')?.[0]).toMatchObject({ slip_model: 'balanced' })
    expect(submit(wrapper).text()).toBe('Sem alterações')
  })

  it('shows the real cost of recent reads under the options that have them', async () => {
    setup([
      { model: 'claude-sonnet-5-5', input_tokens: 2000, output_tokens: 1000 },
      { model: 'claude-sonnet-5-5', input_tokens: 4000, output_tokens: 1000 },
      { model: 'claude-opus-5-5', input_tokens: 5000, output_tokens: 2000 },
    ])
    const wrapper = await render()

    const options = wrapper.findAll('[data-slot="slip-model"] button')
    expect(options[0]!.find('[data-slot="slip-model-real"]').exists()).toBe(false)
    expect(options[0]!.text()).toContain('cerca de 0,1 cêntimo')
    expect(options[1]!.get('[data-slot="slip-model-real"]').text()).toBe(
      'Real: 1,6 cêntimos (USD) por boletim, média das últimas 2 leituras',
    )
    expect(options[2]!.get('[data-slot="slip-model-real"]').text()).toBe(
      'Real: 6 cêntimos (USD) por boletim, média da última leitura',
    )
  })

  it('switches language and theme at once, shared with the header toggles', async () => {
    setup()
    const wrapper = await render()
    const { theme } = useTheme()

    await button(wrapper, 'English').trigger('click')
    expect(i18n.global.locale.value).toBe('en')
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en')
    expect(wrapper.text()).toContain('Appearance')

    await button(wrapper, 'Dark').trigger('click')
    expect(theme.value).toBe('dark')
    expect(document.documentElement.classList.contains(DARK_CLASS)).toBe(true)
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')
    expect(button(wrapper, 'Dark').attributes('aria-pressed')).toBe('true')
  })

  it('shows each level as a badge with its label', async () => {
    setup()
    const wrapper = await render()

    const badges = wrapper.findAll('[data-confidence-badge]')
    expect(badges).toHaveLength(5)
    expect(badges[3]!.attributes('aria-label')).toBe('Confiança 4 de 5 · Alta')
  })
})
