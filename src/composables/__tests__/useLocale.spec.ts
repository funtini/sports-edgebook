import { afterEach, describe, expect, it } from 'vitest'
import { i18n, syncLocale } from '@/i18n'
import { LOCALE_STORAGE_KEY } from '@/lib/preferences'
import type { PrimeVueConfiguration } from 'primevue/config'
import { nextTick } from 'vue'
import { useLocale } from '../useLocale'

describe('useLocale', () => {
  afterEach(() => {
    localStorage.clear()
    i18n.global.locale.value = 'pt-PT'
  })

  it('switches messages, Intl locale, <html lang> and PrimeVue names live, and remembers', async () => {
    const primevue = { config: {} as PrimeVueConfiguration }
    syncLocale(primevue)
    const { locale, intlLocale, setLocale, toggleLocale } = useLocale()

    setLocale('pt-PT')
    await nextTick()
    expect(i18n.global.t('app.nav.today')).toBe('Hoje')
    expect(document.documentElement.lang).toBe('pt-PT')
    expect(primevue.config.locale?.monthNames?.[0]).toBe('janeiro')

    toggleLocale()
    await nextTick()
    expect(locale.value).toBe('en')
    expect(intlLocale.value).toBe('en-GB')
    expect(i18n.global.t('app.nav.today')).toBe('Today')
    expect(document.documentElement.lang).toBe('en')
    expect(primevue.config.locale?.monthNames?.[0]).toBe('January')
    expect(primevue.config.locale?.today).toBe('Today')
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en')
  })
})
