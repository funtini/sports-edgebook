// Runs in Deno (the Edge Function) and in Vitest: no Deno or npm: imports here, see index.ts.
import {
  base64Bytes,
  DAILY_SLIP_READ_LIMIT,
  MAX_SLIP_IMAGE_BYTES,
  parseSlipRead,
  slipReadRequestSchema,
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
}

/** Outside effects, injected so the handler can be tested without Supabase or the Claude API. */
export interface ReadSlipDeps {
  /** Reads this user started at or after `since`. */
  countReadsSince(since: Date): Promise<number>
  /** Counts one read for this user, before the model is called. */
  recordRead(): Promise<void>
  /** The model's text answer; null when it gave none (refused or cut off). Throws on API errors. */
  readImage(input: SlipImage): Promise<string | null>
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
  try {
    if ((await deps.countReadsSince(startOfUtcDay(now))) >= DAILY_SLIP_READ_LIMIT) {
      return fail('daily_limit', 429)
    }
    await deps.recordRead()
  } catch {
    return fail('unavailable', 503)
  }

  const timeZone = knownTimeZone(request.data.timeZone)
  let text: string | null
  try {
    text = await deps.readImage({ image, mediaType, today: dayIn(now, timeZone), timeZone })
  } catch {
    return fail('unavailable', 503)
  }

  const slip = text == null ? null : parseSlipRead(text)
  if (!slip) return fail('read_failed', 502)
  return Response.json(slip)
}
