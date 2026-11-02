import { defineStore } from 'pinia'
import { addDays, startOfDay } from '@/domain/days'
import {
  UNDATED_WINDOW,
  type ContextAlias,
  type ContextPrediction,
  type ImportContext,
  type ImportRows,
  type Ref,
} from '@/domain/slipImport'
import {
  flagCatalogueIssues,
  SLIP_READ_ERRORS,
  slipReadSchema,
  type SlipRead,
  type SlipReadError,
  type SlipReadRequest,
} from '@/domain/slipRead'
import { UserError } from '@/lib/errors'
import type { EventWithTeams, LeagueRow, TeamRow } from '@/types/db'
import { allPages, EVENT_SELECT, requireSupabase, unwrap } from './client'
import { useSettingsStore } from './settings'

/** `multiples.total_odd` is `numeric(10, 3)`. */
const roundOdd = (odd: number) => Math.round(odd * 1000) / 1000

const CONTEXT_PREDICTION_SELECT =
  'id, event_id, market, bet_type, period, selection, line, odd, confidence, is_punter'

/** Translation key of a read error. */
export const readErrorKey = (code: SlipReadError) => `slipImport.errors.${code}`

/** The `{ error }` code of a failed call to `read-slip`; `unavailable` when there is none. */
async function readErrorCode(error: unknown): Promise<SlipReadError> {
  const context = (error as { context?: unknown } | null)?.context as
    { json?: () => Promise<unknown> } | undefined
  if (typeof context?.json !== 'function') return 'unavailable'
  try {
    const body = (await context.json()) as { error?: unknown }
    const code = body?.error
    return SLIP_READ_ERRORS.includes(code as SlipReadError)
      ? (code as SlipReadError)
      : 'unavailable'
  } catch {
    return 'unavailable'
  }
}

/** The local days a read's legs fall on, widened to the undated window when a leg has no date. */
export function contextWindow(read: SlipRead, now: Date): { from: Date; to: Date } {
  const days: number[] = []
  for (const leg of read.legs) {
    const time = leg.kickoffAt != null ? Date.parse(leg.kickoffAt) : Number.NaN
    if (Number.isNaN(time)) {
      days.push(addDays(startOfDay(now), -UNDATED_WINDOW.before).getTime())
      days.push(addDays(startOfDay(now), UNDATED_WINDOW.after).getTime())
    } else {
      days.push(startOfDay(new Date(time)).getTime())
    }
  }
  if (days.length === 0) days.push(startOfDay(now).getTime())
  return {
    from: new Date(Math.min(...days)),
    to: addDays(new Date(Math.max(...days)), 1),
  }
}

/** What saving wrote, for the toast. */
export interface ImportSaved {
  /** Predictions logged: the multiple's legs, or the single's one. */
  predictions: number
  multiple: boolean
  /** An existing prediction was made the real bet. */
  upgraded: boolean
}

