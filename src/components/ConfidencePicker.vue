<script setup lang="ts">
import { CONFIDENCE_LEVELS, type ConfidenceLevel } from '@/domain/confidence'
import { useLocale } from '@/composables/useLocale'

/** Five buttons with the level and its label; used when logging and editing a prediction. */
const level = defineModel<ConfidenceLevel | null>({ required: true })

const { t } = useLocale()
</script>

<template>
  <div class="grid grid-cols-5 gap-2">
    <button
      v-for="option in CONFIDENCE_LEVELS"
      :key="option"
      type="button"
      class="flex min-h-16 min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl border-[1.5px] px-0.5 py-1 transition-colors"
      :class="
        level === option
          ? 'border-eb-accent bg-eb-accent text-eb-on-accent'
          : 'border-eb-border bg-eb-surface text-eb-text hover:bg-eb-surface-2'
      "
      :aria-pressed="level === option"
      @click="level = option"
    >
      <span class="text-xl leading-none font-bold">{{ option }}</span>
      <span class="text-center text-[11px] leading-tight font-semibold">
        {{ t(`confidence.${option}`) }}
      </span>
    </button>
  </div>
</template>
