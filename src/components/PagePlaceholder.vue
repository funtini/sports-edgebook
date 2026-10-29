<script setup lang="ts">
import { useLocale } from '@/composables/useLocale'

/** A screen that arrives in a later phase; its texts live under `placeholder.<section>`. */
defineProps<{ section: 'multiples' }>()

const { t } = useLocale()
</script>

<template>
  <section class="rounded-2xl border border-eb-border bg-eb-surface p-6">
    <h1 class="m-0 text-[22px] font-bold tracking-tight">
      {{ t(`placeholder.${section}.title`) }}
    </h1>
    <p class="mt-2 text-eb-muted">{{ t(`placeholder.${section}.description`) }}</p>
    <p class="mt-4 text-sm text-eb-muted">
      {{ t('placeholder.comesIn', { phase: t(`placeholder.${section}.phase`) }) }}
    </p>
  </section>
</template>
