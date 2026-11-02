// Runs in Deno (the Edge Function) and in Vitest: no Deno or npm: imports here, see index.ts.
import {
  base64Bytes,
  DAILY_SLIP_READ_LIMIT,
  MAX_SLIP_IMAGE_BYTES,
  parseSlipRead,
  slipReadRequestSchema,
  DEFAULT_SLIP_MODEL,
  SLIP_MODELS,
  type SlipModel,
  type SlipReadError,
} from '../../../src/domain/slipRead.ts'

/** What the model is given for one read. */
export interface SlipImage {
  /** Base64 JPEG. */
  image: string
  mediaType: 'image/jpeg'
  /** YYYY-MM-DD in `timeZone`. */
  today: string
  timeZone: string
  model: SlipModel
}

/** The model's answer and what it cost. */
export interface ModelAnswer {
  /** The JSON text; null when it gave none (refused or cut off). */
  text: string | null
  inputTokens: number
  outputTokens: number
}

/** Outside effects, injected so the handler can be tested without Supabase or the Claude API. */
export interface ReadSlipDeps {
  /** Reads this user started at or after `since`. */
  countReadsSince(since: Date): Promise<number>
  /** The model chosen in Definições (`user_settings.slip_model`); null when there is no row. */
  settingsModel(): Promise<string | null>
  /** Counts one read for this user, before the model is called; returns the read's id. */
  recordRead(model: SlipModel): Promise<number>
  /** Stores the tokens a read used, so its cost can be checked later. */
  recordUsage(readId: number, answer: ModelAnswer): Promise<void>
  /** Calls the model. Throws on API errors. */
  readImage(input: SlipImage): Promise<ModelAnswer>
  now(): Date
}

/** Base64 is 4/3 the size of its data; this leaves room for the rest of the JSON body. */
const MAX_BODY_BYTES = Math.ceil((MAX_SLIP_IMAGE_BYTES * 4) / 3) + 64 * 1024

function fail(error: SlipReadError, status: number): Response {
  // Only the code is logged: never the image or what was read from it.
  console.error(`read-slip: ${error}`)
  return Response.json({ error }, { status })
}

/** Midnight UTC of `now`'s day: the daily limit resets then. */
export function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
}

/** `timeZone` if the runtime knows it, otherwise UTC. */
export function knownTimeZone(timeZone: string | undefined): string {
  if (!timeZone) return 'UTC'
  try {
    new Intl.DateTimeFormat('en', { timeZone })
    return timeZone
  } catch {
    return 'UTC'
  }
}

/** The stored choice if it is one of `SLIP_MODELS`, otherwise the default. */
export function knownSlipModel(value: string | null): SlipModel {
  return (SLIP_MODELS as readonly string[]).includes(value ?? '')
    ? (value as SlipModel)
    : DEFAULT_SLIP_MODEL
}

/** YYYY-MM-DD of `now` in `timeZone`. */
export function dayIn(now: Date, timeZone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
}

/**
 * One slip read for an authenticated user: checks the body and the limits, calls the model and
 * answers with a validated `SlipRead`, or `{ error }` with a `SlipReadError` code.
 */
export async function handleReadSlip(req: Request, deps: ReadSlipDeps): Promise<Response> {
  if (req.method !== 'POST') return fail('invalid_request', 405)
  if (Number(req.headers.get('content-length') ?? 0) > MAX_BODY_BYTES) {
    return fail('image_too_large', 413)
  }

  let body: unknown
  try {
    body = await req.json()
  } catch {
    return fail('invalid_request', 400)
  }
  const request = slipReadRequestSchema.safeParse(body)
  if (!request.success) return fail('invalid_request', 400)
  const { image, mediaType } = request.data
  if (base64Bytes(image) > MAX_SLIP_IMAGE_BYTES) return fail('image_too_large', 413)

  const now = deps.now()
  let model: SlipModel
  let readId: number
  try {
    if ((await deps.countReadsSince(startOfUtcDay(now))) >= DAILY_SLIP_READ_LIMIT) {
      return fail('daily_limit', 429)
    }
    model = request.data.model ?? knownSlipModel(await deps.settingsModel())
    readId = await deps.recordRead(model)
  } catch {
    return fail('unavailable', 503)
  }

  const timeZone = knownTimeZone(request.data.timeZone)
  let answer: ModelAnswer
  try {
    answer = await deps.readImage({
      image,
      mediaType,
      today: dayIn(now, timeZone),
      timeZone,
      model,
    })
  } catch {
    return fail('unavailable', 503)
  }
  // The read already succeeded or failed on its own; a missed usage row must not change that.
  await deps.recordUsage(readId, answer).catch(() => console.error('read-slip: usage_not_recorded'))

  const slip = answer.text == null ? null : parseSlipRead(answer.text)
  if (!slip) return fail('read_failed', 502)
  return Response.json(slip)
}
