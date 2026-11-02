<script setup lang="ts">
import { computed, ref, useId } from 'vue'
import Button from 'primevue/button'
import Textarea from 'primevue/textarea'
import ConfidenceBadge from './ConfidenceBadge.vue'
import SlipEventPicker from './SlipEventPicker.vue'
import SlipLegField from './SlipLegField.vue'
import { useLocale } from '@/composables/useLocale'
import { CONFIDENCE_LEVELS, type ConfidenceLevel } from '@/domain/confidence'
import { dateTimeFormat } from '@/domain/intl'
import { lineKind } from '@/domain/markets'
import { formatDecimal } from '@/domain/money'
import {
  eventsOnLegDay,
  type ContextPrediction,
  type LegChoice,
  type LegPlan,
} from '@/domain/slipImport'
import type { SlipLeg, SlipLegField as Field, SlipRead } from '@/domain/slipRead'
import type { EventWithTeams } from '@/types/db'

/** One prediction of the slip in the confirmation window (docs/specs/slip-import.md#prediction-cards). */
const props = defineProps<{
  plan: LegPlan
  kind: SlipRead['kind']
  /** The owner's events loaded for the import. */
  events: EventWithTeams[]
  predictions: readonly ContextPrediction[]
  now: Date
  /** A multiple slip saved as its predictions only. */
  asPredictions?: boolean
}>()

const leg = defineModel<SlipLeg>('leg', { required: true })
const choice = defineModel<LegChoice>('choice', { required: true })
const emit = defineEmits<{ remove: []; pickEvent: [event: EventWithTeams] }>()

const { t, intlLocale } = useLocale()
const uid = useId()

const editing = ref(false)
const swapping = ref(false)
/** "Está certo" pressed: the unsure fields are taken as read. */
const confirmed = ref(false)

const eventsById = computed(() => new Map(props.events.map((event) => [event.id, event])))
const game = computed(() => `${leg.value.homeTeam} – ${leg.value.awayTeam}`)
const appGame = (event: EventWithTeams) => `${event.home_team.name} – ${event.away_team.name}`

const KICKOFF: Intl.DateTimeFormatOptions = {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
}
const when = (iso: string | null) =>
  iso && !Number.isNaN(Date.parse(iso))
    ? dateTimeFormat(intlLocale.value, KICKOFF).format(new Date(iso))
    : t('slipImport.leg.noDate')

const header = computed(() =>
  [when(leg.value.kickoffAt), leg.value.league].filter(Boolean).join(' · '),
)

const candidates = computed(() =>
  props.plan.event.kind === 'question'
    ? props.plan.event.candidateIds.flatMap((id) => eventsById.value.get(id) ?? [])
    : [],
)
const linkedEvent = computed(() =>
  props.plan.event.kind === 'linked' ? eventsById.value.get(props.plan.event.eventId) : undefined,
)
/** Trocar's list: the leg's day first, nearest kickoff first. */
const sameDay = computed(() => {
  const reference = leg.value.kickoffAt ? Date.parse(leg.value.kickoffAt) : props.now.getTime()
  return eventsOnLegDay(leg.value.kickoffAt, props.events, props.now).sort(
    (a, b) =>
      Math.abs(Date.parse(a.kickoff_at) - reference) -
      Math.abs(Date.parse(b.kickoff_at) - reference),
  )
})

const existing = computed(() => {
  const duplicate = props.plan.duplicate
  return duplicate.kind === 'none'
    ? undefined
    : props.predictions.find((p) => p.id === duplicate.predictionId)
})

const missingFields = computed(
  () => new Set(props.plan.missing.flatMap((m) => (m.kind === 'field' ? [m.field as Field] : []))),
)
/** "Campos a confirmar": unsure fields until "Está certo", and fields still missing. */
const toConfirm = computed(() => {
  const fields = new Set<Field>(confirmed.value ? [] : props.plan.unsure)
  for (const field of missingFields.value) fields.add(field)
  // A linked event already has its date; the leg's own does not matter.
  if (props.plan.event.kind === 'linked') fields.delete('kickoffAt')
  return EDIT_ORDER.filter((field) => fields.has(field))
})

const EDIT_ORDER: Field[] = [
  'homeTeam',
  'awayTeam',
  'league',
  'kickoffAt',
  'timing',
  'market',
  'betType',
  'period',
  'selection',
  'line',
  'odd',
  'status',
]
const editFields = computed(() =>
  EDIT_ORDER.filter((field) => {
    if (['homeTeam', 'awayTeam', 'league', 'kickoffAt'].includes(field))
      return props.plan.event.kind === 'new'
    if (field === 'line') return !!leg.value.betType && lineKind(leg.value.betType) != null
    // A single's status is the Boletim card's.
    if (field === 'status') return props.kind === 'multiple'
    return true
  }),
)

