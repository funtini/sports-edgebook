import { afterEach, describe, expect, it } from 'vitest'
import { defineComponent, nextTick } from 'vue'
import { mount } from '@vue/test-utils'
import type { PrimeVueConfiguration } from 'primevue/config'
import { i18n, syncLocale } from '@/i18n'
import { LOCALE_STORAGE_KEY } from '@/lib/preferences'
import { useLocale } from '../useLocale'

function setup() {
  let api!: ReturnType<typeof useLocale>
  mount(
    defineComponent({
      setup() {
        api = useLocale()
        return () => null
      },
    }),
  )
  return api
}

describe('useLocale', () => {
  afterEach(() => {
    localStorage.clear()
    i18n.global.locale.value = 'pt-PT'
  })

  it('switches messages, Intl locale, <html lang> and PrimeVue names live, and remembers', async () => {
    const primevue = { config: {} as PrimeVueConfiguration }
    syncLocale(primevue)
    const { t, locale, intlLocale, toggleLocale } = setup()

    await nextTick()
    expect(t('app.nav.today')).toBe('Hoje')
    expect(document.documentElement.lang).toBe('pt-PT')
    expect(primevue.config.locale?.monthNames?.[0]).toBe('janeiro')

    toggleLocale()
    await nextTick()
    expect(locale.value).toBe('en')
    expect(intlLocale.value).toBe('en-GB')
    expect(t('app.nav.today')).toBe('Today')
    expect(document.documentElement.lang).toBe('en')
    expect(primevue.config.locale?.monthNames?.[0]).toBe('January')
    expect(primevue.config.locale?.today).toBe('Today')
    expect(localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en')
  })

  it('translates message keys and passes other text through', () => {
    const { message, setLocale } = setup()
    setLocale('en')
    expect(message('validation.oddInvalid')).toBe('Invalid odd')
    expect(message('Email rate limit exceeded')).toBe('Email rate limit exceeded')
  })

  it('labels a bet in the active language', () => {
    const { betParts, setLocale } = setup()
    const bet = {
      market: 'goals',
      bet_type: 'total',
      period: 'HT',
      selection: 'over',
      line: 1.5,
    } as const
    expect(betParts(bet)).toEqual(['Golos', 'Total', 'HT', '+1,5'])
    setLocale('en')
    expect(betParts(bet)).toEqual(['Goals', 'Total', 'HT', '+1.5'])
    expect(betParts({ ...bet, bet_type: 'other', selection: 'Benfica marca', line: null })).toEqual(
      ['Goals', 'Other', 'HT', 'Benfica marca'],
    )
  })
})
