import type { PrimeVueLocaleOptions } from 'primevue/config'

type Translate = (key: string) => string

/** `count` names from `Intl`, e.g. weekdays starting on Sunday (2023-01-01 was one). */
function names(
  locale: string,
  count: number,
  date: (i: number) => Date,
  options: Intl.DateTimeFormatOptions,
): string[] {
  const format = new Intl.DateTimeFormat(locale, { ...options, timeZone: 'UTC' })
  return Array.from({ length: count }, (_, i) => format.format(date(i)))
}

const weekday = (i: number) => new Date(Date.UTC(2023, 0, 1 + i))
const month = (i: number) => new Date(Date.UTC(2023, i, 1))

/** PrimeVue locale (DatePicker day/month names, buttons) for an `Intl` locale. */
export function primeVueLocale(locale: string, t: Translate): Partial<PrimeVueLocaleOptions> {
  return {
    dayNames: names(locale, 7, weekday, { weekday: 'long' }),
    dayNamesShort: names(locale, 7, weekday, { weekday: 'short' }),
    dayNamesMin: names(locale, 7, weekday, { weekday: 'narrow' }),
    monthNames: names(locale, 12, month, { month: 'long' }),
    monthNamesShort: names(locale, 12, month, { month: 'short' }),
    firstDayOfWeek: 1,
    dateFormat: 'dd/mm/yy',
    today: t('primevue.today'),
    clear: t('primevue.clear'),
    weekHeader: t('primevue.weekHeader'),
    chooseYear: t('primevue.chooseYear'),
    chooseMonth: t('primevue.chooseMonth'),
    chooseDate: t('primevue.chooseDate'),
    prevYear: t('primevue.prevYear'),
    nextYear: t('primevue.nextYear'),
    prevMonth: t('primevue.prevMonth'),
    nextMonth: t('primevue.nextMonth'),
    accept: t('primevue.accept'),
    reject: t('primevue.reject'),
  }
}
