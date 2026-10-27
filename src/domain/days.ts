/** Local midnight of the day `date` falls on. */
export function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate())
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

/** Local `YYYY-MM-DD` of a date, used in the URL. */
export function toDayKey(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

/** Local midnight of a `YYYY-MM-DD` key; null when the key is not a valid date. */
export function fromDayKey(key: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key)
  if (!match) return null
  const [y, m, d] = match.slice(1).map(Number) as [number, number, number]
  const date = new Date(y, m - 1, d)
  return date.getMonth() === m - 1 && date.getDate() === d ? date : null
}

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']

const shortFormats = new Map<string, Intl.DateTimeFormat>()

/**
 * Short day label: PT-PT `ter, 27 out` (built by hand, Intl's pt-PT short weekday is the full
 * name); other locales from Intl, e.g. en-GB `Tue 27 Oct`.
 */
export function shortDayLabel(date: Date, locale: string = 'pt-PT'): string {
  if (locale === 'pt-PT') {
    return `${WEEKDAYS[date.getDay()]}, ${date.getDate()} ${MONTHS[date.getMonth()]}`
  }
  let format = shortFormats.get(locale)
  if (!format) {
    format = new Intl.DateTimeFormat(locale, { weekday: 'short', day: 'numeric', month: 'short' })
    shortFormats.set(locale, format)
  }
  return format.format(date)
}
