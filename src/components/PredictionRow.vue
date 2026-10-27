<script setup lang="ts">
import { computed } from 'vue'
import { CONFIDENCE_LABELS, type ConfidenceLevel } from '@/domain/confidence'
import { formatDecimal, formatMoney, type MoneyDisplay } from '@/domain/money'
import { isPunterBet, predictionProfit } from '@/domain/settlement'
import { valueBand, valueIndex } from '@/domain/value'
import type { BetStatus, PredictionWithRelations } from '@/types/db'
import { VALUE_BAND_STYLES, valueRowLabel } from './valueBands'

const props = defineProps<{
  prediction: PredictionWithRelations
  unitValue: number
  moneyDisplay: MoneyDisplay
  /** Disables the settlement buttons while a save is in flight. */
  busy?: boolean
}>()

const emit = defineEmits<{ settle: [status: BetStatus] }>()

const line = new Intl.NumberFormat('pt-PT', { maximumFractionDigits: 2 })

const outcomes: { status: Exclude<BetStatus, 'pending'>; label: string; active: string }[] = [
  { status: 'won', label: 'Ganho', active: 'border-eb-pos bg-eb-pos text-eb-on-fill' },
  { status: 'lost', label: 'Perdido', active: 'border-eb-neg bg-eb-neg text-eb-on-fill' },
  { status: 'void', label: 'Nulo', active: 'border-eb-muted bg-eb-muted text-eb-on-fill' },
]

const results: Record<BetStatus, { label: string; classes: string }> = {
  pending: { label: 'Por resolver', classes: 'bg-eb-surface-2 text-eb-muted' },
  won: { label: 'Lucro', classes: 'bg-eb-pos-soft text-eb-pos' },
  lost: { label: 'Prejuízo', classes: 'bg-eb-neg-soft text-eb-neg' },
  void: { label: 'Nulo', classes: 'bg-eb-surface-2 text-eb-muted' },
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
  const band = valueBand(index)
  return { band, label: valueRowLabel(band, index), ...VALUE_BAND_STYLES[band] }
})

const isPunter = computed(() => isPunterBet(props.prediction))

const money = (units: number, signed: boolean) =>
  formatMoney(units, props.unitValue, props.moneyDisplay, { signed })

const stake = computed(() =>
  isPunter.value
    ? {
        label: 'Apostado',
        amount: money(props.prediction.stake_units ?? 0, false),
        classes: 'bg-eb-info-soft text-eb-info',
      }
    : { label: 'Sem aposta', amount: '—', classes: 'bg-eb-surface-2 text-eb-muted' },
)

const result = computed(() => {
  const units = predictionProfit(props.prediction)
  return {
    ...results[props.prediction.status],
    amount: units == null ? '—' : money(units, true),
    // Non-punter profit is on 1 virtual unit.
    virtual: units != null && !isPunter.value,
  }
})

function toggle(status: Exclude<BetStatus, 'pending'>) {
  emit('settle', props.prediction.status === status ? 'pending' : status)
}
</script>

<template>
  <div class="flex flex-col p-3.5 tabular-nums">
    <div class="flex items-start justify-between gap-3">
      <div class="min-w-0">
        <div class="text-xs text-eb-muted">{{ market }}</div>
        <div class="text-[15px] font-semibold break-words">{{ selection }}</div>
      </div>
      <div class="text-lg font-bold">
        <span class="sr-only">Odd </span>{{ formatDecimal(prediction.odd) }}
      </div>
    </div>

    <div class="mt-2.5 grid grid-cols-2 gap-1.5">
      <div class="min-w-0 rounded-[10px] px-2.5 py-2" :class="stake.classes" data-box="stake">
        <div class="text-[11px] font-semibold">{{ stake.label }}</div>
        <div class="mt-0.5 truncate text-base font-bold">{{ stake.amount }}</div>
      </div>
      <div class="min-w-0 rounded-[10px] px-2.5 py-2" :class="result.classes" data-box="result">
        <div class="flex justify-between gap-1 text-[11px] font-semibold">
          <span>{{ result.label }}</span>
          <span v-if="result.virtual" class="text-eb-muted">virtual</span>
        </div>
        <div class="mt-0.5 truncate text-base font-bold">{{ result.amount }}</div>
      </div>
    </div>

    <div class="mt-2 flex flex-wrap items-center gap-2">
      <span class="rounded-full bg-eb-surface-2 px-2 py-0.5 text-xs font-semibold">
        {{ confidence }}
      </span>
      <span
        class="inline-flex items-center gap-1.5 text-xs font-semibold"
        :class="value.text"
        :data-band="value.band"
      >
        <span class="inline-block size-2 rounded-full" :class="value.fill" aria-hidden="true" />
        <span class="sr-only">Índice de valor: </span>{{ value.label }}
      </span>
    </div>

    <div class="mt-2.5 grid grid-cols-3 gap-1.5" role="group" aria-label="Liquidar">
      <button
        v-for="outcome in outcomes"
        :key="outcome.status"
        type="button"
        class="min-h-11 rounded-[10px] border text-sm font-semibold transition-colors disabled:opacity-60"
        :class="
          prediction.status === outcome.status
            ? outcome.active
            : 'border-eb-border bg-transparent text-eb-text hover:bg-eb-surface-2'
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
