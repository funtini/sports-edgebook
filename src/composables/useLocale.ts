import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { numberFormat } from '@/domain/intl'
import { pickParts, type PickSummary } from '@/domain/markets'
import { setLocale } from '@/i18n'
import { INTL_LOCALES, LOCALES, type AppLocale } from '@/lib/preferences'

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

  /** A bet's market, type, period and selection labels, in the active language (`pickParts`). */
  function betParts(bet: PickSummary) {
    const lineFormat = numberFormat(intlLocale.value, { maximumFractionDigits: 2 })
    return pickParts(
      bet,
      (key) => t(key),
      (line) => lineFormat.format(line),
    )
  }

  /** Next language in `LOCALES`, wrapping round. */
  function toggleLocale(): void {
    setLocale(LOCALES[(LOCALES.indexOf(locale.value) + 1) % LOCALES.length]!)
  }

  return { t, locale, intlLocale, message, betParts, setLocale, toggleLocale }
}
