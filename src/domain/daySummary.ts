import { hitRate } from './metrics'
import { isPunterBet, predictionProfit, type SettleablePrediction } from './settlement'

export interface DaySummary {
  total: number
  settled: number
  hitRate: number | null
  /** P/L of settled punter bets, in units. */
  punterProfit: number
  /** Number of punter bets, settled or not. */
  punterBets: number
}

export function daySummary(predictions: SettleablePrediction[]): DaySummary {
  const punter = predictions.filter(isPunterBet)
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
