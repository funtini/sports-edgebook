import { ref, type Ref } from 'vue'
import { userMessage } from '@/lib/errors'
import { usePredictionsStore } from '@/stores/predictions'
import type { BetStatus, PredictionWithRelations } from '@/types/db'
import { useLatestRequest } from './useLatestRequest'

/**
 * One-tap settlement for a list of `PredictionRow`s. Optimistic: `rows` shows the new status at
 * once and rolls back if the save fails, with the reason in `error`.
 */
export function useSettlement(rows: Ref<PredictionWithRelations[]>) {
  const predictions = usePredictionsStore()
  /** Ids of the predictions being saved. */
  const saving = ref(new Set<string>())
  const error = ref<string | null>(null)
  const context = useLatestRequest()
  let isCurrent = context.start()

  /** Call when `rows` is reloaded for another day or game: saves still in flight are ignored. */
  function reset() {
    isCurrent = context.start()
    saving.value = new Set()
    error.value = null
  }

  function replace(updated: PredictionWithRelations) {
    rows.value = rows.value.map((row) => (row.id === updated.id ? updated : row))
  }

  async function settle(prediction: PredictionWithRelations, status: BetStatus) {
    const current = isCurrent
    const previous = prediction
    replace({ ...prediction, status })
    saving.value = new Set(saving.value).add(prediction.id)
    error.value = null
    try {
      const updated = await predictions.settle(prediction.id, status)
      if (current()) replace(updated)
    } catch (e) {
      if (!current()) return
      replace(previous)
      error.value = userMessage(e, 'Não foi possível guardar a liquidação.')
    } finally {
      if (current()) {
        const next = new Set(saving.value)
        next.delete(prediction.id)
        saving.value = next
      }
    }
  }

  return { saving, error, settle, reset }
}
