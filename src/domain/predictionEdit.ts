import { probabilityFor, type ConfidenceAnchors, type ConfidenceLevel } from './confidence'
import { parseDecimal } from './decimal'
import { DEFAULT_LOCALE, numberFormat } from './intl'
import type { PredictionUpdate } from './schemas'

/**
 * The fields of a logged prediction that can be edited from a prediction row, as typed. The pick
 * (market, type, period, selection, line) and the event stay as logged.
 */
export interface PredictionEditDraft {
  /** Typed with comma or dot. */
  odd: string
  confidence: ConfidenceLevel | null
  isLive: boolean
  isPunter: boolean
  /** Stake in units, typed with comma or dot. */
  stake: string
  bookmaker: string
  notes: string
}

/** The stored values a draft starts from. */
export interface EditablePrediction {
  odd: number
  confidence: number
  is_live: boolean
  is_punter: boolean
  stake_units: number | null
  bookmaker: string | null
  notes: string | null
}

/** A stored prediction as the edit form's fields, numbers in the active language (`1,85`). */
export function editDraftFrom(
  prediction: EditablePrediction,
  locale: string = DEFAULT_LOCALE,
): PredictionEditDraft {
  const typed = numberFormat(locale, { maximumFractionDigits: 3, useGrouping: false })
  return {
    odd: typed.format(prediction.odd),
    confidence: prediction.confidence as ConfidenceLevel,
    isLive: prediction.is_live,
    isPunter: prediction.is_punter,
    stake: prediction.stake_units == null ? '' : typed.format(prediction.stake_units),
    bookmaker: prediction.bookmaker ?? '',
    notes: prediction.notes ?? '',
  }
}

/** Input for `predictionUpdateSchema`; stake and bookmaker only count for a punter bet. */
export function predictionEditInput(
  draft: PredictionEditDraft,
): Record<keyof PredictionUpdate, unknown> {
  return {
    odd: parseDecimal(draft.odd) ?? undefined,
    confidence: draft.confidence ?? undefined,
    is_live: draft.isLive,
    is_punter: draft.isPunter,
    stake_units: draft.isPunter ? parseDecimal(draft.stake) : null,
    bookmaker: draft.isPunter ? draft.bookmaker.trim() || null : null,
    notes: draft.notes.trim() || null,
  }
}

/**
 * Probability to store after an edit: the one stored at logging time while the confidence level
 * stays the same (past rows are never recomputed from current anchors); a new level takes its
 * probability from the current anchors, as logging it again would.
 */
export function editedProbability(
  stored: { confidence: number; probability: number },
  confidence: ConfidenceLevel,
  anchors: ConfidenceAnchors,
): number {
  return confidence === stored.confidence ? stored.probability : probabilityFor(confidence, anchors)
}
