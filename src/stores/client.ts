import type { SupabaseClient } from '@supabase/supabase-js'
import { tidyName } from '@/domain/names'
import { UserError } from '@/lib/errors'
import { supabase } from '@/lib/supabase'

/** The Supabase client, or a clear error when the app runs without a backend. */
export function requireSupabase(): SupabaseClient {
  if (!supabase) {
    throw new UserError('errors.supabaseNotConfigured')
  }
  return supabase
}

/** Returns the data of a Supabase response, throwing its error if there is one. */
export function unwrap<T>(response: { data: unknown; error: unknown }): T {
  if (response.error) throw response.error
  return response.data as T
}

/** Escapes `%`, `_` and `\` so user input matches literally in `ilike`. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`)
}

/** Trims and collapses whitespace in a name typed by hand; rejects empty names. */
export function cleanName(name: string): string {
  const clean = tidyName(name)
  if (!clean) throw new UserError('errors.emptyName')
  return clean
}

export const EVENT_SELECT =
  '*, home_team:teams!events_home_team_id_fkey(*), away_team:teams!events_away_team_id_fkey(*), league:leagues(*)'

export const PREDICTION_SELECT = `*, event:events!inner(${EVENT_SELECT}), market:markets(*)`
