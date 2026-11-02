/**
 * Editing a slip leg in the confirmation window (docs/specs/slip-import.md#prediction-cards): the
 * leg keeps the stored selection code and unsigned line, and these helpers split and join it for
 * the Registo controls, and keep market, type and selection consistent as in Registo.
 */

import { BET_TYPES_BY_MARKET, lineKind, type BetType, type Market, type OverUnder } from './markets'
import type { SlipLeg } from './slipRead'

/** Long side, in pixels, an image is shrunk to before it is sent to be read. */
export const SLIP_IMAGE_MAX_SIDE = 1600

/** Size that fits `width` × `height` within `max` on its long side, keeping its shape. */
export function fitWithin(
  width: number,
  height: number,
  max = SLIP_IMAGE_MAX_SIDE,
): { width: number; height: number } {
  const long = Math.max(width, height)
  if (long <= max || long <= 0) return { width, height }
  const scale = max / long
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

/** Whether a bet type's stored selection carries a side as well as over / under. */
function hasSideAndTotal(betType: BetType): boolean {
  return betType === 'team_total' || betType === 'result_total'
}

/** The side part of a stored selection (`home_under` → `home`); empty for `total`. */
export function selectionSide(betType: BetType, selection: string | null): string {
  if (selection == null) return ''
  if (betType === 'total') return ''
  if (hasSideAndTotal(betType)) return selection.replace(/_(over|under)$/, '')
  return selection
}

/** A total's side in a stored selection; over unless it says under. */
export function selectionOverUnder(selection: string | null): OverUnder {
  return selection === 'under' || selection?.endsWith('_under') ? 'under' : 'over'
}

/** The stored selection from a side and a total's over / under; null while it is incomplete. */
export function joinSelection(betType: BetType, side: string, overUnder: OverUnder): string | null {
  if (betType === 'total') return overUnder
  const trimmed = side.trim()
  if (!trimmed) return null
  if (hasSideAndTotal(betType)) return `${trimmed}_${overUnder}`
  return trimmed
}

/** A new bet type: the selection starts over and the line goes when the type has none. */
export function withBetType(leg: SlipLeg, betType: BetType): SlipLeg {
  if (leg.betType === betType) return leg
  const keepsLine = lineKind(betType) != null
  return { ...leg, betType, selection: null, line: keepsLine ? leg.line : null }
}

/** A new market: a type it does not offer falls back to its first, as in Registo. */
export function withMarket(leg: SlipLeg, market: Market): SlipLeg {
  const next = { ...leg, market }
  const types = BET_TYPES_BY_MARKET[market]
  if (leg.betType != null && types.includes(leg.betType)) return next
  return withBetType(next, types[0]!)
}

const pad = (n: number) => String(n).padStart(2, '0')

/** An ISO time as a `datetime-local` input value, in the browser's time zone. */
export function toLocalInput(iso: string | null): string {
  if (iso == null) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(
    date.getHours(),
  )}:${pad(date.getMinutes())}`
}

/** A `datetime-local` input value as an ISO time; null when blank or not a date. */
export function fromLocalInput(value: string): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}
