import { defineStore } from 'pinia'
import { betFromMultiple, betFromPrediction, type BetMultiple } from '@/domain/bets'
import { addDays, startOfDay } from '@/domain/days'
import type { Bet } from '@/domain/metrics'
import type { MultipleRow, PredictionWithRelations } from '@/types/db'
import { PREDICTION_SELECT, requireSupabase, unwrap } from './client'

/** PostgREST returns at most this many rows per request. */
const PAGE = 1000

const MULTIPLE_SELECT =
  '*, legs:multiple_legs(odd_at_selection, prediction:predictions(status, probability, event:events(kickoff_at)))'

type MultipleWithLegs = MultipleRow & BetMultiple

/** Every page of a query; `page(from, to)` builds it with `.range(from, to)`. */
async function allPages<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = []
  for (let from = 0; ; from += PAGE) {
    const batch = unwrap<T[]>(await page(from, from + PAGE - 1))
    rows.push(...batch)
    if (batch.length < PAGE) return rows
  }
}

/** Singles and multiples mapped to `Bet` for the dashboard metrics (`src/domain/metrics.ts`). */
export const useBetsStore = defineStore('bets', () => {
  /**
   * Settled predictions on games from `from` (local day, none for all) to `to` (local day, both
   * included), and every multiple: its date is its first leg's kickoff, so `inPeriod` narrows them.
   */
  async function listSettled(from: Date | null, to: Date): Promise<Bet[]> {
    const db = requireSupabase()
    const end = addDays(startOfDay(to), 1).toISOString()
    const [predictions, multiples] = await Promise.all([
      allPages<PredictionWithRelations>((first, last) => {
        let query = db
          .from('predictions')
          .select(PREDICTION_SELECT)
          .neq('status', 'pending')
          .lt('event.kickoff_at', end)
        if (from) query = query.gte('event.kickoff_at', startOfDay(from).toISOString())
        return query.order('id').range(first, last)
      }),
      allPages<MultipleWithLegs>((first, last) =>
        db.from('multiples').select(MULTIPLE_SELECT).order('id').range(first, last),
      ),
    ])
    return [
      ...predictions.map(betFromPrediction),
      ...multiples.map(betFromMultiple).filter((bet): bet is Bet => bet != null),
    ]
  }

  return { listSettled }
})
