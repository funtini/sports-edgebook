import { defineStore } from 'pinia'
import { multipleOrigin } from '@/domain/multipleDraft'
import { multipleCreateSchema, type MultipleCreate } from '@/domain/schemas'
import { multipleOdd } from '@/domain/settlement'
import type { MultipleInsert, MultipleLegInsert, MultipleRow } from '@/types/db'
import { requireSupabase, unwrap } from './client'

/** `multiples.total_odd` is `numeric(10, 3)`. */
const roundOdd = (odd: number) => Math.round(odd * 1000) / 1000

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

  return { create }
})
