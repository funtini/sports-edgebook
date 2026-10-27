import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import PrimeVue from 'primevue/config'
import ToastService from 'primevue/toastservice'
import { createMemoryHistory, createRouter } from 'vue-router'
import { i18n } from '@/i18n'
import { DARK_CLASS, LOCALE_STORAGE_KEY, THEME_STORAGE_KEY } from '@/lib/preferences'
import App from '../App.vue'

// No backend: the app runs open and shows the navigation.
vi.mock('@/lib/supabase', () => ({ supabase: null }))

const Empty = { template: '<div />' }

async function mountApp() {
  const router = createRouter({
    history: createMemoryHistory(),
    routes: ['today', 'predictions', 'multiples', 'dashboard', 'settings'].map((name) => ({
      path: name === 'today' ? '/' : `/${name}`,
      name,
      component: Empty,
    })),
  })
  router.push('/')
  await router.isReady()
  const wrapper = mount(App, {
    global: { plugins: [createPinia(), router, PrimeVue, ToastService] },
  })
  await flushPromises()
  return wrapper
}

describe('App header', () => {
  afterEach(() => {
    localStorage.clear()
    document.documentElement.className = ''
  })

  it('switches language live and remembers it', async () => {
    const wrapper = await mountApp()
    const toggle = wrapper.get('[data-action="language"]')
    expect(toggle.attributes('aria-label')).toBe('Mudar idioma')
    expect(wrapper.text()).toContain('Registo')

    await toggle.trigger('click')
    expect(i18n.global.locale.value).toBe('en')
    expect(toggle.attributes('aria-label')).toBe('Change language')
    expect(wrapper.text()).toContain('Log')
    expect(wrapper.text()).not.toContain('Registo')
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en')
  })

  it('switches theme and remembers it', async () => {
    const wrapper = await mountApp()
    const toggle = wrapper.get('[data-action="theme"]')
    const dark = document.documentElement.classList.contains(DARK_CLASS)

    await toggle.trigger('click')
    expect(document.documentElement.classList.contains(DARK_CLASS)).toBe(!dark)
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe(dark ? 'light' : 'dark')
    expect(toggle.attributes('aria-label')).toBe(dark ? 'Tema escuro' : 'Tema claro')
  })
})
