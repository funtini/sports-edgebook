<script setup lang="ts">
import type { AppLocale } from '@/lib/preferences'

/** Flag of a language, as inline SVG: flag emoji do not render on Windows. Decorative. */
defineProps<{ locale: AppLocale }>()
</script>

<template>
  <svg aria-hidden="true" viewBox="0 0 30 20" class="overflow-hidden rounded-[3px]">
    <template v-if="locale === 'pt-PT'">
      <rect width="12" height="20" fill="#046a38" />
      <rect x="12" width="18" height="20" fill="#da291c" />
      <circle cx="12" cy="10" r="4.2" fill="#ffe900" />
      <circle cx="12" cy="10" r="2.6" fill="#da291c" />
      <path d="M10.6 8.6h2.8v2.2a1.4 1.4 0 0 1-2.8 0z" fill="#fff" />
    </template>
    <template v-else-if="locale === 'en'">
      <rect width="30" height="20" fill="#012169" />
      <path d="M0 0l30 20M30 0L0 20" stroke="#fff" stroke-width="4" />
      <path d="M0 0l30 20M30 0L0 20" stroke="#c8102e" stroke-width="1.6" />
      <path d="M15 0v20M0 10h30" stroke="#fff" stroke-width="6" />
      <path d="M15 0v20M0 10h30" stroke="#c8102e" stroke-width="3.4" />
    </template>
    <rect
      width="30"
      height="20"
      rx="3"
      fill="none"
      stroke="currentColor"
      stroke-opacity="0.15"
      stroke-width="1"
    />
  </svg>
</template>
