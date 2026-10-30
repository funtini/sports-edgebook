<script setup lang="ts" generic="T extends string">
defineProps<{
  options: readonly { value: T; label: string }[]
  /** Accessible name of the group. */
  label: string
  invalid?: boolean
}>()

const model = defineModel<T>({ required: true })
</script>

<template>
  <div class="flex flex-wrap gap-2" role="group" :aria-label="label">
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      class="min-h-11 rounded-xl border-[1.5px] px-3.5 text-[15px] font-semibold transition-colors"
      :class="
        model === option.value
          ? 'border-eb-accent bg-eb-accent text-eb-on-accent'
          : invalid
            ? 'border-eb-neg bg-eb-surface text-eb-text hover:bg-eb-surface-2'
            : 'border-eb-border bg-eb-surface text-eb-text hover:bg-eb-surface-2'
      "
      :aria-pressed="model === option.value"
      @click="model = option.value"
    >
      {{ option.label }}
    </button>
  </div>
</template>
