import type { ConfidenceLevel } from './confidence'
import type { Bet } from './metrics'
import {
  isPunterBet,
  multipleOdd,
  multipleStatus,
  stakeFor,
  VIRTUAL_STAKE_UNITS,
  type BetStatus,
} from './settlement'
import { valueBand, valueIndex } from './value'

/** The fields of a prediction (with its event and market) that a `Bet` reads. */
export interface BetPrediction {
  odd: number
  status: BetStatus
  is_punter: boolean
  stake_units: number | null
  probability: number
  confidence: number
  bookmaker: string | null
  event: {
    kickoff_at: string
    home_team: { name: string }
    away_team: { name: string }
    league: { name: string } | null
  }
  market: { category: string; name: string }
}

/** A single as the metrics read it: stake from `stakeFor`, dimensions from its event and market. */
export function betFromPrediction(prediction: BetPrediction): Bet {
  return {
    kind: 'single',
    status: prediction.status,
    odd: prediction.odd,
    stake: stakeFor(prediction),
    real: isPunterBet(prediction),
    probability: prediction.probability,
    date: prediction.event.kickoff_at,
    marketCategory: prediction.market.category,
    marketName: prediction.market.name,
    leagueName: prediction.event.league?.name ?? null,
    teams: [prediction.event.home_team.name, prediction.event.away_team.name],
    confidence: prediction.confidence as ConfidenceLevel,
    valueBand: valueBand(valueIndex(prediction.probability, prediction.odd)),
    bookmaker: prediction.bookmaker,
  }
}

/** The fields of a multiple and its legs that a `Bet` reads. */
export interface BetMultiple {
  is_placed: boolean
  stake_units: number | null
  legs: {
    /** Odd when the leg was picked. */
    odd_at_selection: number
    prediction: { status: BetStatus; probability: number; event: { kickoff_at: string } }
  }[]
}

/**
 * A multiple as the metrics read it, or null without legs. Status and effective odd follow the
 * legs (void legs at 1.00); stake is 1 virtual unit unless placed.
 */
export function betFromMultiple(multiple: BetMultiple): Bet | null {
  if (!multiple.legs.length) return null
  const legs = multiple.legs.map((leg) => ({
    odd: leg.odd_at_selection,
    status: leg.prediction.status,
  }))
  const kickoffs = multiple.legs.map((leg) => leg.prediction.event.kickoff_at)
  const real = multiple.is_placed && multiple.stake_units != null
  return {
    kind: 'multiple',
    status: multipleStatus(legs),
    odd: multipleOdd(legs),
    stake: real ? (multiple.stake_units as number) : VIRTUAL_STAKE_UNITS,
    real,
    probability: multiple.legs.reduce((p, leg) => p * leg.prediction.probability, 1),
    date: kickoffs.reduce((first, k) => (Date.parse(k) < Date.parse(first) ? k : first)),
  }
}
