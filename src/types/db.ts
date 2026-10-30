/**
 * Row types for the tables in `supabase/migrations/`. Hand-written because agents cannot reach
 * Supabase to generate them; keep in sync with every new migration.
 * Postgres `numeric` columns arrive as numbers and `timestamptz` as ISO strings.
 */

import type { BetType, Market, MatchPeriod } from '@/domain/markets'
import type { MoneyDisplay } from '@/domain/money'
import type { BetStatus } from '@/domain/settlement'

export type { BetStatus }

export type Source = 'manual' | 'api_football'

export type GeneratorMode =
  'confidence' | 'value' | 'highest_odds' | 'lowest_odds' | 'random' | 'target_odd'

export interface LeagueRow {
  id: string
  user_id: string
  name: string
  country: string | null
  source: Source
  external_id: string | null
  created_at: string
}

export interface TeamRow {
  id: string
  user_id: string
  name: string
  league_id: string | null
  source: Source
  external_id: string | null
  created_at: string
}

export interface TeamAliasRow {
  id: string
  user_id: string
  team_id: string
  alias: string
}

export interface EventRow {
  id: string
  user_id: string
  kickoff_at: string
  league_id: string | null
  home_team_id: string
  away_team_id: string
  home_score: number | null
  away_score: number | null
  source: Source
  external_id: string | null
  created_at: string
}

/** Legacy free-text markets, replaced by `predictions.market` / `bet_type`; no longer read. */
export interface MarketRow {
  id: string
  user_id: string
  category: string
  name: string
}

export interface PredictionRow {
  id: string
  user_id: string
  event_id: string
  /** Legacy free-text market; null from the market catalogue on. */
  market_id: string | null
  market: Market
  bet_type: BetType
  period: MatchPeriod
  /** Selection code (`home`, `over`, `x2_under`…), or free text for bet type `other`. */
  selection: string
  /** Unsigned for totals (the selection says over / under), signed for handicaps. */
  line: number | null
  odd: number
  confidence: number
  /** Logged with the game already under way. */
  is_live: boolean
  /** Probability of the confidence level when the prediction was logged. */
  probability: number
  is_punter: boolean
  stake_units: number | null
  bookmaker: string | null
  status: BetStatus
  closing_odd: number | null
  reference_odd: number | null // future
  reference_bookmaker: string | null // future
  reference_odd_at: string | null // future
  notes: string | null
  created_at: string
  settled_at: string | null
}

export interface MultipleRow {
  id: string
  user_id: string
  origin: 'manual' | 'generated'
  generator_mode: GeneratorMode | null
  generator_params: Record<string, unknown> | null
  total_odd: number
  stake_units: number | null
  is_placed: boolean
  status: BetStatus
  created_at: string
  settled_at: string | null
}

export interface MultipleLegRow {
  multiple_id: string
  prediction_id: string
  user_id: string
  odd_at_selection: number
}

export interface UserSettingsRow {
  user_id: string
  unit_value: number
  currency: string
  starting_bankroll_units: number | null
  /** Keys are the confidence levels as strings ("1".."5"). */
  confidence_anchors: Record<string, number>
  odds_bands: number[]
  money_display: MoneyDisplay
}

/** Columns the database fills in: `id`, `user_id` (auth.uid()) and `created_at`. */
type Generated = 'id' | 'user_id' | 'created_at'

/** Columns with a database default become optional on insert. */
type Insert<Row, Defaulted extends keyof Row = never> = Omit<Row, Generated | Defaulted> &
  Partial<Pick<Row, Defaulted>>

export type LeagueInsert = Insert<LeagueRow, 'country' | 'source' | 'external_id'>
export type TeamInsert = Insert<TeamRow, 'league_id' | 'source' | 'external_id'>
export type TeamAliasInsert = Insert<TeamAliasRow>
export type EventInsert = Insert<
  EventRow,
  'league_id' | 'home_score' | 'away_score' | 'source' | 'external_id'
>
export type PredictionInsert = Insert<
  PredictionRow,
  | 'market_id'
  | 'line'
  | 'is_live'
  | 'is_punter'
  | 'stake_units'
  | 'bookmaker'
  | 'status'
  | 'closing_odd'
  | 'reference_odd'
  | 'reference_bookmaker'
  | 'reference_odd_at'
  | 'notes'
  | 'settled_at'
>
export type MultipleInsert = Insert<
  MultipleRow,
  'generator_mode' | 'generator_params' | 'stake_units' | 'is_placed' | 'status' | 'settled_at'
>
export type MultipleLegInsert = Insert<MultipleLegRow>
export type UserSettingsInsert = Partial<Omit<UserSettingsRow, 'user_id'>>

/** An event with its teams and league embedded, as the stores return it. */
export interface EventWithTeams extends EventRow {
  home_team: TeamRow
  away_team: TeamRow
  league: LeagueRow | null
}

/** A prediction with its event (and teams) embedded. */
export interface PredictionWithRelations extends PredictionRow {
  event: EventWithTeams
}
