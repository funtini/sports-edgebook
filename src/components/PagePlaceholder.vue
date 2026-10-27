<script setup lang="ts">
defineProps<{ title: string; phase: string; description: string }>()
</script>

<template>
  <section class="rounded-2xl border border-eb-border bg-eb-surface p-6">
    <h1 class="m-0 text-[22px] font-bold tracking-tight">{{ title }}</h1>
    <p class="mt-2 text-eb-muted">{{ description }}</p>
    <p class="mt-4 text-sm text-eb-muted">Chega na {{ phase }}.</p>
  </section>
</template>
