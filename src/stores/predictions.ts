import { defineStore } from 'pinia'
import { probabilityFor, type ConfidenceLevel } from '@/domain/confidence'
import { addDays, startOfDay } from '@/domain/days'
import { recentEvents, type RecentEvent } from '@/domain/eventSource'
import { predictionCreateSchema, type PredictionCreate } from '@/domain/schemas'
import type { BetStatus, PredictionWithRelations } from '@/types/db'
import { EVENT_SELECT, PREDICTION_SELECT, requireSupabase, unwrap } from './client'
import { useSettingsStore } from './settings'

/** By kickoff, then by logging order. */
function byKickoff(a: PredictionWithRelations, b: PredictionWithRelations): number {
  return (
    Date.parse(a.event.kickoff_at) - Date.parse(b.event.kickoff_at) ||
    Date.parse(a.created_at) - Date.parse(b.created_at)
  )
}

/** Newest predictions read to find the recent events. */
const RECENT_ROWS = 100

export const usePredictionsStore = defineStore('predictions', () => {
  /** Stores the probability of the confidence level from the user's anchors at this moment. */
  async function create(input: PredictionCreate): Promise<PredictionWithRelations> {
    const prediction = predictionCreateSchema.parse(input)
    const settings = useSettingsStore()
    await settings.ensureLoaded()
    const probability = probabilityFor(
      prediction.confidence as ConfidenceLevel,
      settings.confidenceAnchors,
    )
    return unwrap<PredictionWithRelations>(
      await requireSupabase()
        .from('predictions')
        .insert({ ...prediction, probability })
        .select(PREDICTION_SELECT)
        .single(),
    )
  }

  /** Predictions on games kicking off on `date` (local day). */
  async function listByDate(date: Date): Promise<PredictionWithRelations[]> {
    const start = startOfDay(date)
    const end = addDays(start, 1)
    const rows = unwrap<PredictionWithRelations[]>(
      await requireSupabase()
        .from('predictions')
        .select(PREDICTION_SELECT)
        .gte('event.kickoff_at', start.toISOString())
        .lt('event.kickoff_at', end.toISOString()),
    )
    return rows.sort(byKickoff)
  }

  async function listByEvent(eventId: string): Promise<PredictionWithRelations[]> {
    return unwrap<PredictionWithRelations[]>(
      await requireSupabase()
        .from('predictions')
        .select(PREDICTION_SELECT)
        .eq('event_id', eventId)
        .order('created_at'),
    )
  }

  async function listPending(): Promise<PredictionWithRelations[]> {
    const rows = unwrap<PredictionWithRelations[]>(
      await requireSupabase().from('predictions').select(PREDICTION_SELECT).eq('status', 'pending'),
    )
    return rows.sort(byKickoff)
  }

  /** Pending predictions on games from `from` to `to` (local days, both included). */
  async function listPendingBetween(from: Date, to: Date): Promise<PredictionWithRelations[]> {
    const rows = unwrap<PredictionWithRelations[]>(
      await requireSupabase()
        .from('predictions')
        .select(PREDICTION_SELECT)
        .eq('status', 'pending')
        .gte('event.kickoff_at', startOfDay(from).toISOString())
        .lt('event.kickoff_at', addDays(startOfDay(to), 1).toISOString()),
    )
    return rows.sort(byKickoff)
  }

  /** Pending predictions on games that kicked off before `date` (local day), oldest first. */
  async function listPendingBefore(date: Date): Promise<PredictionWithRelations[]> {
    const start = startOfDay(date)
    const rows = unwrap<PredictionWithRelations[]>(
      await requireSupabase()
        .from('predictions')
        .select(PREDICTION_SELECT)
        .eq('status', 'pending')
        .lt('event.kickoff_at', start.toISOString()),
    )
    return rows.sort(byKickoff)
  }

  /** Sets the status; `settled_at` is now, or cleared when going back to pending. */
  async function settle(id: string, status: BetStatus): Promise<PredictionWithRelations> {
    const settled_at = status === 'pending' ? null : new Date().toISOString()
    return unwrap<PredictionWithRelations>(
      await requireSupabase()
        .from('predictions')
        .update({ status, settled_at })
        .eq('id', id)
        .select(PREDICTION_SELECT)
        .single(),
    )
  }

  /**
   * The last events predictions were logged on, without a result yet (`recentEvents`). Reads the
   * newest predictions on events without a score; counts cover those rows.
   */
  async function listRecentEvents(limit = 3): Promise<RecentEvent[]> {
    const rows = unwrap<Pick<PredictionWithRelations, 'created_at' | 'event'>[]>(
      await requireSupabase()
        .from('predictions')
        .select(`created_at, event:events!inner(${EVENT_SELECT})`)
        .is('event.home_score', null)
        .order('created_at', { ascending: false })
        .limit(RECENT_ROWS),
    )
    return recentEvents(rows, limit)
  }

  /**
   * Bookmakers used before, for autocomplete; most used first.
   * TODO: read a distinct-bookmakers view; PostgREST caps this select at 1000 rows.
   */
  async function listBookmakers(): Promise<string[]> {
    const rows = unwrap<{ bookmaker: string }[]>(
      await requireSupabase().from('predictions').select('bookmaker').not('bookmaker', 'is', null),
    )
    const counts = new Map<string, number>()
    for (const { bookmaker } of rows) counts.set(bookmaker, (counts.get(bookmaker) ?? 0) + 1)
    return [...counts.keys()].sort((a, b) => counts.get(b)! - counts.get(a)! || a.localeCompare(b))
  }

  async function remove(id: string): Promise<void> {
    unwrap(await requireSupabase().from('predictions').delete().eq('id', id))
  }

  return {
    create,
    listByDate,
    listByEvent,
    listPending,
    listPendingBefore,
    listPendingBetween,
    listBookmakers,
    listRecentEvents,
    settle,
    remove,
  }
})
