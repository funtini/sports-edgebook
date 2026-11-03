import type { ConfidenceLevel } from './confidence'
import { parseDecimal } from './decimal'
import { DEFAULT_LOCALE, numberFormat } from './intl'
import {
  fromStoredPick,
  lineKind,
  toStoredPick,
  type BetType,
  type Market,
  type MatchPeriod,
  type OverUnder,
} from './markets'
import type { NewGameForm, PredictionForm } from './schemas'

/** What a prediction bets on (Mercado, Tipo, Período, Seleção, Linha) as typed. */
export interface PickDraft {
  market: Market
  betType: BetType
  period: MatchPeriod
  /** Side picked from the catalogue, or the selection typed for type `other`. */
  pick: string
  /** Typed with comma or dot; signed for handicaps, a total's size (its side is `overUnder`). */
  line: string
  /** A total's side. */
  overUnder: OverUnder
}

/** The logging form's prediction fields as typed, before validation. */
export interface PredictionDraft extends PickDraft {
  odd: string
  confidence: ConfidenceLevel | null
  /** Logged with the game already under way. */
  isLive: boolean
  isPunter: boolean
  stake: string
  bookmaker: string
  notes: string
}

export function emptyPredictionDraft(): PredictionDraft {
  return {
    market: 'result',
    betType: '1x2',
    period: 'FT',
    pick: '',
    line: '',
    overUnder: 'over',
    odd: '',
    confidence: null,
    isLive: false,
    isPunter: false,
    stake: '',
    bookmaker: '',
    notes: '',
  }
}

/** A blank "Novo jogo", dated today (local). */
export function emptyNewGame(now = new Date()): NewGameForm {
  const pad = (n: number) => String(n).padStart(2, '0')
  return {
    date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    time: '',
    league: '',
    home: '',
    away: '',
  }
}

/** The pick fields of a prediction as stored. */
export type PickInput = Record<'market' | 'bet_type' | 'period' | 'selection' | 'line', unknown>

/** The pick as stored (see `toStoredPick`), the line only for types that have one. */
export function pickInput(draft: PickDraft): PickInput {
  const kind = lineKind(draft.betType)
  const typed = kind ? parseDecimal(draft.line) : null
  // `toStoredPick` reads a total's side from the sign: under is negative.
  const line =
    kind === 'total' && typed != null
      ? Math.abs(typed) * (draft.overUnder === 'under' ? -1 : 1)
      : typed
  return {
    market: draft.market,
    bet_type: draft.betType,
    period: draft.period,
    ...toStoredPick(draft.betType, draft.pick.trim(), line),
  }
}

/**
 * A stored pick as the form shows it (reverse of `pickInput`): a total's side in `overUnder` and
 * its size in Linha, a handicap's line signed, numbers in the active language (`1,5`).
 */
export function pickDraftFrom(
  stored: {
    market: string
    bet_type: string
    period: string
    selection: string
    line: number | null
  },
  locale: string = DEFAULT_LOCALE,
): PickDraft {
  const betType = stored.bet_type as BetType
  const { pick, line } = fromStoredPick(betType, stored)
  const typed = numberFormat(locale, { maximumFractionDigits: 2, useGrouping: false })
  const total = lineKind(betType) === 'total'
  return {
    market: stored.market as Market,
    betType,
    period: stored.period as MatchPeriod,
    pick,
    line: line == null ? '' : typed.format(total ? Math.abs(line) : line),
    overUnder: total && line != null && line < 0 ? 'under' : 'over',
  }
}

/**
 * Input for `predictionFormSchema`: the pick as stored (`pickInput`); stake and bookmaker only
 * count for a punter bet.
 */
export function predictionInput(draft: PredictionDraft): Record<keyof PredictionForm, unknown> {
  return {
    ...pickInput(draft),
    odd: parseDecimal(draft.odd) ?? undefined,
    confidence: draft.confidence ?? undefined,
    is_live: draft.isLive,
    is_punter: draft.isPunter,
    stake_units: draft.isPunter ? parseDecimal(draft.stake) : null,
    bookmaker: draft.isPunter ? draft.bookmaker.trim() || null : null,
    closing_odd: null,
    notes: draft.notes.trim() || null,
  }
}
