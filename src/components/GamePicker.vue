<script setup lang="ts">
import { ref } from 'vue'
import AutoComplete, { type AutoCompleteCompleteEvent } from 'primevue/autocomplete'
import Button from 'primevue/button'
import AppIcon from './AppIcon.vue'
import InputText from 'primevue/inputtext'
import { LocalEventSource, type EventSearchResult, type EventSource } from '@/domain/eventSource'
import { suggestNames } from '@/domain/names'
import { emptyNewGame } from '@/domain/predictionDraft'
import type { NewGameForm } from '@/domain/schemas'
import { useLatestRequest } from '@/composables/useLatestRequest'
import { userMessage } from '@/lib/errors'
import { useEventsStore } from '@/stores/events'
import { useReferenceStore } from '@/stores/reference'

export type GamePickerErrors = Partial<Record<'game' | keyof NewGameForm, string>>

const props = defineProps<{
  errors: GamePickerErrors
  /** The selected game was kept after a save: shown as "Mesmo jogo". */
  kept: boolean
  /** Where games are searched; local events by default, an API-backed source in phase 5. */
  source?: EventSource
}>()

/** The chosen game; null while searching or creating one. */
const game = defineModel<EventSearchResult | null>('game', { required: true })
/** The "Novo jogo" fields; null while searching. */
const newGame = defineModel<NewGameForm | null>('newGame', { required: true })

const reference = useReferenceStore()
const source = props.source ?? new LocalEventSource(useEventsStore())

const query = ref<string | EventSearchResult>('')
const results = ref<EventSearchResult[]>([])
const searchError = ref<string | null>(null)
const leagueSuggestions = ref<string[]>([])
const teamSuggestions = ref<string[]>([])
const searches = useLatestRequest()

