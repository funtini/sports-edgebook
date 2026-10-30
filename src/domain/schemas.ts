import { z } from 'zod'

// Issue messages are vue-i18n keys (`src/locales/`); the UI translates them when shown.
import { CONFIDENCE_LEVELS, type ConfidenceAnchors } from './confidence'
import {
  BET_TYPES,
  BET_TYPES_BY_MARKET,
  isHalfStep,
  isValidSelection,
  lineKind,
  MARKETS,
  MATCH_PERIODS,
} from './markets'
import { MONEY_DISPLAYS } from './money'
import { sameName, tidyName } from './names'

export const idSchema = z.uuid('validation.idInvalid')
const id = idSchema
const optionalText = z.string().trim().min(1, 'validation.textEmpty').nullish()

/** Odds are decimal and must pay more than the stake back. */
const odd = z.number('validation.oddInvalid').gt(1, 'validation.oddAboveOne')

/** What the user fills in for a prediction; the game id comes from elsewhere. */
const predictionFields = z.object({
  market: z.enum(MARKETS, 'validation.marketRequired'),
  bet_type: z.enum(BET_TYPES, 'validation.typeRequired'),
  period: z.enum(MATCH_PERIODS, 'validation.periodRequired'),
  /** Selection code from the catalogue, or free text for type `other`. */
  selection: z.string().trim(),
  /** Unsigned for totals (the selection says over / under), signed for handicaps. */
  line: z.number('validation.lineInvalid').nullish(),
  odd,
  confidence: z
    .number('validation.confidenceRequired')
    .int('validation.confidenceRange')
    .min(1, 'validation.confidenceRange')
    .max(5, 'validation.confidenceRange'),
  is_punter: z.boolean().default(false),
  stake_units: z.number('validation.stakeInvalid').positive('validation.stakePositive').nullish(),
  bookmaker: optionalText,
  closing_odd: odd.nullish(),
  notes: optionalText,
})

type PredictionFields = z.output<typeof predictionFields>

/** The catalogue's rules: a type of the market, a selection of the type, a line where it has one. */
function checkPick(p: PredictionFields, ctx: z.RefinementCtx) {
  const issue = (message: string, path: keyof PredictionFields) =>
    ctx.addIssue({ code: 'custom', message, path: [path] })
  if (!BET_TYPES_BY_MARKET[p.market].includes(p.bet_type))
    issue('validation.typeRequired', 'bet_type')
  const kind = lineKind(p.bet_type)
  if (kind && p.line == null) issue('validation.lineRequired', 'line')
  else if (kind && (!isHalfStep(p.line!) || (kind === 'total' && p.line! <= 0))) {
    issue('validation.lineStep', 'line')
  }
  // A total's side is the line's sign, so a missing line already says what is wrong.
  const sideFromLine = p.bet_type === 'total' && p.line == null
  if (!sideFromLine && !isValidSelection(p.bet_type, p.selection)) {
    issue('validation.selectionRequired', 'selection')
  }
}

/** Runs `checkPick` once the pick's own fields are valid, whatever else is still missing. */
const PICK_FIELDS: PropertyKey[] = ['market', 'bet_type', 'period', 'selection', 'line']
const pickFieldsValid = {
  when: (payload: { issues: readonly { path?: PropertyKey[] }[] }) =>
    !payload.issues.some((issue) => PICK_FIELDS.includes(issue.path?.[0] ?? '')),
}

const punterHasStake = (p: { is_punter: boolean; stake_units?: number | null }) =>
  !p.is_punter || p.stake_units != null
const punterStakeIssue = {
  message: 'validation.punterStakeRequired',
  path: ['stake_units'],
}

/** The logging form's prediction fields, validated before the game exists. */
export const predictionFormSchema = predictionFields
  .superRefine(checkPick, pickFieldsValid)
  .refine(punterHasStake, punterStakeIssue)

export type PredictionForm = z.input<typeof predictionFormSchema>

export const predictionCreateSchema = predictionFields
  .extend({ event_id: id })
  .superRefine(checkPick, pickFieldsValid)
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
