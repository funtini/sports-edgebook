<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import AppIcon from './AppIcon.vue'
import ChipGroup from './ChipGroup.vue'
import SegmentedControl from './SegmentedControl.vue'
import SlipLegCard from './SlipLegCard.vue'
import StepperField from './StepperField.vue'
import { useLocale } from '@/composables/useLocale'
import { parseDecimal } from '@/domain/decimal'
import { formatDecimal, formatEuros } from '@/domain/money'
import {
  buildImportPlan,
  type ContextPrediction,
  type ImportContext,
  type LegChoice,
  type SaveAs,
  type SlipChoice,
} from '@/domain/slipImport'
import { SLIP_STATUSES, type SlipLeg, type SlipRead, type SlipStatus } from '@/domain/slipRead'
import { userMessage } from '@/lib/errors'
import { useSlipImportStore, type ImportSaved } from '@/stores/slipImport'
import type { EventWithTeams } from '@/types/db'

/** The import context with the events as the stores return them. */
export type SlipContext = Omit<ImportContext, 'events'> & { events: EventWithTeams[] }

/**
 * "Confirmar aposta" (docs/specs/slip-import.md#confirmation-window): a modal with the image on
 * the left on desktop, a full-screen sheet on phone. Nothing is written before the save button.
 */
const props = defineProps<{
  read: SlipRead
  context: SlipContext
  imageUrl: string
  /** Bookmakers used before, most used first. */
  bookmakers: string[]
  unitValue: number
}>()

const emit = defineEmits<{ cancel: []; saved: [result: ImportSaved] }>()

const store = useSlipImportStore()
const { t, intlLocale, message } = useLocale()

const context = shallowRef<SlipContext>(props.context)
const legs = ref<SlipLeg[]>(props.read.legs.map((leg) => ({ ...leg, unsure: [...leg.unsure] })))
const choices = ref<LegChoice[]>(props.read.legs.map(() => ({ confidence: null })))

const bookmaker = ref(props.read.bookmaker?.trim() ?? '')
const stakeEuros = ref(props.read.stake != null && props.read.stake > 0 ? props.read.stake : 0)
const status = ref<SlipStatus>(props.read.status ?? 'pending')
const totalOddText = ref(
  props.read.totalOdd != null ? formatDecimal(props.read.totalOdd, intlLocale.value) : '',
)

const showImage = ref(false)
const saving = ref(false)
const error = ref<string | null>(null)

const isMultiple = computed(() => props.read.kind === 'multiple')
/** A multiple slip saved as its predictions only: no multiple, not a real bet. */
const saveAs = ref<SaveAs>('multiple')
const predictionsOnly = computed(() => isMultiple.value && saveAs.value === 'predictions')
const saveAsOptions = computed(() =>
  (['multiple', 'predictions'] as const).map((value) => ({
    value,
    label: t(`slipImport.saveAs.${value}`),
  })),
)

/** The read with the owner's edits; a single's leg takes the Boletim card's status. */
const edited = computed<SlipRead>(() => ({
  ...props.read,
  legs: isMultiple.value ? legs.value : legs.value.map((leg) => ({ ...leg, status: status.value })),
}))

const stakeUnits = computed(() =>
  stakeEuros.value > 0 && props.unitValue > 0 ? stakeEuros.value / props.unitValue : null,
)
const totalOdd = computed(() => {
  const typed = parseDecimal(totalOddText.value)
  return typed != null && typed > 1 ? typed : null
})
const slip = computed<SlipChoice>(() => ({
  bookmaker: bookmaker.value.trim() || null,
  stakeUnits: stakeUnits.value,
  status: status.value,
  totalOdd: isMultiple.value ? totalOdd.value : null,
  saveAs: saveAs.value,
}))

const plan = computed(() => buildImportPlan(edited.value, slip.value, choices.value, context.value))

/** Odd total as shown: the slip's, or the product of the legs' while it is blank. */
const shownTotalOdd = computed(() => {
  if (isMultiple.value && totalOdd.value != null) return totalOdd.value
  const odds = plan.value.legs.map((leg) => leg.leg.odd)
  if (odds.length === 0 || odds.some((odd) => odd == null)) return null
  return odds.reduce<number>((total, odd) => total * odd!, 1)
})
const possibleReturn = computed(() =>
  shownTotalOdd.value != null && stakeEuros.value > 0
    ? formatEuros(stakeEuros.value * shownTotalOdd.value, {}, intlLocale.value)
    : '—',
)

