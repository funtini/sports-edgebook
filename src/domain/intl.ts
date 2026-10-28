/** The app's default language, and the locale formatters use when the caller passes none. */
export const DEFAULT_LOCALE = 'pt-PT'

const numberFormats = new Map<string, Intl.NumberFormat>()
const dateFormats = new Map<string, Intl.DateTimeFormat>()

function cached<F>(cache: Map<string, F>, locale: string, options: object, build: () => F): F {
  const key = `${locale}|${JSON.stringify(options)}`
  let format = cache.get(key)
  if (!format) {
    format = build()
    cache.set(key, format)
  }
  return format
}

/** `Intl.NumberFormat` is costly to build: one per locale and options, reused. */
export function numberFormat(locale: string, options: Intl.NumberFormatOptions = {}) {
  return cached(numberFormats, locale, options, () => new Intl.NumberFormat(locale, options))
}

/** `Intl.DateTimeFormat`, cached like `numberFormat`. */
export function dateTimeFormat(locale: string, options: Intl.DateTimeFormatOptions = {}) {
  return cached(dateFormats, locale, options, () => new Intl.DateTimeFormat(locale, options))
}

/** `0.65` → `65%`. */
export function formatPercent(value: number, locale: string = DEFAULT_LOCALE): string {
  return numberFormat(locale, { style: 'percent', maximumFractionDigits: 0 }).format(value)
}

/** Local time of day, `20:15`. */
export function formatTime(date: Date, locale: string = DEFAULT_LOCALE): string {
  return dateTimeFormat(locale, { hour: '2-digit', minute: '2-digit' }).format(date)
}
