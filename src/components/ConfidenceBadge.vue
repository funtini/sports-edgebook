<script setup lang="ts">
import { computed } from 'vue'
import { useLocale } from '@/composables/useLocale'
import type { ConfidenceLevel } from '@/domain/confidence'

const props = defineProps<{ level: ConfidenceLevel }>()

const { t } = useLocale()

const label = computed(() =>
  t('confidenceBadge.label', { level: props.level, label: t(`confidence.${props.level}`) }),
)
</script>

<template>
  <span
    class="inline-flex size-[21px] shrink-0 items-center justify-center rounded-full border-[1.5px] border-eb-text text-[11px] leading-none font-bold"
    role="img"
    :aria-label="label"
    :title="label"
    data-confidence-badge
  >
    <span aria-hidden="true">{{ level }}</span>
  </span>
</template>