const bookmakerOptions = computed(() => {
  const names = [props.read.bookmaker?.trim(), ...props.bookmakers].filter(
    (name): name is string => !!name,
  )
  return [...new Set(names)].slice(0, 6).map((value) => ({ value, label: value }))
})
const statusOptions = computed(() =>
  SLIP_STATUSES.map((value) => ({ value, label: t(`slipImport.status.${value}`) })),
)

const stakeMissing = computed(() => !predictionsOnly.value && stakeUnits.value == null)
const canSave = computed(() => plan.value.canSave && !stakeMissing.value && !saving.value)

/** "Falta responder a 1 pergunta e escolher 2 confianças". */
const missingLine = computed(() => {
  const { missing, tooFewLegs, nothingToSave } = plan.value
  if (tooFewLegs) return t('slipImport.missing.tooFewLegs')
  if (nothingToSave) return t('slipImport.missing.nothingToSave')
  if (missing.alreadyLogged > 0) return t('slipImport.missing.alreadyLogged')
  const items: string[] = []
  if (missing.questions > 0)
    items.push(t('slipImport.missing.questions', { n: missing.questions }, missing.questions))
  if (missing.confidences > 0)
    items.push(t('slipImport.missing.confidences', { n: missing.confidences }, missing.confidences))
  if (missing.fields > 0)
    items.push(t('slipImport.missing.fields', { n: missing.fields }, missing.fields))
  if (stakeMissing.value) items.push(t('slipImport.missing.stake'))
  if (items.length === 0) return t('slipImport.confirm.ready')
  const last = items.pop()!
  const list =
    items.length > 0 ? `${items.join(', ')} ${t('slipImport.missing.and')} ${last}` : last
  return t('slipImport.missing.prefix', { items: list })
})

const saveLabel = computed(() => {
  if (predictionsOnly.value) {
    // Legs that are already predictions write nothing.
    const n = plan.value.legs.filter((leg) => leg.duplicate.kind !== 'reuse').length
    return t('slipImport.confirm.savePredictions', { n }, n)
  }
  if (isMultiple.value) return t('slipImport.confirm.saveMultiple', { n: plan.value.legs.length })
  return plan.value.legs[0]?.duplicate.kind === 'upgrade'
    ? t('slipImport.confirm.saveUpgrade')
    : t('slipImport.confirm.saveSingle')
})

function updateLeg(index: number, leg: SlipLeg) {
  legs.value[index] = leg
}
function updateChoice(index: number, choice: LegChoice) {
  choices.value[index] = choice
}
function remove(index: number) {
  choices.value[index] = { ...choices.value[index]!, removed: true }
}

/** An event picked with Trocar that was not loaded: added with its predictions. */
async function addEvent(event: EventWithTeams) {
  if (context.value.events.some((e) => e.id === event.id)) return
  try {
    const loaded = await store.loadEvent(event)
    const predictions: ContextPrediction[] = [
      ...context.value.predictions,
      ...loaded.predictions.filter((p) => !context.value.predictions.some((q) => q.id === p.id)),
    ]
    context.value = {
      ...context.value,
      events: [...context.value.events, loaded.event],
      predictions,
    }
  } catch (e) {
    error.value = userMessage(e, 'slipImport.loadFailed')
  }
}

async function save() {
  if (!canSave.value) return
  error.value = null
  saving.value = true
  try {
    emit('saved', await store.save(plan.value.rows))
  } catch (e) {
    error.value = userMessage(e, 'slipImport.confirm.saveFailed')
  } finally {
    saving.value = false
  }
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && !saving.value) emit('cancel')
}
onMounted(() => {
  document.addEventListener('keydown', onKeydown)
  document.body.style.overflow = 'hidden'
})
onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeydown)
  document.body.style.overflow = ''
})
</script>

