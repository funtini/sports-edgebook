import type { ConfidenceLevel } from './confidence'
import { parseDecimal } from './decimal'
import type { MarketForm, NewGameForm, PredictionForm } from './schemas'

/** The logging form's prediction fields as typed, before validation. */
export interface PredictionDraft {
  category: string
  marketName: string
  selection: string
  /** Typed with comma or dot; parsed on save. */
  line: string
  odd: string
  confidence: ConfidenceLevel | null
  isPunter: boolean
  stake: string
  bookmaker: string
  notes: string
}

export function emptyPredictionDraft(): PredictionDraft {
  return {
    category: '',
    marketName: '',
    selection: '',
    line: '',
    odd: '',
    confidence: null,
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

export function marketInput(draft: PredictionDraft): MarketForm {
  return { category: draft.category, name: draft.marketName }
}

/** Input for `predictionFormSchema`; stake and bookmaker only count for a punter bet. */
export function predictionInput(draft: PredictionDraft): Record<keyof PredictionForm, unknown> {
  return {
    selection: draft.selection,
    line: parseDecimal(draft.line),
    odd: parseDecimal(draft.odd) ?? undefined,
    confidence: draft.confidence ?? undefined,
    is_punter: draft.isPunter,
    stake_units: draft.isPunter ? parseDecimal(draft.stake) : null,
    bookmaker: draft.isPunter ? draft.bookmaker.trim() || null : null,
    closing_odd: null,
    notes: draft.notes.trim() || null,
  }
}
