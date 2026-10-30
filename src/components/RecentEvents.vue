<script setup lang="ts">
import { toDayKey } from '@/domain/days'
import type { EventSearchResult, RecentEvent } from '@/domain/eventSource'
import { dateTimeFormat } from '@/domain/intl'
import { useLocale } from '@/composables/useLocale'

defineProps<{ events: RecentEvent[] }>()
const emit = defineEmits<{ pick: [event: EventSearchResult] }>()

const { t, intlLocale } = useLocale()

const isToday = (event: EventSearchResult) =>
  toDayKey(new Date(event.kickoffAt)) === toDayKey(new Date())

/** "Hoje · 20:15", or the weekday and date for another day. */
function when(event: EventSearchResult): string {
  const kickoff = new Date(event.kickoffAt)
  const time = dateTimeFormat(intlLocale.value, { hour: '2-digit', minute: '2-digit' }).format(
    kickoff,
  )
  const day = isToday(event)
    ? t('recentEvents.today')
    : dateTimeFormat(intlLocale.value, {
        weekday: 'short',
        day: '2-digit',
        month: '2-digit',
      }).format(kickoff)
  return `${day} · ${time}`
}

const countClass = (event: EventSearchResult) =>
  isToday(event) ? 'bg-eb-accent-soft text-eb-accent-text' : 'bg-eb-surface-2 text-eb-muted'
</script>

<template>
  <section v-if="events.length > 0" class="flex flex-col gap-2" data-recent-events>
    <div class="flex items-baseline justify-between gap-3 text-[13px] text-eb-muted">
      <h2 class="m-0 text-[13px] font-semibold">{{ t('recentEvents.title') }}</h2>
      <span class="lg:hidden">{{ t('recentEvents.predictions') }}</span>
    </div>

    <!-- Phone: one card, a row per event. -->
    <ul
      class="m-0 flex list-none flex-col overflow-hidden rounded-2xl border border-eb-border bg-eb-surface p-0 lg:hidden"
    >
      <li
        v-for="{ event, predictions } in events"
        :key="event.eventId ?? event.kickoffAt"
        class="border-t border-eb-border first:border-t-0"
      >
        <button
          type="button"
          class="flex min-h-16 w-full items-center gap-3 px-3.5 py-3 text-left hover:bg-eb-surface-2"
          @click="emit('pick', event)"
        >
          <span class="min-w-0 flex-1">
            <span class="block truncate text-[15px] font-bold">
              {{ event.homeTeam }} – {{ event.awayTeam }}
            </span>
            <span class="mt-0.5 block truncate text-[13px] text-eb-muted">
              {{ [when(event), event.leagueName].filter(Boolean).join(' · ') }}
            </span>
          </span>
          <span
            class="shrink-0 rounded-full px-2.5 py-1 text-xs font-bold"
            :class="countClass(event)"
            :aria-label="t('recentEvents.count', predictions)"
          >
            {{ predictions }}
          </span>
          <span class="text-xl text-eb-muted" aria-hidden="true">›</span>
        </button>
      </li>
    </ul>

    <!-- Desktop: a tile per event, side by side. -->
    <ul class="m-0 hidden list-none grid-cols-3 gap-3 p-0 lg:grid">
      <li v-for="{ event, predictions } in events" :key="event.eventId ?? event.kickoffAt">
        <button
          type="button"
          class="flex h-full w-full flex-col gap-2 rounded-2xl border border-eb-border bg-eb-surface px-4 py-3.5 text-left hover:border-eb-accent"
          @click="emit('pick', event)"
        >
          <span class="flex w-full items-center justify-between gap-2">
            <span class="truncate text-xs font-semibold tracking-wide text-eb-muted uppercase">
              {{ event.leagueName }}
            </span>
            <span
              class="shrink-0 rounded-full px-2.5 py-1 text-xs font-bold"
              :class="countClass(event)"
            >
              {{ t('recentEvents.count', predictions) }}
            </span>
          </span>
          <span class="text-base font-bold">{{ event.homeTeam }} – {{ event.awayTeam }}</span>
          <span class="text-[13px] text-eb-muted">{{ when(event) }}</span>
        </button>
      </li>
    </ul>
  </section>
</template>
