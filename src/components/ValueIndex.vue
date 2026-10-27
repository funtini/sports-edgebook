<script setup lang="ts">
import { computed } from 'vue'
import { formatDecimal } from '@/domain/money'
import { fairOdd, valueBand, valueIndex } from '@/domain/value'
import { VALUE_BAND_STYLES } from './valueBands'

const props = defineProps<{
  /** Decimal odd; null or invalid until the user types one. */
  odd: number | null
  /** Probability of the chosen confidence level; null until one is picked. */
  probability: number | null
}>()

/** The bar spans 0,80 to 1,30; the neutral zone (0,95 – 1,05) sits at 30–50%. */
const BAR_MIN = 0.8
const BAR_MAX = 1.3

const result = computed(() => {
  const { odd, probability } = props
  if (odd == null || !Number.isFinite(odd) || odd <= 1 || probability == null) return null
  const index = valueIndex(probability, odd)
  const band = valueBand(index)
  const position = Math.min(1, Math.max(0, (index - BAR_MIN) / (BAR_MAX - BAR_MIN)))
  return {
    band,
    ...VALUE_BAND_STYLES[band],
    index: formatDecimal(index),
    odd: formatDecimal(odd),
    fairOdd: formatDecimal(fairOdd(probability)),
    marker: `calc(${(position * 100).toFixed(1)}% - 2px)`,
  }
})
</script>

<template>
  <output
    v-if="result"
    class="block rounded-2xl border px-4 py-3.5 tabular-nums"
    :class="result.card"
    :data-band="result.band"
    aria-live="polite"
  >
    <span class="flex items-center justify-between gap-3">
      <span class="text-[13px] font-semibold text-eb-muted">Índice de valor</span>
      <span
        class="rounded-full px-2.5 py-0.5 text-xs font-bold text-eb-on-fill"
        :class="result.fill"
      >
        {{ result.pill }}
      </span>
    </span>
    <span class="mt-1 flex flex-wrap items-baseline gap-x-2.5">
      <span class="text-[34px] font-bold tracking-tight" :class="result.text">
        {{ result.index }}
      </span>
      <span class="text-sm text-eb-muted">odd {{ result.odd }} vs justa {{ result.fairOdd }}</span>
    </span>
    <span class="relative mt-3 block h-2 rounded-full bg-eb-surface-2" aria-hidden="true">
      <span class="absolute inset-y-0 left-[30%] w-[20%] bg-eb-border" />
      <span
        class="absolute -top-1 h-4 w-1 rounded-sm"
        :class="result.fill"
        :style="{ left: result.marker }"
      />
    </span>
    <span class="mt-1.5 flex justify-between text-[11px] text-eb-muted" aria-hidden="true">
      <span>0,80</span><span>0,95 – 1,05</span><span>1,30</span>
    </span>
  </output>
  <p
    v-else
    class="m-0 rounded-2xl border border-dashed border-eb-border px-4 py-3 text-sm text-eb-muted"
  >
    Indica a odd e a confiança para ver o índice de valor.
  </p>
</template>
