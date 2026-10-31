<script setup lang="ts">
import { ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import { useLocale } from '@/composables/useLocale'
import { parseDecimal } from '@/domain/decimal'
import { numberFormat } from '@/domain/intl'

/** A number with − / + buttons (44px) around a field that also takes typing; kept within bounds. */
const props = defineProps<{
  id: string
  min: number
  max: number
  step: number
  /** Decimals shown and kept. */
  decimals: number
  downLabel: string
  upLabel: string
  /** `info` for amounts staked. */
  tone?: 'info'
}>()

const model = defineModel<number>({ required: true })

const { intlLocale } = useLocale()

const format = (value: number) =>
  numberFormat(intlLocale.value, {
    minimumFractionDigits: props.decimals,
    maximumFractionDigits: props.decimals,
    useGrouping: false,
  }).format(value)

const fit = (value: number) => {
  const factor = 10 ** props.decimals
  return Math.min(props.max, Math.max(props.min, Math.round(value * factor) / factor))
}

const text = ref(format(model.value))
watch([model, intlLocale], () => (text.value = format(model.value)))

/** Typed text becomes the value on blur or Enter; anything unreadable goes back to it. */
function commit() {
  const typed = parseDecimal(text.value)
  if (typed != null && Number.isFinite(typed)) model.value = fit(typed)
  text.value = format(model.value)
}

function nudge(direction: 1 | -1) {
  model.value = fit(model.value + direction * props.step)
  text.value = format(model.value)
}

const buttonClass =
  'flex size-11 shrink-0 items-center justify-center rounded-xl border border-eb-border bg-eb-surface text-eb-text hover:bg-eb-surface-2 disabled:opacity-50'
</script>

<template>
  <div class="flex items-center gap-1.5">
    <button
      type="button"
      :class="buttonClass"
      :aria-label="downLabel"
      :disabled="model <= min"
      data-step="down"
      @click="nudge(-1)"
    >
      <AppIcon name="minus" class="size-4" />
    </button>
    <input
      :id="id"
      v-model="text"
      inputmode="decimal"
      autocomplete="off"
      class="min-h-11 w-full min-w-0 rounded-xl border px-2 text-center text-lg font-bold tabular-nums outline-none focus:border-eb-accent"
      :class="
        tone === 'info'
          ? 'border-eb-info bg-eb-info-soft text-eb-info'
          : 'border-eb-border bg-eb-surface text-eb-text'
      "
      @blur="commit"
      @keydown.enter.prevent="commit"
    />
    <button
      type="button"
      :class="buttonClass"
      :aria-label="upLabel"
      :disabled="model >= max"
      data-step="up"
      @click="nudge(1)"
    >
      <AppIcon name="plus" class="size-4" />
    </button>
  </div>
</template>
