<script setup lang="ts">
import { computed } from 'vue'
import { useLocale } from '@/composables/useLocale'
import type { ConfidenceLevel } from '@/domain/confidence'
import { formatDecimal, formatMoney, type MoneyDisplay } from '@/domain/money'
import { isPunterBet, predictionProfit } from '@/domain/settlement'
import { valueBand, valueIndex } from '@/domain/value'
import type { BetStatus, PredictionWithRelations } from '@/types/db'
import ConfidenceBadge from './ConfidenceBadge.vue'
import { VALUE_BAND_STYLES, valueRowLabel } from './valueBands'

const props = defineProps<{
  prediction: PredictionWithRelations
  unitValue: number
  moneyDisplay: MoneyDisplay
  /** Disables the settlement buttons while a save is in flight. */
  busy?: boolean
  /**
   * `card` (default): stacked, as on phone. `line`: the same card below `lg`; from `lg` one grid
   * line (prediction · odd · badge + pill · Apostado · Resultado · Ganho / Perdido / Nulo).
   */
  layout?: 'card' | 'line'
}>()

const emit = defineEmits<{ settle: [status: BetStatus] }>()

const { t, intlLocale, betParts } = useLocale()

const outcomes: { status: Exclude<BetStatus, 'pending'>; active: string }[] = [
  { status: 'won', active: 'border-eb-pos bg-eb-pos text-eb-on-fill' },
  { status: 'lost', active: 'border-eb-neg bg-eb-neg text-eb-on-fill' },
  { status: 'void', active: 'border-eb-muted bg-eb-muted text-eb-on-fill' },
]

const resultClasses: Record<BetStatus, string> = {
  pending: 'bg-eb-surface-2 text-eb-muted',
  won: 'bg-eb-pos-soft text-eb-pos',
  lost: 'bg-eb-neg-soft text-eb-neg',
  void: 'bg-eb-surface-2 text-eb-muted',
}

/** Mercado - Tipo - Período above, the selection below: together the bet's summary. */
const parts = computed(() => betParts(props.prediction))
const market = computed(() => parts.value.slice(0, 3).join(' - '))
const selection = computed(() => parts.value[3])

const value = computed(() => {
  const index = valueIndex(props.prediction.probability, props.prediction.odd)
  const band = valueBand(index)
  const label = valueRowLabel(
    band,
    t(`valueBand.row.${band}`),
    formatDecimal(index, intlLocale.value),
  )
  return { band, label, ...VALUE_BAND_STYLES[band] }
})

const isPunter = computed(() => isPunterBet(props.prediction))

const money = (units: number, signed: boolean) =>
  formatMoney(units, props.unitValue, props.moneyDisplay, { signed }, intlLocale.value)

const stake = computed(() =>
  isPunter.value
    ? {
        label: t('predictionRow.staked'),
        amount: money(props.prediction.stake_units ?? 0, false),
        classes: 'bg-eb-info-soft text-eb-info',
      }
    : {
        label: t('predictionRow.noStake'),
        amount: '—',
        classes: 'bg-eb-surface-2 text-eb-muted',
      },
)

const result = computed(() => {
  const units = predictionProfit(props.prediction)
  const status = props.prediction.status
  return {
    label: t(`predictionRow.result.${status}`),
    classes: resultClasses[status],
    amount: units == null ? '—' : money(units, true),
    // Non-punter profit is on 1 virtual unit.
    virtual: units != null && !isPunter.value,
  }
})

const line = computed(() => props.layout === 'line')

function toggle(status: Exclude<BetStatus, 'pending'>) {
  emit('settle', props.prediction.status === status ? 'pending' : status)
}
</script>

<template>
  <div
    class="flex flex-col p-3.5 tabular-nums"
    :class="
      line &&
      'lg:grid lg:grid-cols-[minmax(0,1fr)_76px_176px_120px_120px_204px] lg:items-center lg:gap-x-3 lg:px-4 lg:py-2.5'
    "
    :data-layout="layout ?? 'card'"
  >
    <div class="flex items-start justify-between gap-3" :class="line && 'lg:contents'">
      <div class="min-w-0">
        <div class="text-xs text-eb-muted">
          {{ market
          }}<span
            v-if="prediction.is_live"
            class="ml-1.5 rounded bg-eb-neg-soft px-1.5 py-px text-[11px] font-bold text-eb-neg"
            data-live
            >{{ t('timing.live') }}</span
          >
        </div>
        <div class="text-[15px] font-semibold break-words">{{ selection }}</div>
      </div>
      <div class="text-lg font-bold" :class="line && 'lg:text-right'">
        <span class="sr-only">{{ `${t('predictionRow.odd')} ` }}</span
        >{{ formatDecimal(prediction.odd, intlLocale) }}
      </div>
    </div>

    <div class="mt-2.5 grid grid-cols-2 gap-1.5" :class="line && 'lg:contents'">
      <div
        class="min-w-0 rounded-[10px] px-2.5 py-2"
        :class="[stake.classes, line && 'lg:order-4']"
        data-box="stake"
      >
        <div class="text-[11px] font-semibold">{{ stake.label }}</div>
        <div class="mt-0.5 truncate text-base font-bold">{{ stake.amount }}</div>
      </div>
      <div
        class="min-w-0 rounded-[10px] px-2.5 py-2"
        :class="[result.classes, line && 'lg:order-5']"
        data-box="result"
      >
        <div class="flex justify-between gap-1 text-[11px] font-semibold">
          <span>{{ result.label }}</span>
          <span v-if="result.virtual" class="text-eb-muted">{{ t('predictionRow.virtual') }}</span>
        </div>
        <div class="mt-0.5 truncate text-base font-bold">{{ result.amount }}</div>
      </div>
    </div>

    <div
      class="mt-2 flex flex-wrap items-center gap-2"
      :class="line && 'lg:order-3 lg:mt-0 lg:pl-1.5'"
    >
      <ConfidenceBadge :level="prediction.confidence as ConfidenceLevel" />
      <span
        class="rounded-full px-2 py-0.5 text-xs font-bold"
        :class="[value.text, value.soft]"
        :title="t('predictionRow.valueTooltip')"
        :data-band="value.band"
      >
        <span class="sr-only">{{ `${t('predictionRow.valueIndex')} ` }}</span
        >{{ value.label }}
      </span>
    </div>

    <div
      class="mt-2.5 grid grid-cols-3 gap-1.5"
      :class="line && 'lg:order-6 lg:mt-0'"
      role="group"
      :aria-label="t('predictionRow.settle')"
    >
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
        {{ t(`predictionRow.outcome.${outcome.status}`) }}
      </button>
    </div>
  </div>
</template>
