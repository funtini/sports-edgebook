import { z } from 'zod'

// Issue messages are vue-i18n keys (`src/locales/`); the UI translates them when shown.
import { CONFIDENCE_LEVELS, type ConfidenceAnchors } from './confidence'
import { MONEY_DISPLAYS } from './money'
import { sameName, tidyName } from './names'

export const idSchema = z.uuid('validation.idInvalid')
const id = idSchema
const optionalText = z.string().trim().min(1).nullish()

/** Odds are decimal and must pay more than the stake back. */
const odd = z.number('validation.oddInvalid').gt(1, 'validation.oddAboveOne')

/** What the user fills in for a prediction; the game and market ids come from elsewhere. */
const predictionFields = z.object({
  selection: z.string().trim().min(1, 'validation.selectionRequired'),
  line: z.number('validation.lineInvalid').nullish(),
  odd,
  confidence: z
    .number('validation.confidenceRequired')
    .int()
    .min(1, 'validation.confidenceRange')
    .max(5, 'validation.confidenceRange'),
  is_punter: z.boolean().default(false),
  stake_units: z.number('validation.stakeInvalid').positive('validation.stakePositive').nullish(),
  bookmaker: optionalText,
  closing_odd: odd.nullish(),
  notes: optionalText,
})

const punterHasStake = (p: { is_punter: boolean; stake_units?: number | null }) =>
  !p.is_punter || p.stake_units != null
const punterStakeIssue = {
  message: 'validation.punterStakeRequired',
  path: ['stake_units'],
}

/** The logging form's prediction fields, validated before the game and market exist. */
export const predictionFormSchema = predictionFields.refine(punterHasStake, punterStakeIssue)

export type PredictionForm = z.input<typeof predictionFormSchema>

export const predictionCreateSchema = predictionFields
  .extend({ event_id: id, market_id: id })
  .refine(punterHasStake, punterStakeIssue)

export type PredictionCreate = z.input<typeof predictionCreateSchema>
export type PredictionCreateParsed = z.output<typeof predictionCreateSchema>

export const eventCreateSchema = z
  .object({
    kickoff_at: z.iso.datetime({ offset: true, message: 'validation.kickoffInvalid' }),
    league_id: id.nullish(),
    home_team_id: id,
    away_team_id: id,
  })
  .refine((e) => e.home_team_id !== e.away_team_id, {
    message: 'validation.teamsDifferent',
    path: ['away_team_id'],
  })

export type EventCreate = z.input<typeof eventCreateSchema>

/** A name typed by hand: tidied, and required. */
const typedName = (message: string) =>
  z.string().transform(tidyName).pipe(z.string().min(1, message))

/** Market typed in the logging form; created on save if new. */
export const marketFormSchema = z.object({
  category: typedName('validation.marketRequired'),
  name: typedName('validation.typeRequired'),
})

export type MarketForm = z.input<typeof marketFormSchema>

/** Cross-field checks run only once each field is valid on its own. */
const fieldsValid = (payload: { issues: readonly unknown[] }) => payload.issues.length === 0

/** "Novo jogo" in the logging form, before its league and teams exist. */
export const newGameFormSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'validation.gameDateRequired'),
    time: z.string().regex(/^\d{2}:\d{2}$/, 'validation.gameTimeRequired'),
    league: z.string().transform((name) => tidyName(name) || null),
    home: typedName('validation.homeRequired'),
    away: typedName('validation.awayRequired'),
  })
  .refine((g) => !Number.isNaN(Date.parse(`${g.date}T${g.time}`)), {
    message: 'validation.kickoffInvalid',
    path: ['date'],
    when: fieldsValid,
  })
  .refine((g) => !sameName(g.home, g.away), {
    message: 'validation.teamsDifferent',
    path: ['away'],
    when: fieldsValid,
  })
  // Date and time are the user's local time; stored as UTC.
  .transform(({ date, time, ...game }) => ({
    ...game,
    kickoff_at: new Date(`${date}T${time}`).toISOString(),
  }))

export type NewGameForm = z.input<typeof newGameFormSchema>

/** `user_settings.confidence_anchors` (jsonb with keys "1".."5") parsed into typed anchors. */
export const confidenceAnchorsSchema = z
  .object(
    Object.fromEntries(
      CONFIDENCE_LEVELS.map((level) => [String(level), z.number().gt(0).lt(1)]),
    ) as Record<`${(typeof CONFIDENCE_LEVELS)[number]}`, z.ZodNumber>,
  )
  .transform((raw): ConfidenceAnchors => ({
    1: raw['1'],
    2: raw['2'],
    3: raw['3'],
    4: raw['4'],
    5: raw['5'],
  }))

/** Max value of a `numeric(10, 2)` column. */
const NUMERIC_10_2_MAX = 99_999_999.99

/** Fields editable on the settings screen. */
export const userSettingsUpdateSchema = z.object({
  unit_value: z
    .number('validation.unitValueRequired')
    .positive('validation.unitValuePositive')
    .max(NUMERIC_10_2_MAX, 'validation.valueTooHigh'),
  /** Empty or 0 both mean "no starting bankroll" and are saved as `null`. */
  starting_bankroll_units: z
    .number()
    .min(0, 'validation.bankrollNegative')
    .max(NUMERIC_10_2_MAX, 'validation.valueTooHigh')
    .nullable()
    .transform((units) => (units === 0 ? null : units)),
  /** Left as it is when omitted. */
  money_display: z.enum(MONEY_DISPLAYS).optional(),
})

export type UserSettingsUpdate = z.input<typeof userSettingsUpdateSchema>

/** Goals of one team; `smallint` in the database, capped well below its range. */
const goals = z
  .number('validation.goalsInvalid')
  .int('validation.goalsInvalid')
  .min(0, 'validation.goalsInvalid')
  .max(99, 'validation.goalsInvalid')

/** Final score of an event: both teams' goals, or neither (cleared). */
export const eventScoreSchema = z
  .object({ home_score: goals.nullable(), away_score: goals.nullable() })
  .refine((s) => (s.home_score == null) === (s.away_score == null), {
    message: 'validation.bothGoalsRequired',
    path: ['away_score'],
  })

export type EventScore = z.input<typeof eventScoreSchema>

/** One team's goals as typed on the event screen: empty, or up to two digits. */
const typedGoals = z
  .string()
  .trim()
  .regex(/^\d{0,2}$/, 'validation.goalsInvalid')
  .transform((s) => (s === '' ? null : Number(s)))

/** The event screen's result inputs; empty in both clears the score. */
export const scoreFormSchema = z
  .object({ home: typedGoals, away: typedGoals })
  .transform(({ home, away }) => ({ home_score: home, away_score: away }))
  .pipe(eventScoreSchema)

export type ScoreForm = z.input<typeof scoreFormSchema>

/** An event's stored score as the event screen's inputs: the reverse of `scoreFormSchema`. */
export function toScoreForm(score: EventScore): ScoreForm {
  return { home: score.home_score?.toString() ?? '', away: score.away_score?.toString() ?? '' }
}
