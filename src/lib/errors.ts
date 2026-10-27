/** An error whose message is written for the user (PT-PT) and safe to show as is. */
export class AppError extends Error {
  override name = 'AppError'
}

/**
 * Text to show for a caught error: the first Zod issue, an `AppError`'s message, or `fallback`.
 * Anything else (Supabase, network) is logged and replaced, so English messages never reach the UI.
 */
export function errorMessage(e: unknown, fallback: string): string {
  if (e && typeof e === 'object' && 'issues' in e && Array.isArray(e.issues)) {
    return e.issues[0]?.message ?? fallback
  }
  if (e instanceof AppError) return e.message
  console.error(e)
  return fallback
}
