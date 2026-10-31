<script setup lang="ts">
/** Stroke icons used across the app (24×24, `currentColor`). Decorative: pair with a text label. */
export type IconName =
  | 'calendar'
  | 'minus'
  | 'plus-circle'
  | 'plus'
  | 'layers'
  | 'chart'
  | 'settings'
  | 'chevron-left'
  | 'chevron-right'
  | 'clock'
  | 'check'
  | 'logo'
  | 'moon'
  | 'sun'
  | 'lock'
  | 'unlock'
  | 'swap'
  | 'x'
  | 'spark'
  | 'chevron-down'
  | 'search'

defineProps<{ name: IconName }>()

const PATHS: Record<IconName, string[]> = {
  calendar: [
    'M3 6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z',
    'M16 2v4M8 2v4M3 10h18',
  ],
  minus: ['M5 12h14'],
  'plus-circle': ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z', 'M12 8v8M8 12h8'],
  plus: ['M12 5v14M5 12h14'],
  layers: ['M12 2L2 7l10 5 10-5-10-5z', 'M2 17l10 5 10-5', 'M2 12l10 5 10-5'],
  chart: ['M3 3v18h18', 'M7 15l4-4 3 3 5-6'],
  settings: [
    'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z',
    'M15 12a3 3 0 1 1-6 0 3 3 0 0 1 6 0z',
  ],
  'chevron-left': ['M15 18l-6-6 6-6'],
  'chevron-right': ['M9 18l6-6-6-6'],
  clock: ['M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0z', 'M12 7v5l3 2'],
  check: ['M20 6L9 17l-5-5'],
  logo: ['M4 17l6-6 4 4 6-8'],
  moon: ['M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9z'],
  sun: [
    'M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0z',
    'M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41',
  ],
  lock: [
    'M5 13a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z',
    'M8 11V7a4 4 0 0 1 8 0v4',
  ],
  unlock: [
    'M5 13a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2z',
    'M8 11V7a4 4 0 0 1 7.75-1.4',
  ],
  swap: ['M16 3l4 4-4 4', 'M20 7H4', 'M8 21l-4-4 4-4', 'M4 17h16'],
  x: ['M18 6L6 18M6 6l12 12'],
  spark: ['M12 3l1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2z'],
  'chevron-down': ['M6 9l6 6 6-6'],
  search: ['M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0z', 'M21 21l-4.3-4.3'],
}
</script>

<template>
  <svg
    aria-hidden="true"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width="2"
    stroke-linecap="round"
    stroke-linejoin="round"
  >
    <path v-for="d in PATHS[name]" :key="d" :d="d" />
  </svg>
</template>
