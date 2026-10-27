<script setup lang="ts">
import { computed } from 'vue'
import { CONFIDENCE_LABELS, type ConfidenceLevel } from '@/domain/confidence'
import { formatDecimal, formatMoney, formatUnits } from '@/domain/money'
import { isPunterBet, predictionProfit } from '@/domain/settlement'
import { valueBand, valueIndex } from '@/domain/value'
import type { BetStatus, PredictionWithRelations } from '@/types/db'
import { profitClass } from './profitClass'

const props = defineProps<{
  prediction: PredictionWithRelations
  unitValue: number
  /** Disables the settlement buttons while a save is in flight. */
  busy?: boolean
}>()

const emit = defineEmits<{ settle: [status: BetStatus] }>()

const line = new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 2 })

const outcomes: { status: Exclude<BetStatus, 'pending'>; label: string; active: string }[] = [
  { status: 'won', label: 'Ganho', active: 'border-green-600 bg-green-600 text-white' },
  { status: 'lost', label: 'Perdido', active: 'border-red-600 bg-red-600 text-white' },
  { status: 'void', label: 'Nulo', active: 'border-surface-500 bg-surface-500 text-white' },
]

const bandStyles = {
  favourable: { dot: 'bg-green-500', label: 'favorável' },
  neutral: { dot: 'bg-surface-400', label: 'neutro' },
  unfavourable: { dot: 'bg-red-500', label: 'desfavorável' },
}

const market = computed(() => {
  const { category, name } = props.prediction.market
  return category === name ? name : `${category} · ${name}`
})

const selection = computed(() => {
  const { selection, line: value } = props.prediction
  return value == null ? selection : `${selection} ${line.format(value)}`
})

const confidence = computed(() => {
  const level = props.prediction.confidence as ConfidenceLevel
  return `${level} · ${CONFIDENCE_LABELS[level] ?? ''}`
})

const value = computed(() => {
  const index = valueIndex(props.prediction.probability, props.prediction.odd)
  return { index: formatDecimal(index), ...bandStyles[valueBand(index)] }
})

const isPunter = computed(() => isPunterBet(props.prediction))

const profit = computed(() => {
  const units = predictionProfit(props.prediction)
  if (units == null) return null
  return isPunter.value ? formatMoney(units, props.unitValue) : formatUnits(units, { signed: true })
})

/** Non-punter profit is virtual, so it stays muted whatever its sign. */
const profitTone = computed(() =>
  isPunter.value ? profitClass(predictionProfit(props.prediction) ?? 0) : 'text-surface-400',
)

function toggle(status: Exclude<BetStatus, 'pending'>) {
  emit('settle', props.prediction.status === status ? 'pending' : status)
}
</script>

<template>
  <div class="flex flex-col gap-3 py-3 sm:flex-row sm:items-center sm:justify-between">
    <div class="flex min-w-0 flex-col gap-1">
      <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span class="text-sm text-surface-500">{{ market }}</span>
        <span
          v-if="isPunter"
          class="rounded bg-primary-100 px-1.5 text-xs font-bold text-primary-700"
          :title="`Punter: ${formatUnits(prediction.stake_units ?? 0)}`"
        >
          P · {{ formatUnits(prediction.stake_units ?? 0) }}
        </span>
      </div>
      <div class="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span class="font-semibold">{{ selection }}</span>
        <span class="tabular-nums">@ {{ formatDecimal(prediction.odd) }}</span>
        <span class="rounded-full bg-surface-100 px-2 py-0.5 text-xs text-surface-700">
          {{ confidence }}
        </span>
        <span
          class="inline-flex items-center gap-1 text-xs text-surface-500"
          :title="`Índice de valor ${value.index} (${value.label})`"
        >
          <span class="inline-block size-2.5 rounded-full" :class="value.dot" aria-hidden="true" />
          <span class="sr-only">Índice de valor {{ value.index }}, {{ value.label }}</span>
          <span aria-hidden="true">{{ value.index }}</span>
        </span>
      </div>
      <div v-if="profit" class="text-sm tabular-nums" :class="profitTone">
        {{ profit }}<span v-if="!isPunter"> (virtual)</span>
      </div>
    </div>

    <div class="grid shrink-0 grid-cols-3 gap-2" role="group" aria-label="Liquidar">
      <button
        v-for="outcome in outcomes"
        :key="outcome.status"
        type="button"
        class="min-h-11 min-w-20 rounded-lg border px-3 text-sm font-medium transition-colors disabled:opacity-60"
        :class="
          prediction.status === outcome.status
            ? outcome.active
            : 'border-surface-300 bg-surface-0 text-surface-700 hover:bg-surface-100'
        "
        :aria-pressed="prediction.status === outcome.status"
        :disabled="busy"
        @click="toggle(outcome.status)"
      >
        {{ outcome.label }}
      </button>
    </div>
  </div>
</template>
