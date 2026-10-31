import type { ConfidenceLevel } from './confidence'
import { DEFAULT_TOLERANCE, type Candidate } from './generator'
import type { Market } from './markets'
import { multipleOdd } from './settlement'
import { valueIndex } from './value'

/** A multiple needs at least this many legs to be saved. */
export const MIN_SAVED_LEGS = 2

/** How a leg got into the multiple. */
export type LegOrigin = 'manual' | 'generated'

/** `mixed`: some legs added by hand, some by the generator. */
export type MultipleOrigin = LegOrigin | 'mixed'

/** The fields of a pending prediction (with its event) the generator reads. */
export interface CandidateSource {
  id: string
  event_id: string
  market: Market
  odd: number
  probability: number
  confidence: number
  is_punter: boolean
  event: { kickoff_at: string; league_id: string | null }
}

export function toCandidate(prediction: CandidateSource): Candidate {
  return {
    id: prediction.id,
    event_id: prediction.event_id,
    kickoff_at: prediction.event.kickoff_at,
    league_id: prediction.event.league_id,
    market: prediction.market,
    odd: prediction.odd,
    probability: prediction.probability,
    confidence: prediction.confidence as ConfidenceLevel,
    is_punter: prediction.is_punter,
  }
}

/** `manual` or `generated` when every leg agrees, `mixed` otherwise; `manual` without legs. */
export function multipleOrigin(origins: readonly LegOrigin[]): MultipleOrigin {
  if (origins.every((origin) => origin === 'manual')) return 'manual'
  if (origins.every((origin) => origin === 'generated')) return 'generated'
  return 'mixed'
}

export interface SlipTotals {
  /** Product of leg odds; 1 without legs. */
  totalOdd: number
  /** Product of leg probabilities, assuming independence. */
  probability: number
  /** probability × totalOdd − 1. */
  ev: number
}

/** Totals of the multiple being built, every leg pending. */
export function slipTotals(legs: readonly { odd: number; probability: number }[]): SlipTotals {
  const totalOdd = multipleOdd(legs.map((leg) => ({ odd: leg.odd, status: 'pending' as const })))
  const probability = legs.reduce((total, leg) => total * leg.probability, 1)
  return { totalOdd, probability, ev: valueIndex(probability, totalOdd) - 1 }
}

/** Whether a total odd is within `tolerance` (relative) of `target`, as the generator judges it. */
export function withinTolerance(
  totalOdd: number,
  target: number,
  tolerance = DEFAULT_TOLERANCE,
): boolean {
  return Math.abs(totalOdd / target - 1) <= tolerance
}

/** Profit in units if every leg wins. */
export function potentialProfit(stakeUnits: number, totalOdd: number): number {
  return stakeUnits * (totalOdd - 1)
}