/** Slip import (docs/specs/slip-import.md): reading the image, the matching context and saving. */
export const useSlipImportStore = defineStore('slipImport', () => {
  /**
   * Reads a slip with the `read-slip` Edge Function. Throws a `UserError` whose key names the
   * function's error code; an answer that fails validation is a failed read.
   */
  async function read(image: string): Promise<SlipRead> {
    let timeZone: string | undefined
    try {
      timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || undefined
    } catch {
      timeZone = undefined
    }
    const body: SlipReadRequest = { image, mediaType: 'image/jpeg', ...(timeZone && { timeZone }) }
    let response: { data: unknown; error: unknown }
    try {
      response = await requireSupabase().functions.invoke('read-slip', { body })
    } catch (e) {
      if (e instanceof UserError) throw e
      throw new UserError(readErrorKey('unavailable'))
    }
    if (response.error) throw new UserError(readErrorKey(await readErrorCode(response.error)))
    const parsed = slipReadSchema.safeParse(response.data)
    if (!parsed.success) throw new UserError(readErrorKey('read_failed'))
    return { ...parsed.data, legs: parsed.data.legs.map(flagCatalogueIssues) }
  }

  async function predictionsOf(eventIds: string[]): Promise<ContextPrediction[]> {
    if (eventIds.length === 0) return []
    return unwrap<ContextPrediction[]>(
      await requireSupabase()
        .from('predictions')
        .select(CONTEXT_PREDICTION_SELECT)
        .in('event_id', eventIds),
    )
  }

  /**
   * The owner's rows matching needs: events on the legs' days (or the undated window), their
   * predictions, every team, league and alias, and the confidence anchors.
   */
  async function loadContext(slip: SlipRead, now = new Date()): Promise<ImportContext> {
    const db = requireSupabase()
    const settings = useSettingsStore()
    const { from, to } = contextWindow(slip, now)
    const [, events, teams, leagues, aliases] = await Promise.all([
      settings.ensureLoaded(),
      allPages<EventWithTeams>((start, end) =>
        db
          .from('events')
          .select(EVENT_SELECT)
          .gte('kickoff_at', from.toISOString())
          .lt('kickoff_at', to.toISOString())
          .order('kickoff_at')
          .range(start, end),
      ),
      allPages<TeamRow>((start, end) => db.from('teams').select('id, name').range(start, end)),
      allPages<LeagueRow>((start, end) => db.from('leagues').select('id, name').range(start, end)),
      allPages<ContextAlias>((start, end) =>
        db.from('team_aliases').select('team_id, alias').range(start, end),
      ),
    ])
    return {
      events,
      teams,
      leagues,
      aliases,
      predictions: await predictionsOf(events.map((event) => event.id)),
      anchors: settings.confidenceAnchors,
      now,
    }
  }

  /** An event picked with Trocar outside the loaded days, with its predictions. */
  async function loadEvent(
    event: EventWithTeams,
  ): Promise<{ event: EventWithTeams; predictions: ContextPrediction[] }> {
    return { event, predictions: await predictionsOf([event.id]) }
  }

  /**
   * Writes an import in the spec's order: leagues and teams, events, aliases, predictions (and the
   * existing ones made the real bet), then the multiple and its legs. If a step fails, the rows
   * written before it are deleted (and updated predictions put back) and the error is thrown.
   */
  async function save(rows: ImportRows): Promise<ImportSaved> {
    const db = requireSupabase()
    const ids = new Map<string, string>()
    const written: { table: string; id: string }[] = []
    const restores: { id: string; values: Record<string, unknown> }[] = []

    const idOf = (ref: Ref | null): string | null => {
      if (ref == null) return null
      if ('id' in ref) return ref.id
      const id = ids.get(ref.key)
      if (!id) throw new Error(`row ${ref.key} was not written`)
      return id
    }
    async function insert(table: string, row: Record<string, unknown>): Promise<string> {
      const { id } = unwrap<{ id: string }>(await db.from(table).insert(row).select('id').single())
      written.push({ table, id })
      return id
    }

    try {
      for (const league of rows.leagues) {
        ids.set(league.key, await insert('leagues', { name: league.name }))
      }
      for (const team of rows.teams) {
        ids.set(team.key, await insert('teams', { name: team.name, league_id: idOf(team.league) }))
      }
      for (const event of rows.events) {
        ids.set(
          event.key,
          await insert('events', {
            kickoff_at: event.kickoffAt,
            league_id: idOf(event.league),
            home_team_id: idOf(event.home),
            away_team_id: idOf(event.away),
          }),
        )
      }
      for (const alias of rows.aliases) {
        // An alias already saved (for any team) is left as it is: aliases are unique per owner.
        const saved = unwrap<{ id: string }[]>(
          await db
            .from('team_aliases')
            .upsert(alias, { onConflict: 'user_id,alias', ignoreDuplicates: true })
            .select('id'),
        )
        for (const { id } of saved ?? []) written.push({ table: 'team_aliases', id })
      }
      for (const prediction of rows.predictions) {
        ids.set(
          prediction.key,
          await insert('predictions', {
            event_id: idOf(prediction.event),
            market: prediction.market,
            bet_type: prediction.betType,
            period: prediction.period,
            selection: prediction.selection,
            line: prediction.line,
            odd: prediction.odd,
            confidence: prediction.confidence,
            probability: prediction.probability,
            is_live: prediction.isLive,
            is_punter: prediction.isPunter,
            stake_units: prediction.stakeUnits,
            bookmaker: prediction.bookmaker,
            status: prediction.status,
            settled_at: prediction.settledAt,
            notes: prediction.notes,
          }),
        )
      }
      for (const upgrade of rows.upgrades) {
        const before = unwrap<Record<string, unknown>>(
          await db
            .from('predictions')
            .select('is_punter, stake_units, bookmaker, odd')
            .eq('id', upgrade.id)
            .single(),
        )
        unwrap(
          await db
            .from('predictions')
            .update({
              is_punter: true,
              stake_units: upgrade.stakeUnits,
              bookmaker: upgrade.bookmaker,
              ...(upgrade.odd != null && { odd: upgrade.odd }),
            })
            .eq('id', upgrade.id),
        )
        restores.push({ id: upgrade.id, values: before })
      }
      if (rows.multiple) {
        const multiple = rows.multiple
        const multipleId = await insert('multiples', {
          origin: multiple.origin,
          generator_mode: null,
          generator_params: null,
          total_odd: roundOdd(multiple.totalOdd),
          stake_units: multiple.stakeUnits,
          is_placed: multiple.isPlaced,
          status: multiple.status,
          settled_at: multiple.settledAt,
          bookmaker: multiple.bookmaker,
        })
        unwrap(
          await db.from('multiple_legs').insert(
            multiple.legs.map((leg) => ({
              multiple_id: multipleId,
              prediction_id: idOf(leg.prediction),
              odd_at_selection: leg.oddAtSelection,
              origin: leg.origin,
            })),
          ),
        )
      }
    } catch (e) {
      // Newest first, so nothing is deleted while a row still refers to it; legs go with their
      // multiple. A failed undo is logged and the rest carries on.
      for (const { table, id } of [...written].reverse()) {
        try {
          unwrap(await db.from(table).delete().eq('id', id))
        } catch (undo) {
          console.error(undo)
        }
      }
      for (const { id, values } of restores) {
        try {
          unwrap(await db.from('predictions').update(values).eq('id', id))
        } catch (undo) {
          console.error(undo)
        }
      }
      throw e
    }
    return {
      predictions: rows.multiple
        ? rows.multiple.legs.length
        : rows.predictions.length + rows.upgrades.length,
      multiple: rows.multiple != null,
      upgraded: rows.upgrades.length > 0,
    }
  }

  return { read, loadContext, loadEvent, save }
})
