import { z } from 'zod'

/** An error whose message is a translation key (`src/locales/`) written for the user. */
export class UserError extends Error {
  override name = 'UserError'
}

/**
 * Translation key of the message to show for `e`: validation and `UserError` messages as they
 * are; anything else (database, network) is too technical, so it gets `fallback` (also a key).
 */
export function userMessage(e: unknown, fallback: string): string {
  if (e instanceof z.ZodError) return e.issues[0]?.message ?? fallback
  if (e instanceof UserError) return e.message
  console.error(e)
  return fallback
}
