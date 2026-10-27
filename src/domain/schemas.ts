import { z } from 'zod'
import { CONFIDENCE_LEVELS, type ConfidenceAnchors } from './confidence'
import { sameName, tidyName } from './names'

const id = z.uuid('Identificador inválido')
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
  starting_bankroll_units: z
    .number()
    .positive('A banca inicial tem de ser maior que 0')
    .max(NUMERIC_10_2_MAX, 'Valor demasiado alto')
    .nullable(),
})

export type UserSettingsUpdate = z.input<typeof userSettingsUpdateSchema>
