import { toDayKey } from './days'

/** Dashboard periods: calendar week (from Monday), month and year up to today, or everything. */
export const PERIODS = ['week', 'month', 'year', 'all'] as const
export type Period = (typeof PERIODS)[number]

/** First local day of `period` containing `today`; null for `all`. */
export function periodStart(period: Period, today: Date): Date | null {
  const y = today.getFullYear()
  const m = today.getMonth()
  switch (period) {
    case 'week':
      // getDay() is 0 on Sunday: the week starts on the Monday before it.
      return new Date(y, m, today.getDate() - ((today.getDay() + 6) % 7))
    case 'month':
      return new Date(y, m, 1)
    case 'year':
      return new Date(y, 0, 1)
    case 'all':
      return null
  }
}

/**
 * `from`..`to` day keys for `inPeriod` and `cumulativeSeries`: from the period start (for `all`,
 * the earliest of `dates`, or today without any) to today.
 */
export function periodRange(
  period: Period,
  today: Date,
  dates: string[] = [],
): { from: string; to: string } {
  const to = toDayKey(today)
  const start = periodStart(period, today)
  if (start) return { from: toDayKey(start), to }
  const days = dates.map((date) => toDayKey(new Date(date)))
  const from = days.reduce((first, day) => (day < first ? day : first), to)
  return { from, to }
}
