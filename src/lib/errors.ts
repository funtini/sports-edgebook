import { z } from 'zod'

/** An error whose message is written for the user (PT-PT) and can be shown as is. */
export class UserError extends Error {
  override name = 'UserError'
}

/**
 * Message to show for `e`: validation and `UserError` messages as they are; anything else
 * (database, network) is in English or too technical, so it gets `fallback`.
 */
export function userMessage(e: unknown, fallback: string): string {
  if (e instanceof z.ZodError) return e.issues[0]?.message ?? fallback
  if (e instanceof UserError) return e.message
  console.error(e)
  return fallback
}
