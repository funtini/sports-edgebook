/**
 * Fixed catalogue of what a prediction bets on: market (what is counted), bet type, period and
 * selection. Stored as these codes (checked by the database); labels come from `catalogue.*`.
 */

export const MARKETS = ['result', 'goals', 'corners', 'yellow_cards', 'cards'] as const
export type Market = (typeof MARKETS)[number]

export const BET_TYPES = [
  '1x2',
  'double_chance',
  'handicap',
  'result_total',
  'total',
  'team_total',
  'btts',
  'other',
] as const
export type BetType = (typeof BET_TYPES)[number]

/** Part of the game a bet is on: full time (regular time), first half, second half. */
export const MATCH_PERIODS = ['FT', 'HT', '2P'] as const
export type MatchPeriod = (typeof MATCH_PERIODS)[number]

const WINNER_TYPES = ['1x2', 'handicap', 'total', 'team_total', 'other'] as const

/** Bet types offered for each market, in the order the logging form shows them. */
export const BET_TYPES_BY_MARKET: Record<Market, readonly BetType[]> = {
  result: ['1x2', 'double_chance', 'handicap', 'result_total', 'other'],
  goals: ['total', 'team_total', 'btts', 'other'],
  corners: WINNER_TYPES,
  yellow_cards: WINNER_TYPES,
  cards: WINNER_TYPES,
}

/**
 * What the line means for a bet type: `total`, a number of goals / corners / cards whose sign is
 * the side (+ over, − under); `handicap`, a signed handicap; null, no line.
 */
export type LineKind = 'total' | 'handicap'

export function lineKind(betType: BetType): LineKind | null {
  switch (betType) {
    case 'total':
    case 'team_total':
    case 'result_total':
      return 'total'
    case 'handicap':
      return 'handicap'
    default:
      return null
  }
}

/** Where Linha's − / + start from when it is blank. */
const FIRST_LINE: Record<LineKind, number> = { total: 2.5, handicap: 0.5 }

/**
 * The line after a − (`-1`) or + (`1`) press on Linha: one unit down or up. A total steps its size
 * and keeps its side (−2.5 → −3.5 on +), never below 0.5; a handicap steps its signed value. A blank
 * line starts at 2.5 (total) or ±0.5 (handicap). Null when the line cannot step: a total already at
 * its smallest, or a line that is not a number.
 */
export function stepLine(kind: LineKind, line: number | null, direction: 1 | -1): number | null {
  if (line == null) return kind === 'total' ? FIRST_LINE.total : FIRST_LINE.handicap * direction
  if (Number.isNaN(line)) return null
  if (kind === 'handicap') return line + direction
  const size = Math.abs(line) + direction
  if (size < 0.5) return null
  return line < 0 ? -size : size
}

/** Lines go in steps of 0.5: 0.5, 1, 1.5, 2… */
export function isHalfStep(line: number): boolean {
  return Number.isInteger(line * 2)
}

/**
 * Sides the logging form offers for a bet type; empty for `total`, whose side is the line's sign,
 * and for `other`, whose selection is typed.
 */
export const PICKS: Record<BetType, readonly string[]> = {
  '1x2': ['home', 'draw', 'away'],
  double_chance: ['1x', 'x2', '12'],
  handicap: ['home', 'away'],
  result_total: ['home', 'draw', 'away', '1x', 'x2', '12'],
  total: [],
  team_total: ['home', 'away'],
  btts: ['yes', 'no'],
  other: [],
}

/** A bet as stored: selection code (free text for `other`) and line, unsigned for totals. */
export interface StoredPick {
  selection: string
  line: number | null
}

/**
 * Stored selection and line from what the form holds: the side picked (or typed, for `other`) and
 * the line as typed, signed. For totals the sign becomes `over` / `under` and the line is kept
 * unsigned (`team_total` + `home` + −1.5 → `home_under`, 1.5); handicap lines keep their sign.
 */
export function toStoredPick(betType: BetType, pick: string, line: number | null): StoredPick {
  if (lineKind(betType) !== 'total' || line == null || Number.isNaN(line)) {
    return { selection: pick, line }
  }
  const side = line < 0 ? 'under' : 'over'
  return { selection: betType === 'total' ? side : `${pick}_${side}`, line: Math.abs(line) }
}

/** Reverse of `toStoredPick`: the side and the signed line, as the form shows them. */
export function fromStoredPick(
  betType: BetType,
  { selection, line }: StoredPick,
): { pick: string; line: number | null } {
  if (lineKind(betType) !== 'total' || line == null) return { pick: selection, line }
  const under = selection === 'under' || selection.endsWith('_under')
  const pick = betType === 'total' ? '' : selection.replace(/_(over|under)$/, '')
  return { pick, line: under ? -line : line }
}

/** Whether a stored selection is one the catalogue allows for this bet type. */
export function isValidSelection(betType: BetType, selection: string): boolean {
  switch (betType) {
    case 'other':
      return selection.trim().length > 0
    case 'total':
      return selection === 'over' || selection === 'under'
    case 'team_total':
    case 'result_total':
      return PICKS[betType].some(
        (pick) => selection === `${pick}_over` || selection === `${pick}_under`,
      )
    default:
      return PICKS[betType].includes(selection)
  }
}

/** The fields of a prediction a summary shows; labels come from `catalogue.*` keys. */
export interface PickSummary {
  market: Market
  bet_type: BetType
  period: MatchPeriod
  selection: string
  line: number | null
}

/** Labels of a bet's market, type, period and selection, in the order a summary shows them. */
export function pickParts(
  bet: PickSummary,
  translate: (key: string) => string,
  formatLine: (line: number) => string,
): [market: string, betType: string, period: string, selection: string] {
  return [
    translate(`catalogue.market.${bet.market}`),
    translate(`catalogue.betType.${bet.bet_type}`),
    bet.period,
    selectionLabel(bet, translate, formatLine),
  ]
}

/**
 * The bet as one line: Mercado - Tipo - Período - Seleção, e.g. `Resultado - 1X2 - HT - V1`,
 * `Golos - Total - FT - +2,5`, `Resultado - Handicap - FT - V1 −1,5`. `formatLine` formats the
 * absolute line in the active locale.
 */
export function pickSummary(
  bet: PickSummary,
  translate: (key: string) => string,
  formatLine: (line: number) => string,
): string {
  return pickParts(bet, translate, formatLine).join(' - ')
}

/** The selection part of `pickSummary`: side and signed line. */
export function selectionLabel(
  bet: Pick<PickSummary, 'bet_type' | 'selection' | 'line'>,
  translate: (key: string) => string,
  formatLine: (line: number) => string,
): string {
  const { pick, line } = fromStoredPick(bet.bet_type, bet)
  const side = bet.bet_type === 'other' || !pick ? pick : translate(`catalogue.pick.${pick}`)
  if (line == null) return side
  const sign = line < 0 ? '−' : line > 0 || lineKind(bet.bet_type) === 'total' ? '+' : ''
  const number = `${sign}${formatLine(Math.abs(line))}`
  return side ? `${side} ${number}` : number
}
