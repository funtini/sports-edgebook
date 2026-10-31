import { toDayKey } from './days'
import type { LegOrigin } from './multipleDraft'
import {
  betProfit,
  multipleOdd,
  multipleStatus,
  VIRTUAL_STAKE_UNITS,
  type BetStatus,
} from './settlement'

/** Filter chips on Guardadas. */
export const SAVED_FILTERS = ['all', 'placed', 'simulated'] as const
export type SavedFilter = (typeof SAVED_FILTERS)[number]

/** The fields of a saved multiple and its legs that settlement reads. */
export interface SettleableMultiple {
  is_placed: boolean
  stake_units: number | null
  status: BetStatus
  legs: {
    odd_at_selection: number
    prediction: { status: BetStatus; event: { kickoff_at: string } }
  }[]
}

export interface MultipleSettlement {
  /** From the legs (`multipleStatus`): what the stored status should be. */
  status: BetStatus
  /** Product of the leg odds, void legs at 1.00 (`multipleOdd`). */
  effectiveOdd: number
  /** Legs settled void. */
  voidLegs: number
  /** A placed multiple with its stake; simulated ones are evaluated on 1 virtual unit. */
  real: boolean
  stake: number
  /** stake × (effective odd − 1) when won, −stake when lost, 0 when void; null while pending. */
  profit: number | null
}

/** Status, effective odd and profit of a saved multiple, all from its legs. */
export function settleMultiple(multiple: SettleableMultiple): MultipleSettlement {
  const legs = multiple.legs.map((leg) => ({
    odd: leg.odd_at_selection,
    status: leg.prediction.status,
  }))
  const status = legs.length ? multipleStatus(legs) : multiple.status
  const effectiveOdd = multipleOdd(legs)
  const real = multiple.is_placed && multiple.stake_units != null
  const stake = real ? (multiple.stake_units as number) : VIRTUAL_STAKE_UNITS
  return {
    status,
    effectiveOdd,
    voidLegs: legs.filter((leg) => leg.status === 'void').length,
    real,
    stake,
    profit: betProfit(stake, effectiveOdd, status),
  }
}

/**
 * The `multiples` update that brings the stored status in line with the legs, or null when it
 * already is. `settled_at` is set when it leaves pending and cleared when it goes back.
 */
export function statusUpdate(
  multiple: SettleableMultiple & { settled_at: string | null },
  now = new Date(),
): { status: BetStatus; settled_at: string | null } | null {
  const { status } = settleMultiple(multiple)
  if (status === multiple.status) return null
  return {
    status,
    settled_at: status === 'pending' ? null : (multiple.settled_at ?? now.toISOString()),
  }
}

export function matchesFilter(multiple: { is_placed: boolean }, filter: SavedFilter): boolean {
  if (filter === 'placed') return multiple.is_placed
  if (filter === 'simulated') return !multiple.is_placed
  return true
}

/** A multiple's day: its first leg's kickoff (as on the dashboard), or null without legs. */
export function multipleKickoff(multiple: SettleableMultiple): string | null {
  const kickoffs = multiple.legs.map((leg) => leg.prediction.event.kickoff_at)
  if (!kickoffs.length) return null
  return kickoffs.reduce((first, k) => (Date.parse(k) < Date.parse(first) ? k : first))
}

export interface DayMultiples {
  /** Placed multiples whose first leg is on the day. */
  count: number
  /** P/L of the settled ones, in units. */
  profit: number
  settled: number
}

/** "Múltiplas do dia" on Hoje: placed multiples of a local day (`YYYY-MM-DD`) and their P/L. */
export function dayMultiples(multiples: SettleableMultiple[], dayKey: string): DayMultiples {
  const placed = multiples.filter((m) => {
    const kickoff = m.is_placed ? multipleKickoff(m) : null
    return kickoff != null && toDayKey(new Date(kickoff)) === dayKey
  })
  const profits = placed.map((m) => settleMultiple(m).profit)
  return {
    count: placed.length,
    profit: profits.reduce<number>((sum, p) => sum + (p ?? 0), 0),
    settled: profits.filter((p) => p != null).length,
  }
}

export interface ReusableLeg<P> {
  origin: LegOrigin
  prediction: P
}

/** Reutilizar: the legs whose game has not started yet, and how many were left out. */
export function reusableLegs<P extends { event: { kickoff_at: string } }>(
  legs: readonly ReusableLeg<P>[],
  now = new Date(),
): { kept: ReusableLeg<P>[]; dropped: number } {
  const kept = legs.filter((leg) => Date.parse(leg.prediction.event.kickoff_at) > now.getTime())
  return { kept, dropped: legs.length - kept.length }
}
