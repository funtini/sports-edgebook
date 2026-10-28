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
  confidence_anchors: { '1': 0.4, '2': 0.55, '3': 0.65, '4': 0.75, '5': 0.85 },
  odds_bands: [1.5, 1.8, 2.2, 3, 5],
}

/** A backend that stores the settings row and echoes each update. */
function setup(): Query[] {
  let row = { ...settingsRow }
  const fake = fakeSupabase((q) => {
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
