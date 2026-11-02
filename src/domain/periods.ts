import { addDays, toDayKey } from './days'

/**
 * Dashboard periods up to today: the last 7 and 30 days (today included), the calendar year, or
 * everything. Week and month roll so they never start empty on a Monday or on the 1st.
 */
export const PERIODS = ['week', 'month', 'year', 'all'] as const
export type Period = (typeof PERIODS)[number]

/** First local day of `period` containing `today`; null for `all`. */
export function periodStart(period: Period, today: Date): Date | null {
  switch (period) {
    case 'week':
      return addDays(today, -6)
    case 'month':
      return addDays(today, -29)
    case 'year':
      return new Date(today.getFullYear(), 0, 1)
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
