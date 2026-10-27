import { watch } from 'vue'
import { createI18n } from 'vue-i18n'
import type { PrimeVueConfiguration, PrimeVueLocaleOptions } from 'primevue/config'
import en from '@/locales/en'
import ptPT, { type Messages } from '@/locales/pt-PT'
import {
  DEFAULT_LOCALE,
  INTL_LOCALES,
  LOCALE_STORAGE_KEY,
  initialLocale,
  readStored,
  writeStored,
  type AppLocale,
} from '@/lib/preferences'
import { primeVueLocale } from './primevue'

export const i18n = createI18n<[Messages], AppLocale, false>({
  legacy: false,
  locale: initialLocale(
    readStored(LOCALE_STORAGE_KEY),
    typeof navigator === 'undefined' ? undefined : navigator.language,
  ),
  fallbackLocale: DEFAULT_LOCALE,
  messages: { 'pt-PT': ptPT, en },
})

/** Keeps `<html lang>` and PrimeVue's day/month names in step with the active language. */
export function syncLocale(primevue: { config: PrimeVueConfiguration }): void {
  watch(
    i18n.global.locale,
    (locale) => {
      document.documentElement.lang = locale
      // Merged over PrimeVue's defaults, which carry the keys we do not translate.
      primevue.config.locale = {
        ...primevue.config.locale,
        ...primeVueLocale(INTL_LOCALES[locale], i18n.global.t),
      } as PrimeVueLocaleOptions
    },
    { immediate: true },
  )
}

/** Switches the language live and remembers it on this device. */
export function setLocale(locale: AppLocale): void {
  i18n.global.locale.value = locale
  writeStored(LOCALE_STORAGE_KEY, locale)
}
