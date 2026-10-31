import type { ConfidenceLevel } from './confidence'
import { parseDecimal } from './decimal'
import {
  lineKind,
  toStoredPick,
  type BetType,
  type Market,
  type MatchPeriod,
  type OverUnder,
} from './markets'
import type { NewGameForm, PredictionForm } from './schemas'

/** The logging form's prediction fields as typed, before validation. */
export interface PredictionDraft {
  market: Market
  betType: BetType
  period: MatchPeriod
  /** Side picked from the catalogue, or the selection typed for type `other`. */
  pick: string
  /** Typed with comma or dot; signed for handicaps, a total's size (its side is `overUnder`). */
  line: string
  /** A total's side. */
  overUnder: OverUnder
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

/**
 * Input for `predictionFormSchema`: the pick as stored (see `toStoredPick`), the line only for
 * types that have one; stake and bookmaker only count for a punter bet.
 */
export function predictionInput(draft: PredictionDraft): Record<keyof PredictionForm, unknown> {
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
