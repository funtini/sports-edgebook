<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import { useToast } from 'primevue/usetoast'
import AppIcon from './AppIcon.vue'
import ConfidencePicker from './ConfidencePicker.vue'
import NotesField from './NotesField.vue'
import PunterFields from './PunterFields.vue'
import SegmentedControl from './SegmentedControl.vue'
import ValueIndex from './ValueIndex.vue'
import { useLocale } from '@/composables/useLocale'
import { parseDecimal } from '@/domain/decimal'
import { formatPercent } from '@/domain/intl'
import { formatDecimal } from '@/domain/money'
import { editDraftFrom, editedProbability, predictionEditInput } from '@/domain/predictionEdit'
import { predictionUpdateSchema, type PredictionUpdate } from '@/domain/schemas'
import { fairOdd } from '@/domain/value'
import { userMessage } from '@/lib/errors'
import { usePredictionsStore } from '@/stores/predictions'
import { useSettingsStore } from '@/stores/settings'
import type { PredictionWithRelations } from '@/types/db'

/**
 * "Editar prognóstico" (docs/specs/ui.md#edit-a-prediction): odd, confidence, Pré-jogo / Live,
 * punter, stake, bookmaker and notes of a logged prediction. A sheet on phone, a modal from 640px.
 * Nothing is written before "Guardar alterações".
 */
const props = defineProps<{ prediction: PredictionWithRelations }>()

const emit = defineEmits<{ close: []; saved: [prediction: PredictionWithRelations] }>()

const predictions = usePredictionsStore()
const settings = useSettingsStore()
const toast = useToast()
const { t, intlLocale, message, betParts } = useLocale()

const draft = reactive(editDraftFrom(props.prediction, intlLocale.value))
const showNotes = ref(!!props.prediction.notes)
const bookmakers = ref<string[]>([])
const saving = ref(false)
const error = ref<string | null>(null)
const errors = ref<Partial<Record<keyof PredictionUpdate, string>>>({})

const event = computed(() => props.prediction.event)
const summary = computed(() => betParts(props.prediction).join(' - '))

const timingOptions = computed(() => [
  { value: 'prematch' as const, label: t('timing.prematch') },
  { value: 'live' as const, label: t('timing.live') },
])
const timing = computed({
  get: () => (draft.isLive ? 'live' : 'prematch'),
  set: (value: 'prematch' | 'live') => (draft.isLive = value === 'live'),
})

const parsedOdd = computed(() => parseDecimal(draft.odd))
/** The stored probability while the level is unchanged; the current anchor for a new level. */
const probability = computed(() =>
  draft.confidence == null
    ? null
    : editedProbability(props.prediction, draft.confidence, settings.confidenceAnchors),
)
const probabilityLabel = computed(() => {
  if (probability.value == null) return null
  return t('logging.probabilityFair', {
    probability: formatPercent(probability.value, intlLocale.value),
    fairOdd: formatDecimal(fairOdd(probability.value), intlLocale.value),
  })
})

async function save() {
  error.value = null
  const result = predictionUpdateSchema.safeParse(predictionEditInput(draft))
  const found: typeof errors.value = {}
  for (const issue of result.error?.issues ?? []) {
    found[String(issue.path[0]) as keyof PredictionUpdate] ??= issue.message
  }
  errors.value = found
  if (!result.success) return

  saving.value = true
  try {
    const updated = await predictions.update(props.prediction, result.data)
    toast.add({ severity: 'success', summary: t('predictionEdit.saved'), life: 2500 })
    emit('saved', updated)
  } catch (e) {
    error.value = userMessage(e, 'predictionEdit.saveFailed')
  } finally {
    saving.value = false
  }
}

function close() {
  if (!saving.value) emit('close')
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') close()
}

