<script setup lang="ts">
import { computed, ref } from 'vue'
import InputText from 'primevue/inputtext'
import AppIcon from './AppIcon.vue'
import { useLatestRequest } from '@/composables/useLatestRequest'
import { useLocale } from '@/composables/useLocale'
import { dateTimeFormat } from '@/domain/intl'
import { userMessage } from '@/lib/errors'
import { useEventsStore } from '@/stores/events'
import type { EventWithTeams } from '@/types/db'

/** "Trocar": the owner's events, the leg's day first, and a new event at the end. */
const props = defineProps<{
  /** Events on the leg's day, nearest first. */
  candidates: EventWithTeams[]
  /** The slip's game, for "+ Novo evento «…»". */
  slipGame: string
  currentId: string | null
}>()

const emit = defineEmits<{ pick: [event: EventWithTeams]; new: [] }>()

const events = useEventsStore()
const searches = useLatestRequest()
const { t, intlLocale, message } = useLocale()

const query = ref('')
const found = ref<EventWithTeams[]>([])
const error = ref<string | null>(null)

async function search(text: string | undefined) {
  query.value = text ?? ''
  const isLatest = searches.start()
  error.value = null
  if (!query.value.trim()) {
    found.value = []
    return
  }
  try {
    const result = await events.search(query.value)
    if (isLatest()) found.value = result
  } catch (e) {
    if (!isLatest()) return
    found.value = []
    error.value = userMessage(e, 'slipImport.leg.searchFailed')
  }
}

const shown = computed(() => {
  const ids = new Set(props.candidates.map((event) => event.id))
  return [...props.candidates, ...found.value.filter((event) => !ids.has(event.id))]
})

const when = (event: EventWithTeams) =>
  dateTimeFormat(intlLocale.value, {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(event.kickoff_at))
</script>

<template>
  <div class="flex flex-col gap-2 rounded-xl border border-eb-border bg-eb-surface-2 p-2.5">
    <div class="relative">
      <AppIcon
        name="search"
        class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-eb-muted"
      />
      <InputText
        :model-value="query"
        :aria-label="t('slipImport.leg.searchEvents')"
        :placeholder="t('slipImport.leg.searchEvents')"
        autocomplete="off"
        class="min-h-11 w-full !pl-9"
        @update:model-value="search"
      />
    </div>
    <p v-if="candidates.length > 0 && !query" class="m-0 text-xs font-semibold text-eb-muted">
      {{ t('slipImport.leg.sameDay') }}
    </p>
    <ul class="m-0 flex list-none flex-col gap-1 p-0">
      <li v-for="event in shown" :key="event.id">
        <button
          type="button"
          class="flex min-h-11 w-full flex-col items-start rounded-lg px-2.5 py-1.5 text-left hover:bg-eb-surface"
          :class="event.id === currentId && 'bg-eb-accent-soft'"
          :aria-pressed="event.id === currentId"
          data-event-option
          @click="emit('pick', event)"
        >
          <span class="text-sm font-semibold">
            {{ event.home_team.name }} – {{ event.away_team.name }}
          </span>
          <span class="text-xs text-eb-muted">
            {{ [when(event), event.league?.name].filter(Boolean).join(' · ') }}
          </span>
        </button>
      </li>
    </ul>
    <p v-if="query && shown.length === 0 && !error" class="m-0 text-sm text-eb-muted">
      {{ t('slipImport.leg.noEvents') }}
    </p>
    <small v-if="error" class="text-eb-neg">{{ message(error) }}</small>
    <button
      type="button"
      class="inline-flex min-h-11 items-center gap-1 px-1 text-sm font-semibold text-eb-accent-text"
      data-new-event
      @click="emit('new')"
    >
      <AppIcon name="plus" class="size-4" stroke-width="2.5" />
      {{ t('slipImport.leg.newEventFrom', { name: slipGame }) }}
    </button>
  </div>
</template>
