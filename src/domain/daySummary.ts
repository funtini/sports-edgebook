import { betProfit, type BetStatus } from './settlement'

/** Stake a non-punter prediction is evaluated with. */
export const VIRTUAL_STAKE_UNITS = 1

export interface SettleablePrediction {
  odd: number
  status: BetStatus
  is_punter: boolean
  stake_units: number | null
}

/** Punter bets use their real stake; the rest a virtual 1 unit. */
export function stakeFor(prediction: SettleablePrediction): number {
  return prediction.is_punter && prediction.stake_units != null
    ? prediction.stake_units
    : VIRTUAL_STAKE_UNITS
}

/** Profit in units at the stake from `stakeFor`; null while pending. */
export function predictionProfit(prediction: SettleablePrediction): number | null {
  return betProfit(stakeFor(prediction), prediction.odd, prediction.status)
}

/** won ÷ (won + lost); voids and pending excluded. Null when nothing counts yet. */
export function hitRate(statuses: BetStatus[]): number | null {
  const won = statuses.filter((s) => s === 'won').length
  const lost = statuses.filter((s) => s === 'lost').length
  return won + lost === 0 ? null : won / (won + lost)
}

export interface DaySummary {
  total: number
  settled: number
  hitRate: number | null
  /** P/L of settled punter bets, in units. */
  punterProfit: number
  /** Number of punter bets with a stake, settled or not. */
  punterBets: number
}

export function daySummary(predictions: SettleablePrediction[]): DaySummary {
  const punter = predictions.filter((p) => p.is_punter && p.stake_units != null)
  return {
    total: predictions.length,
    settled: predictions.filter((p) => p.status !== 'pending').length,
    hitRate: hitRate(predictions.map((p) => p.status)),
    punterProfit: punter.reduce((sum, p) => sum + (predictionProfit(p) ?? 0), 0),
    punterBets: punter.length,
  }
}

export interface EventGroup<T> {
  eventId: string
  predictions: T[]
}

/** Groups by event, keeping the order in which each event first appears. */
export function groupByEvent<T extends { event_id: string }>(predictions: T[]): EventGroup<T>[] {
  const groups = new Map<string, T[]>()
  for (const prediction of predictions) {
    const group = groups.get(prediction.event_id)
    if (group) group.push(prediction)
    else groups.set(prediction.event_id, [prediction])
  }
  return [...groups].map(([eventId, items]) => ({ eventId, predictions: items }))
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

export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}