function answer(event: string | 'new') {
  choice.value = { ...choice.value, event }
  swapping.value = false
}
function pick(event: EventWithTeams) {
  emit('pickEvent', event)
  answer(event.id)
}
function setConfidence(level: ConfidenceLevel) {
  choice.value = { ...choice.value, confidence: level }
}
const notes = computed({
  get: () => choice.value.notes ?? '',
  set: (value: string) => (choice.value = { ...choice.value, notes: value }),
})

const removeLabel = computed(() =>
  t(
    props.kind === 'multiple' && !props.asPredictions
      ? 'slipImport.leg.removeFromMultiple'
      : 'slipImport.leg.removeFromImport',
  ),
)
</script>

<template>
  <article
    class="flex flex-col gap-3 rounded-2xl border border-eb-border bg-eb-surface p-4"
    :data-leg="plan.index"
  >
    <header class="flex flex-col gap-0.5">
      <h3 class="m-0 text-base font-bold break-words">{{ game }}</h3>
      <p class="m-0 text-[13px] text-eb-muted">{{ header }}</p>
    </header>

    <p class="m-0 text-sm break-words">
      <span class="font-semibold text-eb-muted">{{ t('slipImport.leg.onSlip') }}</span>
      {{ leg.rawText }}
    </p>

    <!-- Event state -->
    <div
      v-if="plan.event.kind === 'question'"
      class="flex flex-col gap-2 rounded-xl border border-eb-amber bg-eb-amber-soft p-3"
      data-event-state="question"
    >
      <p class="m-0 text-sm font-bold">{{ t('slipImport.leg.question') }}</p>
      <p class="m-0 text-sm">
        <span class="font-semibold">{{ t('slipImport.leg.onSlip') }}</span> {{ game }}
      </p>
      <div v-for="event in candidates" :key="event.id" class="flex flex-col gap-1.5">
        <p class="m-0 text-sm">
          <span class="font-semibold">{{ t('slipImport.leg.inApp') }}</span>
          {{ appGame(event) }} · {{ when(event.kickoff_at) }}
        </p>
        <Button
          type="button"
          :label="t('slipImport.leg.yes')"
          class="min-h-11"
          data-answer="yes"
          @click="answer(event.id)"
        />
      </div>
      <Button
        type="button"
        :label="t('slipImport.leg.no')"
        severity="secondary"
        outlined
        class="min-h-11 !bg-eb-surface !text-eb-text"
        data-answer="no"
        @click="answer('new')"
      />
    </div>
    <p
      v-else-if="plan.event.kind === 'linked'"
      class="m-0 rounded-xl bg-eb-accent-soft px-3 py-2 text-sm font-semibold text-eb-accent-text"
      data-event-state="linked"
    >
      {{ t('slipImport.leg.linked') }}
      <span v-if="linkedEvent" class="block font-normal"
        >{{ t('slipImport.leg.inApp') }} {{ appGame(linkedEvent) }}</span
      >
    </p>
    <p v-else class="m-0 rounded-xl bg-eb-surface-2 px-3 py-2 text-sm" data-event-state="new">
      <span class="font-semibold">{{ t('slipImport.leg.newEvent') }}</span>
      <span class="block text-eb-muted">{{ t('slipImport.leg.newEventHint') }}</span>
    </p>

    <!-- Duplicate notice -->
    <p
      v-if="plan.duplicate.kind === 'reuse'"
      class="m-0 rounded-xl bg-eb-accent-soft px-3 py-2 text-sm text-eb-accent-text"
      data-duplicate="reuse"
    >
      {{ t(asPredictions ? 'slipImport.leg.alreadyHave' : 'slipImport.leg.reuse') }}
    </p>
    <p
      v-else-if="plan.duplicate.kind === 'upgrade'"
      class="m-0 rounded-xl bg-eb-accent-soft px-3 py-2 text-sm text-eb-accent-text"
      data-duplicate="upgrade"
    >
      {{ t('slipImport.leg.upgrade') }}
      <span v-if="plan.duplicate.oddChanged && existing && leg.odd != null" class="block">
        {{
          t('slipImport.leg.upgradeOdd', {
            before: formatDecimal(existing.odd, intlLocale),
            after: formatDecimal(leg.odd, intlLocale),
          })
        }}
      </span>
    </p>
    <div
      v-else-if="plan.duplicate.kind === 'already_logged'"
      class="flex flex-col gap-2 rounded-xl border border-eb-amber bg-eb-amber-soft p-3"
      data-duplicate="already_logged"
    >
      <p class="m-0 text-sm font-semibold">{{ t('slipImport.leg.alreadyLogged') }}</p>
      <Button
        type="button"
        :label="t('slipImport.leg.removeFromImport')"
        severity="secondary"
        outlined
        class="min-h-11 !bg-eb-surface !text-eb-text"
        @click="emit('remove')"
      />
    </div>

    <!-- Campos a confirmar -->
    <div
      v-if="toConfirm.length > 0 && !editing"
      class="flex flex-col gap-3 rounded-xl border border-eb-amber bg-eb-amber-soft p-3"
      data-to-confirm
    >
      <p class="m-0 text-sm font-bold">{{ t('slipImport.leg.toConfirm') }}</p>
      <SlipLegField
        v-for="field in toConfirm"
        :key="field"
        v-model:leg="leg"
        :field="field"
        :id-prefix="`${uid}-confirm`"
        :invalid="missingFields.has(field)"
      />
      <Button
        v-if="!confirmed"
        type="button"
        :label="t('slipImport.leg.looksRight')"
        severity="secondary"
        outlined
        class="min-h-11 self-start !bg-eb-surface !text-eb-text"
        data-looks-right
        @click="confirmed = true"
      />
    </div>

    <!-- Confiança -->
    <fieldset class="m-0 flex min-w-0 flex-col gap-2 border-0 p-0">
      <legend class="mb-1.5 p-0 text-[13px] font-semibold text-eb-muted">
        {{ t('logging.confidence') }}
      </legend>
      <div v-if="plan.confidenceLocked && plan.confidence" class="flex items-center gap-2">
        <ConfidenceBadge :level="plan.confidence" />
        <span class="text-[13px] text-eb-muted">{{ t('slipImport.leg.confidenceLocked') }}</span>
      </div>
      <div v-else class="grid grid-cols-5 gap-2">
        <button
          v-for="level in CONFIDENCE_LEVELS"
          :key="level"
          type="button"
          class="flex min-h-14 min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl border-[1.5px] px-0.5 py-1 transition-colors"
          :class="
            plan.confidence === level
              ? 'border-eb-accent bg-eb-accent text-eb-on-accent'
              : 'border-eb-border bg-eb-surface text-eb-text hover:bg-eb-surface-2'
          "
          :aria-pressed="plan.confidence === level"
          :data-confidence="level"
          @click="setConfidence(level)"
        >
          <span class="text-lg leading-none font-bold">{{ level }}</span>
          <span class="text-center text-[10px] leading-tight font-semibold">
            {{ t(`confidence.${level}`) }}
          </span>
        </button>
      </div>
    </fieldset>

    <!-- Editar campos -->
    <Button
      v-if="!editing"
      type="button"
      :label="t('slipImport.leg.edit')"
      severity="secondary"
      text
      class="min-h-11 self-start"
      data-edit
      @click="editing = true"
    />
    <div v-else class="flex flex-col gap-3 border-t border-eb-border pt-3" data-editing>
      <div class="flex flex-col gap-1.5">
        <div class="flex items-center justify-between gap-2">
          <span class="text-[13px] font-semibold text-eb-muted">{{
            t('slipImport.leg.event')
          }}</span>
          <button
            type="button"
            class="min-h-11 px-1 text-sm font-semibold text-eb-accent-text"
            :aria-expanded="swapping"
            data-swap
            @click="swapping = !swapping"
          >
            {{ t('slipImport.leg.swap') }}
          </button>
        </div>
        <p class="m-0 text-sm font-semibold">
          {{ linkedEvent ? appGame(linkedEvent) : game }}
        </p>
        <SlipEventPicker
          v-if="swapping"
          :candidates="sameDay"
          :slip-game="game"
          :current-id="linkedEvent?.id ?? null"
          @pick="pick"
          @new="answer('new')"
        />
      </div>
      <div class="grid gap-3 lg:grid-cols-2">
        <SlipLegField
          v-for="field in editFields"
          :key="field"
          v-model:leg="leg"
          :field="field"
          :id-prefix="`${uid}-edit`"
          :invalid="missingFields.has(field)"
          :class="['market', 'betType', 'selection', 'status'].includes(field) && 'lg:col-span-2'"
        />
      </div>
      <div class="flex flex-col gap-1.5">
        <label :for="`${uid}-notes`" class="text-[13px] font-semibold text-eb-muted">{{
          t('logging.notes')
        }}</label>
        <Textarea :id="`${uid}-notes`" v-model="notes" rows="2" class="w-full" />
      </div>
      <div class="flex flex-wrap justify-between gap-2">
        <Button
          type="button"
          :label="removeLabel"
          severity="danger"
          text
          class="min-h-11"
          data-remove
          @click="emit('remove')"
        />
        <Button
          type="button"
          :label="t('slipImport.leg.done')"
          class="min-h-11"
          data-done
          @click="editing = false"
        />
      </div>
    </div>
  </article>
</template>
