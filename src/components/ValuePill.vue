<script setup lang="ts">
import { computed } from 'vue'
import { useLocale } from '@/composables/useLocale'
import { formatDecimal } from '@/domain/money'
import { valueBand, valueIndex } from '@/domain/value'
import { VALUE_BAND_STYLES, valueRowLabel } from './valueBands'

/** A prediction's value index as a pill in its band's colours: "Favorável 1,20", "Neutro". */
const props = defineProps<{ probability: number; odd: number }>()

const { t, intlLocale } = useLocale()

const value = computed(() => {
  const index = valueIndex(props.probability, props.odd)
  const band = valueBand(index)
  const label = valueRowLabel(
    band,
    t(`valueBand.row.${band}`),
    formatDecimal(index, intlLocale.value),
  )
  return { band, label, ...VALUE_BAND_STYLES[band] }
})
</script>

<template>
  <span
    class="rounded-full px-2 py-0.5 text-xs font-bold whitespace-nowrap"
    :class="[value.text, value.soft]"
    :title="t('predictionRow.valueTooltip')"
    :data-band="value.band"
  >
    <span class="sr-only">{{ `${t('predictionRow.valueIndex')} ` }}</span
    >{{ value.label }}
  </span>
</template>
