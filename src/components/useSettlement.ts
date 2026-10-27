import { ref, type Ref } from 'vue'
import { userMessage } from '@/lib/errors'
import { usePredictionsStore } from '@/stores/predictions'
import type { BetStatus, PredictionWithRelations } from '@/types/db'

/**
 * One-tap settlement for a list of `PredictionRow`s. Optimistic: `rows` shows the new status at
 * once and rolls back if the save fails, with the reason in `error`.
 */
export function useSettlement(rows: Ref<PredictionWithRelations[]>, error: Ref<string | null>) {
  const predictions = usePredictionsStore()
  /** Ids of the predictions being saved. */
  const saving = ref(new Set<string>())

  function replace(updated: PredictionWithRelations) {
    rows.value = rows.value.map((row) => (row.id === updated.id ? updated : row))
  }

  async function settle(prediction: PredictionWithRelations, status: BetStatus) {
    const previous = prediction
    replace({ ...prediction, status })
    saving.value = new Set(saving.value).add(prediction.id)
    error.value = null
    try {
      replace(await predictions.settle(prediction.id, status))
    } catch (e) {
      replace(previous)
      error.value = userMessage(e, 'Não foi possível guardar a liquidação.')
    } finally {
      const next = new Set(saving.value)
      next.delete(prediction.id)
      saving.value = next
    }
  }

  return { saving, settle }
}
