import { z } from 'zod'
import { CONFIDENCE_LEVELS, type ConfidenceAnchors } from './confidence'
import { MONEY_DISPLAYS } from './money'
import { sameName, tidyName } from './names'

export const idSchema = z.uuid('Identificador inválido')
const id = idSchema
const optionalText = z.string().trim().min(1).nullish()

/** Odds are decimal and must pay more than the stake back. */
const odd = z.number('Odd inválida').gt(1, 'A odd tem de ser maior que 1')

/** What the user fills in for a prediction; the game and market ids come from elsewhere. */
const predictionFields = z.object({
  selection: z.string().trim().min(1, 'Indica a seleção'),
  line: z.number('Linha inválida').nullish(),
  odd,
  confidence: z
    .number('Escolhe a confiança')
    .int()
    .min(1, 'A confiança vai de 1 a 5')
    .max(5, 'A confiança vai de 1 a 5'),
  is_punter: z.boolean().default(false),
  stake_units: z.number('Stake inválido').positive('O stake tem de ser maior que 0').nullish(),
  bookmaker: optionalText,
  closing_odd: odd.nullish(),
  notes: optionalText,
})

const punterHasStake = (p: { is_punter: boolean; stake_units?: number | null }) =>
  !p.is_punter || p.stake_units != null
const punterStakeIssue = {
  message: 'Indica o stake (unidades) de uma aposta punter',
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
    kickoff_at: z.iso.datetime({ offset: true, message: 'Data/hora inválida' }),
    league_id: id.nullish(),
    home_team_id: id,
    away_team_id: id,
  })
  .refine((e) => e.home_team_id !== e.away_team_id, {
    message: 'A equipa da casa e a de fora têm de ser diferentes',
    path: ['away_team_id'],
  })

export type EventCreate = z.input<typeof eventCreateSchema>

/** A name typed by hand: tidied, and required. */
const typedName = (message: string) =>
  z.string().transform(tidyName).pipe(z.string().min(1, message))

/** Market typed in the logging form; created on save if new. */
export const marketFormSchema = z.object({
  category: typedName('Indica o mercado'),
  name: typedName('Indica o tipo'),
})

export type MarketForm = z.input<typeof marketFormSchema>

/** Cross-field checks run only once each field is valid on its own. */
const fieldsValid = (payload: { issues: readonly unknown[] }) => payload.issues.length === 0

/** "Novo jogo" in the logging form, before its league and teams exist. */
export const newGameFormSchema = z
  .object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Indica a data do jogo'),
    time: z.string().regex(/^\d{2}:\d{2}$/, 'Indica a hora do jogo'),
    league: z.string().transform((name) => tidyName(name) || null),
    home: typedName('Indica a equipa da casa'),
    away: typedName('Indica a equipa de fora'),
  })
  .refine((g) => !Number.isNaN(Date.parse(`${g.date}T${g.time}`)), {
    message: 'Data/hora inválida',
    path: ['date'],
    when: fieldsValid,
  })
  .refine((g) => !sameName(g.home, g.away), {
    message: 'A equipa da casa e a de fora têm de ser diferentes',
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
    .number('Indica o valor da unidade')
    .positive('O valor da unidade tem de ser maior que 0')
    .max(NUMERIC_10_2_MAX, 'Valor demasiado alto'),
  /** Empty or 0 both mean "no starting bankroll" and are saved as `null`. */
  starting_bankroll_units: z
    .number()
    .min(0, 'A banca inicial não pode ser negativa')
    .max(NUMERIC_10_2_MAX, 'Valor demasiado alto')
    .nullable()
    .transform((units) => (units === 0 ? null : units)),
  /** Left as it is when omitted. */
  money_display: z.enum(MONEY_DISPLAYS).optional(),
})

export type UserSettingsUpdate = z.input<typeof userSettingsUpdateSchema>

/** Goals of one team; `smallint` in the database, capped well below its range. */
const goals = z
  .number('Golos inválidos')
  .int('Golos inválidos')
  .min(0, 'Golos inválidos')
  .max(99, 'Golos inválidos')

/** Final score of an event: both teams' goals, or neither (cleared). */
export const eventScoreSchema = z
  .object({ home_score: goals.nullable(), away_score: goals.nullable() })
  .refine((s) => (s.home_score == null) === (s.away_score == null), {
    message: 'Indica os golos das duas equipas',
    path: ['away_score'],
  })

export type EventScore = z.input<typeof eventScoreSchema>

/** One team's goals as typed on the event screen: empty, or up to two digits. */
const typedGoals = z
  .string()
  .trim()
  .regex(/^\d{0,2}$/, 'Golos inválidos')
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
