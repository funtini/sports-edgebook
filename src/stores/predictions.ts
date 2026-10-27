import { defineStore } from 'pinia'
import { probabilityFor, type ConfidenceLevel } from '@/domain/confidence'
import { predictionCreateSchema, type PredictionCreate } from '@/domain/schemas'
import type { BetStatus, PredictionWithRelations } from '@/types/db'
import { PREDICTION_SELECT, requireSupabase, unwrap } from './client'
import { useSettingsStore } from './settings'

/** By kickoff, then by logging order. */
function byKickoff(a: PredictionWithRelations, b: PredictionWithRelations): number {
  return (
    Date.parse(a.event.kickoff_at) - Date.parse(b.event.kickoff_at) ||
    Date.parse(a.created_at) - Date.parse(b.created_at)
  )
}

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
    const start = new Date(date.getFullYear(), date.getMonth(), date.getDate())
    const end = new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1)
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

  /** Pending predictions on games that kicked off before `date` (local day), oldest first. */
  async function listPendingBefore(date: Date): Promise<PredictionWithRelations[]> {
    const start = new Date(date.getFullYear(), date.getMonth(), date.getDate())
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

  async function remove(id: string): Promise<void> {
    unwrap(await requireSupabase().from('predictions').delete().eq('id', id))
  }

  return { create, listByDate, listByEvent, listPending, listPendingBefore, settle, remove }
})
