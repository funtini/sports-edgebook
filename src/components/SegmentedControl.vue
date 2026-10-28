<script setup lang="ts" generic="T extends string">
defineProps<{
  options: readonly { value: T; label: string }[]
  /** Accessible name of the group. */
  label: string
}>()

const model = defineModel<T>({ required: true })
</script>

<template>
  <div
    class="grid auto-cols-fr grid-flow-col gap-1 rounded-xl border border-eb-border bg-eb-surface-2 p-1"
    role="group"
    :aria-label="label"
  >
    <button
      v-for="option in options"
      :key="option.value"
      type="button"
      class="min-h-11 rounded-[9px] text-[15px] font-semibold transition-colors"
      :class="
        model === option.value
          ? 'bg-eb-surface text-eb-text shadow-sm'
          : 'text-eb-muted hover:text-eb-text'
      "
      :aria-pressed="model === option.value"
      @click="model = option.value"
    >
      {{ option.label }}
    </button>
  </div>
</template>
