import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { seedNameKey } from '@/domain/markets'
import { setLocale } from '@/i18n'
import { INTL_LOCALES, type AppLocale } from '@/lib/preferences'

/**
 * Active language for a component: `t`, the `Intl` locale for formatters, display helpers and the
 * header toggle. Must be called from a component's setup.
 */
export function useLocale() {
  const { t, te, locale: i18nLocale } = useI18n()
  const locale = computed(() => i18nLocale.value as AppLocale)
  const intlLocale = computed(() => INTL_LOCALES[locale.value])

  /** A message key (validation, `UserError`, fallbacks) translated; other text shown as is. */
  function message(keyOrText: string): string {
    return te(keyOrText) ? t(keyOrText) : keyOrText
  }

  /** A market name or category: seeded ones in the active language, typed ones as they are. */
  function marketName(name: string): string {
    const key = seedNameKey(name)
    return key ? t(key) : name
  }

  function toggleLocale(): void {
    setLocale(locale.value === 'pt-PT' ? 'en' : 'pt-PT')
  }

  return { t, locale, intlLocale, message, marketName, setLocale, toggleLocale }
}
