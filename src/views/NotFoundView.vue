<script setup lang="ts">
import { useLocale } from '@/composables/useLocale'

const { t } = useLocale()
</script>

<template>
  <section class="rounded-2xl border border-eb-border bg-eb-surface p-6">
    <h1 class="m-0 text-[22px] font-bold tracking-tight">{{ t('notFound.title') }}</h1>
    <RouterLink
      :to="{ name: 'today' }"
      class="mt-3 inline-flex min-h-11 items-center font-semibold text-eb-accent-text"
    >
      {{ t('notFound.back') }}
    </RouterLink>
  </section>
</template>
