import { computed } from 'vue'
import { i18n, setLocale } from '@/i18n'
import { INTL_LOCALES, type AppLocale } from '@/lib/preferences'

/** Active language, the matching `Intl` locale for formatters, and the header toggle. */
export function useLocale() {
  const locale = computed<AppLocale>(() => i18n.global.locale.value)
  const intlLocale = computed(() => INTL_LOCALES[locale.value])

  function toggleLocale(): void {
    setLocale(locale.value === 'pt-PT' ? 'en' : 'pt-PT')
  }

  return { locale, intlLocale, setLocale, toggleLocale }
}
