import { z } from 'zod'
import { CONFIDENCE_LEVELS, type ConfidenceAnchors } from './confidence'

const id = z.uuid('Identificador inválido')
const optionalText = z.string().trim().min(1).nullish()

/** Odds are decimal and must pay more than the stake back. */
const odd = z.number('Odd inválida').gt(1, 'A odd tem de ser maior que 1')

export const predictionCreateSchema = z
  .object({
    event_id: id,
    market_id: id,
    selection: z.string().trim().min(1, 'Indica a seleção'),
    line: z.number().nullish(),
    odd,
    confidence: z
      .number()
      .int()
      .min(1, 'A confiança vai de 1 a 5')
      .max(5, 'A confiança vai de 1 a 5'),
    is_punter: z.boolean().default(false),
    stake_units: z.number().positive('O stake tem de ser maior que 0').nullish(),
    bookmaker: optionalText,
    closing_odd: odd.nullish(),
    notes: optionalText,
  })
  .refine((p) => !p.is_punter || p.stake_units != null, {
    message: 'Indica o stake (unidades) de uma aposta punter',
    path: ['stake_units'],
  })

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
