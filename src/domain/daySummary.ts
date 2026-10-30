import { hitRate } from './metrics'
import { isPunterBet, predictionProfit, stakeFor, type SettleablePrediction } from './settlement'

export interface DaySummary {
  total: number
  settled: number
  /** Predictions won, punter or not. */
  won: number
  /** Predictions still pending. */
  open: number
  hitRate: number | null
  /** P/L of settled punter bets, in units. */
  punterProfit: number
  /** Number of punter bets, settled or not. */
  punterBets: number
  /** Units staked on punter bets, settled or not. */
  punterStaked: number
}

export function daySummary(predictions: SettleablePrediction[]): DaySummary {
  const punter = predictions.filter(isPunterBet)
  const open = predictions.filter((p) => p.status === 'pending').length
  return {
    total: predictions.length,
    settled: predictions.length - open,
    won: predictions.filter((p) => p.status === 'won').length,
    open,
    hitRate: hitRate(predictions.map((p) => p.status)),
    punterProfit: punter.reduce((sum, p) => sum + (predictionProfit(p) ?? 0), 0),
    punterBets: punter.length,
    punterStaked: punter.reduce((sum, p) => sum + stakeFor(p), 0),
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
