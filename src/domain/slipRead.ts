import { z } from 'zod'

// Imported with its extension: the `read-slip` Edge Function (Deno) loads this file too.
import {
  BET_TYPES,
  BET_TYPES_BY_MARKET,
  isHalfStep,
  isValidSelection,
  lineKind,
  MARKETS,
  MATCH_PERIODS,
} from './markets.ts'

/**
 * What the `read-slip` Edge Function returns for one bet slip image (docs/specs/slip-import.md).
 * The same schema checks the model's output in the function and the response in the browser.
 */

/** Images over this size (decoded bytes) are rejected before any read. */
export const MAX_SLIP_IMAGE_BYTES = 5 * 1024 * 1024

/** Reads allowed per user per UTC day, to cap the API cost. */
export const DAILY_SLIP_READ_LIMIT = 30

/** Error codes the function answers with, in `{ error }`; the UI maps them to messages. */
export const SLIP_READ_ERRORS = [
  'invalid_request',
  'image_too_large',
  'daily_limit',
  'read_failed',
  'unavailable',
] as const
export type SlipReadError = (typeof SLIP_READ_ERRORS)[number]

export const SLIP_STATUSES = ['pending', 'won', 'lost', 'void'] as const
export type SlipStatus = (typeof SLIP_STATUSES)[number]

/** Fields of a leg the reading can be unsure about (everything but its own text). */
export const SLIP_LEG_FIELDS = [
  'homeTeam',
  'awayTeam',
  'league',
  'kickoffAt',
  'timing',
  'market',
  'betType',
  'period',
  'selection',
  'line',
  'odd',
  'status',
] as const
export type SlipLegField = (typeof SLIP_LEG_FIELDS)[number]

const status = z.enum(SLIP_STATUSES).nullable()

export const slipLegSchema = z.object({
  /** The slip's own words for the leg, shown as "Na casa:". */
  rawText: z.string(),
  homeTeam: z.string(),
  awayTeam: z.string(),
  league: z.string().nullable(),
  /** ISO 8601 with offset; null when the slip shows no date. */
  kickoffAt: z.string().nullable(),
  timing: z.enum(['pre', 'live']).nullable(),
  market: z.enum(MARKETS).nullable(),
  betType: z.enum(BET_TYPES).nullable(),
  period: z.enum(MATCH_PERIODS).nullable(),
  /** Catalogue selection code as stored (`home`, `over`, `home_under`…), free text for `other`. */
  selection: z.string().nullable(),
  /** Unsigned for totals (the selection says over / under), signed for handicaps. */
  line: z.number().nullable(),
  odd: z.number().nullable(),
  status,
  /** Fields the model is not sure about. */
  unsure: z.array(z.enum(SLIP_LEG_FIELDS)),
})
export type SlipLeg = z.infer<typeof slipLegSchema>

/** The shape alone: what the model is asked to produce (structured output). */
export const slipReadShape = z.object({
  kind: z.enum(['single', 'multiple']),
  bookmaker: z.string().nullable(),
  /** In currency, as printed on the slip. */
  stake: z.number().nullable(),
  totalOdd: z.number().nullable(),
  status,
  legs: z.array(slipLegSchema),
})

/** The shape plus the rules a read must follow: one leg on a single, two or more on a multiple. */
export const slipReadSchema = slipReadShape.superRefine((slip, ctx) => {
  const legs = slip.legs.length
  if (slip.kind === 'single' ? legs !== 1 : legs < 2) {
    ctx.addIssue({ code: 'custom', message: 'legsForKind', path: ['legs'] })
  }
})
export type SlipRead = z.infer<typeof slipReadSchema>

/** Body the browser sends: the image, already shrunk and re-encoded as JPEG. */
export const slipReadRequestSchema = z.object({
  /** Base64, without a `data:` prefix. */
  image: z.string().min(1),
  mediaType: z.literal('image/jpeg'),
  /** The browser's IANA time zone, so dates without a year or offset are read in it. */
  timeZone: z.string().min(1).optional(),
})
export type SlipReadRequest = z.infer<typeof slipReadRequestSchema>

/** Size in bytes of the data a base64 string holds. */
export function base64Bytes(base64: string): number {
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0
  return Math.floor((base64.length * 3) / 4) - padding
}

/**
 * JSON Schema of `slipReadShape` for the model's structured output. Every object is closed
 * (`additionalProperties: false`), as structured outputs require.
 */
export function slipReadJsonSchema(): Record<string, unknown> {
  const { $schema: _ignored, ...schema } = z.toJSONSchema(slipReadShape, { io: 'output' })
  return schema
}

/**
 * Marks as unsure the fields that break the catalogue's rules, so the confirmation window asks
 * about them instead of trusting them: a type the market does not have, a selection the type does
 * not allow, a missing or off-step line, and a kickoff that is not a date.
 */
export function flagCatalogueIssues(leg: SlipLeg): SlipLeg {
  const unsure = new Set(leg.unsure)
  if (leg.market && leg.betType && !BET_TYPES_BY_MARKET[leg.market].includes(leg.betType)) {
    unsure.add('betType')
  }
  if (leg.betType && leg.selection != null && !isValidSelection(leg.betType, leg.selection)) {
    unsure.add('selection')
  }
  const kind = leg.betType && lineKind(leg.betType)
  if (kind) {
    const offStep =
      leg.line != null && (!isHalfStep(leg.line) || (kind === 'total' && leg.line <= 0))
    if (leg.line == null || offStep) unsure.add('line')
  } else if (leg.betType && leg.line != null) {
    unsure.add('line')
  }
  if (leg.odd != null && leg.odd <= 1) unsure.add('odd')
  if (leg.kickoffAt == null || Number.isNaN(Date.parse(leg.kickoffAt))) unsure.add('kickoffAt')
  return { ...leg, unsure: SLIP_LEG_FIELDS.filter((field) => unsure.has(field)) }
}

/**
 * The read from the model's text output: JSON (a ```json fence around it is tolerated), checked
 * against `slipReadSchema`, with catalogue issues flagged as unsure. Null when it is not valid:
 * a failed read is never returned in part.
 */
export function parseSlipRead(text: string): SlipRead | null {
  const json = text
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/, '')
  let data: unknown
  try {
    data = JSON.parse(json)
  } catch {
    return null
  }
  const result = slipReadSchema.safeParse(data)
  if (!result.success) return null
  return { ...result.data, legs: result.data.legs.map(flagCatalogueIssues) }
}