const panel = ref<HTMLElement | null>(null)
onMounted(async () => {
  document.addEventListener('keydown', onKeydown)
  panel.value?.focus()
  // Bookmakers only feed the autocomplete, so a failure is ignored.
  try {
    bookmakers.value = await predictions.listBookmakers()
  } catch (e) {
    console.error(e)
  }
})
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown))
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex items-end bg-black/50 sm:items-center sm:justify-center sm:p-6"
    data-prediction-edit
    @click.self="close"
  >
    <div
      ref="panel"
      class="flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-2xl bg-eb-bg outline-none sm:max-h-[min(860px,100%)] sm:max-w-[560px] sm:rounded-2xl sm:border sm:border-eb-border sm:shadow-xl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="prediction-edit-title"
      tabindex="-1"
    >
      <header
        class="flex items-start justify-between gap-3 border-b border-eb-border bg-eb-surface px-4 py-3"
      >
        <div class="min-w-0">
          <h2 id="prediction-edit-title" class="m-0 text-lg font-bold">
            {{ t('predictionEdit.title') }}
          </h2>
          <p class="m-0 text-[13px] text-eb-muted" data-event>
            {{ event.home_team.name }} – {{ event.away_team.name }}
          </p>
          <p class="m-0 text-[15px] font-semibold break-words" data-summary>{{ summary }}</p>
        </div>
        <button
          type="button"
          class="flex size-11 shrink-0 items-center justify-center rounded-xl text-eb-muted hover:bg-eb-surface-2"
          :aria-label="t('predictionEdit.close')"
          :disabled="saving"
          @click="close"
        >
          <AppIcon name="x" class="size-5" />
        </button>
      </header>

      <form
        id="prediction-edit-form"
        class="flex min-h-0 flex-1 flex-col gap-[18px] overflow-y-auto p-4"
        novalidate
        @submit.prevent="save"
      >
        <SegmentedControl v-model="timing" :options="timingOptions" :label="t('logging.timing')" />

        <div class="flex flex-col gap-1">
          <label for="edit-odd" class="text-[13px] font-semibold text-eb-muted">{{
            t('logging.odd')
          }}</label>
          <InputText
            id="edit-odd"
            v-model="draft.odd"
            inputmode="decimal"
            autocomplete="off"
            class="min-h-12 w-full text-xl font-bold tabular-nums"
            :invalid="!!errors.odd"
          />
          <small v-if="errors.odd" class="text-eb-neg">{{ message(errors.odd) }}</small>
        </div>

        <fieldset class="m-0 flex min-w-0 flex-col gap-3 border-0 p-0">
          <legend
            class="mb-2 flex w-full justify-between gap-3 p-0 text-[13px] font-semibold text-eb-muted"
          >
            <span>{{ t('logging.confidence') }}</span>
            <span v-if="probabilityLabel" class="tabular-nums">{{ probabilityLabel }}</span>
          </legend>
          <ConfidencePicker v-model="draft.confidence" />
          <small v-if="errors.confidence" class="text-eb-neg">{{
            message(errors.confidence)
          }}</small>
          <ValueIndex :odd="parsedOdd" :probability="probability" />
        </fieldset>

        <PunterFields
          v-model:is-punter="draft.isPunter"
          v-model:stake="draft.stake"
          v-model:bookmaker="draft.bookmaker"
          :bookmakers="bookmakers"
          :stake-error="errors.stake_units"
          :unit-value="settings.unitValue"
          :money-display="settings.moneyDisplay"
        />

        <NotesField v-model:notes="draft.notes" v-model:open="showNotes" />
      </form>

      <footer class="flex flex-col gap-2 border-t border-eb-border bg-eb-surface px-4 py-3">
        <Message v-if="error" severity="error">{{ message(error) }}</Message>
        <div class="flex gap-2">
          <Button
            type="button"
            :label="t('predictionEdit.cancel')"
            severity="secondary"
            outlined
            class="min-h-12 flex-1"
            :disabled="saving"
            @click="close"
          />
          <Button
            type="submit"
            form="prediction-edit-form"
            :label="t('predictionEdit.save')"
            class="min-h-12 flex-[2] !font-bold"
            :loading="saving"
            data-save
          />
        </div>
      </footer>
    </div>
  </div>
</template>
