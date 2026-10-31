import { defineStore } from 'pinia'
import { multipleOrigin } from '@/domain/multipleDraft'
import { statusUpdate } from '@/domain/savedMultiples'
import { multipleCreateSchema, type MultipleCreate } from '@/domain/schemas'
import { multipleOdd } from '@/domain/settlement'
import type {
  MultipleInsert,
  MultipleLegInsert,
  MultipleRow,
  SavedMultiple,
  SavedMultipleLeg,
} from '@/types/db'
import { allPages, EVENT_SELECT, requireSupabase, unwrap } from './client'

/** `multiples.total_odd` is `numeric(10, 3)`. */
const roundOdd = (odd: number) => Math.round(odd * 1000) / 1000

const SAVED_SELECT = `*, legs:multiple_legs(odd_at_selection, origin, prediction:predictions(*, event:events(${EVENT_SELECT})))`

const byKickoff = (a: SavedMultipleLeg, b: SavedMultipleLeg) =>
  Date.parse(a.prediction.event.kickoff_at) - Date.parse(b.prediction.event.kickoff_at)

export const useMultiplesStore = defineStore('multiples', () => {
  /**
   * Saves a multiple and its legs. Origin comes from the legs; the generator's mode and params
   * are kept only when a leg is generated; a simulated multiple has no stake. If the legs fail to
   * save, the multiple is deleted again so no multiple is left without legs.
   */
  async function create(input: MultipleCreate): Promise<MultipleRow> {
    const multiple = multipleCreateSchema.parse(input)
    const origin = multipleOrigin(multiple.legs.map((leg) => leg.origin))
    const generator = origin === 'manual' ? null : (multiple.generator ?? null)
    const row: MultipleInsert = {
      origin,
      generator_mode: generator?.mode ?? null,
      generator_params: generator?.params ?? null,
      total_odd: roundOdd(
        multipleOdd(multiple.legs.map((leg) => ({ odd: leg.odd, status: 'pending' }))),
      ),
      is_placed: multiple.is_placed,
      stake_units: multiple.is_placed ? (multiple.stake_units ?? null) : null,
    }
    const db = requireSupabase()
    const saved = unwrap<MultipleRow>(await db.from('multiples').insert(row).select().single())
    const legs: MultipleLegInsert[] = multiple.legs.map((leg) => ({
      multiple_id: saved.id,
      prediction_id: leg.prediction_id,
      odd_at_selection: leg.odd,
      origin: leg.origin,
    }))
    try {
      unwrap(await db.from('multiple_legs').insert(legs))
    } catch (e) {
      await db.from('multiples').delete().eq('id', saved.id)
      throw e
    }
    return saved
  }

  /**
   * Brings each stored status (and `settled_at`) in line with its legs, in place. A write that
   * fails is left for the next load: the screens read the status from the legs anyway.
   */
  async function syncStatuses(multiples: SavedMultiple[]): Promise<void> {
    const db = requireSupabase()
    await Promise.allSettled(
      multiples.map(async (multiple) => {
        const update = statusUpdate(multiple)
        if (!update) return
        unwrap(await db.from('multiples').update(update).eq('id', multiple.id))
        Object.assign(multiple, update)
      }),
    )
  }

  /** Saved multiples, newest first, legs by kickoff; `placedOnly` for Hoje. */
  async function list(options: { placedOnly?: boolean } = {}): Promise<SavedMultiple[]> {
    const db = requireSupabase()
    const rows = await allPages<SavedMultiple>((from, to) => {
      let query = db.from('multiples').select(SAVED_SELECT)
      if (options.placedOnly) query = query.eq('is_placed', true)
      return query.order('created_at', { ascending: false }).order('id').range(from, to)
    })
    for (const row of rows) row.legs = [...(row.legs ?? [])].sort(byKickoff)
    await syncStatuses(rows)
    return rows
  }

  /** Deletes a simulated multiple (its legs go with it); a placed one is never deleted here. */
  async function removeSimulated(id: string): Promise<void> {
    const db = requireSupabase()
    unwrap(await db.from('multiples').delete().eq('id', id).eq('is_placed', false))
  }

  return { create, list, removeSimulated }
})