<template>
  <div
    class="fixed inset-0 z-50 flex bg-black/50 lg:items-center lg:justify-center lg:p-6"
    data-slip-confirm
  >
    <div
      class="flex h-full w-full flex-col bg-eb-bg lg:h-[min(920px,100%)] lg:max-w-[1200px] lg:overflow-hidden lg:rounded-2xl lg:border lg:border-eb-border lg:shadow-xl"
      role="dialog"
      aria-modal="true"
      aria-labelledby="slip-confirm-title"
    >
      <header
        class="flex items-center justify-between gap-3 border-b border-eb-border bg-eb-surface px-4 py-2"
      >
        <h2 id="slip-confirm-title" class="m-0 text-lg font-bold">
          {{ t('slipImport.confirm.title') }}
        </h2>
        <div class="flex items-center gap-1">
          <button
            type="button"
            class="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-2.5 text-sm font-semibold text-eb-accent-text lg:hidden"
            :aria-expanded="showImage"
            data-toggle-image
            @click="showImage = !showImage"
          >
            <AppIcon name="image" class="size-4" />
            {{ t(showImage ? 'slipImport.confirm.hideImage' : 'slipImport.confirm.showImage') }}
          </button>
          <button
            type="button"
            class="flex size-11 items-center justify-center rounded-xl text-eb-muted hover:bg-eb-surface-2"
            :aria-label="t('slipImport.confirm.close')"
            :disabled="saving"
            @click="emit('cancel')"
          >
            <AppIcon name="x" class="size-5" />
          </button>
        </div>
      </header>

      <div class="flex min-h-0 flex-1 flex-col lg:grid lg:grid-cols-[420px_minmax(0,1fr)]">
        <aside
          class="overflow-auto border-eb-border bg-eb-surface-2 lg:block lg:border-r"
          :class="showImage ? 'block max-h-[45vh] border-b lg:max-h-none lg:border-b-0' : 'hidden'"
          data-slip-image
        >
          <img :src="imageUrl" :alt="t('slipImport.slipImage')" class="block w-full" />
        </aside>

        <div class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4 lg:p-5">
          <!-- Boletim -->
          <section
            class="flex flex-col gap-3.5 rounded-2xl border border-eb-border bg-eb-surface p-4"
            data-slip-card
          >
            <div class="flex items-baseline justify-between gap-3">
              <h3 class="m-0 text-base font-bold">{{ t('slipImport.slip.title') }}</h3>
              <span class="text-[13px] text-eb-muted">{{
                isMultiple
                  ? t('slipImport.slip.multiple', { n: plan.legs.length })
                  : t('slipImport.slip.single')
              }}</span>
            </div>

            <div class="flex flex-col gap-1.5">
              <span class="text-[13px] font-semibold text-eb-muted">{{
                t('slipImport.slip.bookmaker')
              }}</span>
              <ChipGroup
                v-if="bookmakerOptions.length > 0"
                v-model="bookmaker"
                :options="bookmakerOptions"
                :label="t('slipImport.slip.bookmaker')"
              />
              <InputText
                v-model="bookmaker"
                :aria-label="t('slipImport.slip.bookmaker')"
                :placeholder="t('slipImport.slip.bookmakerPlaceholder')"
                autocomplete="off"
                class="min-h-11 w-full"
                data-bookmaker
              />
            </div>

            <p
              v-if="predictionsOnly"
              class="m-0 rounded-xl bg-eb-surface-2 px-3 py-2.5 text-[13px]"
              data-predictions-only-note
            >
              {{ t('slipImport.saveAs.predictionsNote') }}
            </p>
            <template v-else>
              <div class="grid gap-3.5 lg:grid-cols-2">
                <div class="flex flex-col gap-1.5">
                  <label for="slip-stake" class="text-[13px] font-semibold text-eb-muted">
                    {{ t('slipImport.slip.stake') }} (€)
                  </label>
                  <div class="flex items-center gap-3">
                    <StepperField
                      id="slip-stake"
                      v-model="stakeEuros"
                      :min="0"
                      :max="100000"
                      :step="1"
                      :decimals="2"
                      :down-label="t('slipImport.slip.stakeDown')"
                      :up-label="t('slipImport.slip.stakeUp')"
                      tone="info"
                      class="max-w-[220px] flex-1"
                    />
                    <span class="text-[13px] text-eb-info tabular-nums" data-stake-units>
                      {{
                        t('slipImport.slip.stakeUnits', {
                          units: formatDecimal(stakeUnits ?? 0, intlLocale),
                        })
                      }}
                    </span>
                  </div>
                </div>

                <div class="flex flex-col gap-1.5">
                  <span class="text-[13px] font-semibold text-eb-muted">{{
                    t('slipImport.slip.status')
                  }}</span>
                  <ChipGroup
                    v-model="status"
                    :options="statusOptions"
                    :label="t('slipImport.slip.status')"
                  />
                </div>
              </div>

              <div class="grid grid-cols-2 gap-3">
                <div class="flex flex-col gap-1">
                  <label
                    v-if="isMultiple"
                    for="slip-total-odd"
                    class="text-[13px] font-semibold text-eb-muted"
                    >{{ t('slipImport.slip.totalOdd') }}</label
                  >
                  <span v-else class="text-[13px] font-semibold text-eb-muted">{{
                    t('slipImport.slip.totalOdd')
                  }}</span>
                  <InputText
                    v-if="isMultiple"
                    id="slip-total-odd"
                    v-model="totalOddText"
                    inputmode="decimal"
                    autocomplete="off"
                    :placeholder="
                      shownTotalOdd != null ? formatDecimal(shownTotalOdd, intlLocale) : ''
                    "
                    class="min-h-11 w-full text-lg font-bold tabular-nums"
                  />
                  <span v-else class="text-lg font-bold tabular-nums">{{
                    shownTotalOdd != null ? formatDecimal(shownTotalOdd, intlLocale) : '—'
                  }}</span>
                </div>
                <div class="flex flex-col gap-1">
                  <span class="text-[13px] font-semibold text-eb-muted">{{
                    t('slipImport.slip.possibleReturn')
                  }}</span>
                  <span class="text-lg font-bold tabular-nums" data-possible-return>{{
                    possibleReturn
                  }}</span>
                </div>
              </div>

              <div
                class="flex items-center gap-3 rounded-xl bg-eb-info-soft px-3 py-2.5 text-eb-info"
              >
                <AppIcon name="check" class="size-4 shrink-0" stroke-width="2.5" />
                <span class="flex flex-col">
                  <span class="text-sm font-bold">{{ t('slipImport.slip.punter') }}</span>
                  <span class="text-xs">{{ t('slipImport.slip.punterHint') }}</span>
                </span>
              </div>
              <p v-if="isMultiple" class="m-0 text-[13px] text-eb-muted">
                {{ t('slipImport.slip.multipleNote') }}
              </p>
            </template>
          </section>

          <SlipLegCard
            v-for="legPlan in plan.legs"
            :key="legPlan.index"
            :leg="legs[legPlan.index]!"
            :choice="choices[legPlan.index]!"
            :plan="legPlan"
            :kind="read.kind"
            :as-predictions="predictionsOnly"
            :events="context.events"
            :predictions="context.predictions"
            :now="context.now"
            @update:leg="updateLeg(legPlan.index, $event)"
            @update:choice="updateChoice(legPlan.index, $event)"
            @remove="remove(legPlan.index)"
            @pick-event="addEvent"
          />

          <!-- At the end: keep the multiple, or only its predictions (a slip someone shared). -->
          <section
            v-if="isMultiple"
            class="flex flex-col gap-2 rounded-2xl border border-eb-border bg-eb-surface p-4"
            data-save-as
          >
            <h3 class="m-0 text-base font-bold">{{ t('slipImport.saveAs.title') }}</h3>
            <SegmentedControl
              v-model="saveAs"
              :options="saveAsOptions"
              :label="t('slipImport.saveAs.title')"
            />
            <p class="m-0 text-[13px] text-eb-muted">
              {{ t(`slipImport.saveAs.${saveAs}Hint`) }}
            </p>
          </section>
        </div>
      </div>

      <footer
        class="sticky bottom-0 flex flex-col gap-2 border-t border-eb-border bg-eb-surface px-4 py-3 lg:flex-row lg:items-center lg:justify-between"
      >
        <Message v-if="error" severity="error" class="lg:hidden">{{ message(error) }}</Message>
        <p class="m-0 text-[13px] text-eb-muted" data-missing>
          <span v-if="error" class="hidden text-eb-neg lg:inline">{{ message(error) }} </span>
          {{ missingLine }}
        </p>
        <div class="flex gap-2 lg:shrink-0">
          <Button
            type="button"
            :label="t('slipImport.confirm.cancel')"
            severity="secondary"
            outlined
            class="min-h-12 flex-1 lg:flex-none"
            :disabled="saving"
            @click="emit('cancel')"
          />
          <Button
            type="button"
            :label="saveLabel"
            class="min-h-12 flex-[2] !font-bold lg:flex-none"
            :disabled="!canSave"
            :loading="saving"
            data-save
            @click="save"
          />
        </div>
      </footer>
    </div>
  </div>
</template>