const kickoffFormat = new Intl.DateTimeFormat('pt-PT', {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

function label(result: EventSearchResult): string {
  return `${result.homeTeam} – ${result.awayTeam}`
}

function details(result: EventSearchResult): string {
  const kickoff = kickoffFormat.format(new Date(result.kickoffAt))
  return result.leagueName ? `${kickoff} · ${result.leagueName}` : kickoff
}

async function search(event: AutoCompleteCompleteEvent) {
  const isLatest = searches.start()
  searchError.value = null
  try {
    const found = await source.search(event.query)
    if (isLatest()) results.value = found
  } catch (e) {
    if (!isLatest()) return
    results.value = []
    searchError.value = userMessage(e, 'Não foi possível procurar jogos.')
  }
}

function pick(result: EventSearchResult) {
  game.value = result
  query.value = ''
}

function startNewGame() {
  const typed = typeof query.value === 'string' ? query.value.trim() : ''
  newGame.value = { ...emptyNewGame(), home: typed }
}

/** "Outro jogo" and "Procurar jogo existente": back to search. */
function clear() {
  game.value = null
  newGame.value = null
}

const completeLeague = (event: AutoCompleteCompleteEvent) =>
  (leagueSuggestions.value = suggestNames(
    reference.leagues.map((l) => l.name),
    event.query,
  ))
const completeTeam = (event: AutoCompleteCompleteEvent) =>
  (teamSuggestions.value = suggestNames(
    reference.teams.map((t) => t.name),
    event.query,
  ))
</script>

<template>
  <div v-if="game" class="rounded-2xl border-[1.5px] border-eb-accent bg-eb-surface p-3.5">
    <div class="flex items-center justify-between gap-3">
      <span
        v-if="kept"
        class="inline-flex items-center gap-1.5 rounded-full bg-eb-accent-soft px-2.5 py-1 text-xs font-bold text-eb-accent-text"
      >
        <AppIcon name="check" class="size-3.5" stroke-width="2.5" />
        Mesmo jogo
      </span>
      <span v-else class="text-xs font-semibold text-eb-muted">Jogo</span>
      <button
        type="button"
        class="min-h-11 shrink-0 px-1 text-sm font-semibold text-eb-accent-text"
        @click="clear"
      >
        Outro jogo
      </button>
    </div>
    <div class="text-[17px] font-bold break-words">{{ label(game) }}</div>
    <div class="mt-0.5 text-[13px] text-eb-muted">{{ details(game) }}</div>
  </div>

  <template v-else-if="!newGame">
    <label for="game" class="sr-only">Procurar jogo</label>
    <AutoComplete
      v-model="query"
      input-id="game"
      :suggestions="results"
      :option-label="label"
      placeholder="Procurar equipa (ex.: Benfica)"
      input-class="min-h-12 w-full"
      :invalid="!!(errors.game || searchError)"
      fluid
      @complete="search"
      @option-select="pick($event.value)"
    >
      <template #option="{ option }">
        <div class="flex flex-col">
          <span class="font-medium">{{ label(option) }}</span>
          <span class="text-sm text-eb-muted">{{ details(option) }}</span>
        </div>
      </template>
      <template #empty>
        <span class="text-sm text-eb-muted">Nenhum jogo encontrado.</span>
      </template>
    </AutoComplete>
    <small v-if="searchError || errors.game" class="text-eb-neg">
      {{ searchError ?? errors.game }}
    </small>
    <Button
      type="button"
      label="Novo jogo"
      text
      class="min-h-11 self-start"
      @click="startNewGame"
    />
  </template>

  <div v-else class="flex flex-col gap-3">
    <div class="grid grid-cols-2 gap-3">
      <div class="flex min-w-0 flex-col gap-1">
        <label for="new-date" class="text-[13px] font-semibold text-eb-muted">Data</label>
        <InputText
          id="new-date"
          v-model="newGame.date"
          type="date"
          class="min-h-12 w-full"
          :invalid="!!errors.date"
        />
      </div>
      <div class="flex min-w-0 flex-col gap-1">
        <label for="new-time" class="text-[13px] font-semibold text-eb-muted">Hora</label>
        <InputText
          id="new-time"
          v-model="newGame.time"
          type="time"
          class="min-h-12 w-full"
          :invalid="!!errors.time"
        />
      </div>
      <small v-if="errors.date || errors.time" class="col-span-2 text-eb-neg">
        {{ errors.date ?? errors.time }}
      </small>
    </div>
    <div class="flex flex-col gap-1">
      <label for="new-league" class="text-[13px] font-semibold text-eb-muted"
        >Liga (opcional)</label
      >
      <AutoComplete
        v-model="newGame.league"
        input-id="new-league"
        :suggestions="leagueSuggestions"
        input-class="min-h-12 w-full"
        fluid
        @complete="completeLeague"
      />
    </div>
    <div class="flex flex-col gap-1">
      <label for="new-home" class="text-[13px] font-semibold text-eb-muted">Equipa da casa</label>
      <AutoComplete
        v-model="newGame.home"
        input-id="new-home"
        :suggestions="teamSuggestions"
        input-class="min-h-12 w-full"
        :invalid="!!errors.home"
        fluid
        @complete="completeTeam"
      />
      <small v-if="errors.home" class="text-eb-neg">{{ errors.home }}</small>
    </div>
    <div class="flex flex-col gap-1">
      <label for="new-away" class="text-[13px] font-semibold text-eb-muted">Equipa de fora</label>
      <AutoComplete
        v-model="newGame.away"
        input-id="new-away"
        :suggestions="teamSuggestions"
        input-class="min-h-12 w-full"
        :invalid="!!errors.away"
        fluid
        @complete="completeTeam"
      />
      <small v-if="errors.away" class="text-eb-neg">{{ errors.away }}</small>
    </div>
    <Button
      type="button"
      label="Procurar jogo existente"
      text
      class="min-h-11 self-start"
      @click="clear"
    />
  </div>
</template>
