<script setup lang="ts">
import { computed } from 'vue'
import { fairOdd, valueBand, valueIndex, type ValueBand } from '@/domain/value'

const props = defineProps<{
  /** Decimal odd; null or invalid until the user types one. */
  odd: number | null
  /** Probability of the chosen confidence level; null until one is picked. */
  probability: number | null
}>()

const BANDS: Record<ValueBand, { label: string; classes: string }> = {
  favourable: { label: 'Favorável', classes: 'border-green-300 bg-green-50 text-green-800' },
  neutral: { label: 'Neutro', classes: 'border-surface-300 bg-surface-100 text-surface-700' },
  unfavourable: { label: 'Desfavorável', classes: 'border-red-300 bg-red-50 text-red-800' },
}

const number = new Intl.NumberFormat('pt-PT', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
})

const result = computed(() => {
  const { odd, probability } = props
  if (odd == null || !Number.isFinite(odd) || odd <= 1 || probability == null) return null
  const index = valueIndex(probability, odd)
  const band = valueBand(index)
  return {
    band,
    ...BANDS[band],
    index: number.format(index),
    fairOdd: number.format(fairOdd(probability)),
  }
})
</script>

<template>
  <output
    v-if="result"
    class="flex items-center justify-between gap-3 rounded-lg border px-4 py-3"
    :class="result.classes"
    :data-band="result.band"
    aria-live="polite"
  >
    <span class="flex flex-col">
      <span class="text-sm">Índice de valor</span>
      <span class="text-2xl font-semibold tabular-nums">{{ result.index }}</span>
    </span>
    <span class="flex flex-col text-right">
      <span class="text-sm font-medium">{{ result.label }}</span>
      <span class="text-sm tabular-nums">Odd justa {{ result.fairOdd }}</span>
    </span>
  </output>
  <p
    v-else
    class="m-0 rounded-lg border border-dashed border-surface-300 px-4 py-3 text-sm text-surface-500"
  >
    Indica a odd e a confiança para ver o índice de valor.
  </p>
</template>
