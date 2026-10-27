<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import PredictionRow from '@/components/PredictionRow.vue'
import { useSettlement } from '@/components/useSettlement'
import { scoreFormSchema } from '@/domain/schemas'
import { userMessage } from '@/lib/errors'
import { useEventsStore } from '@/stores/events'
import { usePredictionsStore } from '@/stores/predictions'
import { useSettingsStore } from '@/stores/settings'
import type { EventWithTeams, PredictionWithRelations } from '@/types/db'

const props = defineProps<{ id: string }>()

const events = useEventsStore()
const predictions = usePredictionsStore()
const settings = useSettingsStore()

const event = ref<EventWithTeams | null>(null)
const rows = ref<PredictionWithRelations[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const { saving, settle } = useSettlement(rows, error)

const score = ref({ home: '', away: '' })
const scoreError = ref<string | null>(null)
const savingScore = ref(false)

const kickoffFormat = new Intl.DateTimeFormat('pt-PT', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
})

const kickoff = computed(() =>
  event.value ? kickoffFormat.format(new Date(event.value.kickoff_at)) : '',
)
const hasScore = computed(() => event.value?.home_score != null && event.value.away_score != null)

function fillScore(e: EventWithTeams) {
  score.value = { home: e.home_score?.toString() ?? '', away: e.away_score?.toString() ?? '' }
}

let request = 0
async function load() {
  const current = ++request
  loading.value = true
  error.value = null
  event.value = null
  rows.value = []
  try {
    const found = await events.getById(props.id)
    if (current !== request) return
    if (found) {
      const [list] = await Promise.all([predictions.listByEvent(found.id), settings.ensureLoaded()])
      if (current !== request) return
      rows.value = list
      fillScore(found)
    }
    event.value = found
  } catch (e) {
    if (current !== request) return
    error.value = userMessage(e, 'Não foi possível carregar o jogo.')
  } finally {
    if (current === request) loading.value = false
  }
}

watch(() => props.id, load, { immediate: true })

async function saveScore() {
  if (!event.value) return
  scoreError.value = null
  const parsed = scoreFormSchema.safeParse(score.value)
  if (!parsed.success) {
    scoreError.value = parsed.error.issues[0]?.message ?? 'Resultado inválido'
    return
  }
  savingScore.value = true
  try {
    event.value = await events.setScore(event.value.id, parsed.data)
    fillScore(event.value)
  } catch (e) {
    scoreError.value = userMessage(e, 'Não foi possível guardar o resultado.')
  } finally {
    savingScore.value = false
  }
}
</script>

<template>
  <div class="mx-auto flex max-w-3xl flex-col gap-4">
    <p v-if="loading" class="text-center text-surface-500">A carregar…</p>

    <Message v-else-if="error && !event" severity="error">{{ error }}</Message>

    <section
      v-else-if="!event"
      class="flex flex-col items-center gap-3 rounded-xl border border-surface-200 bg-surface-0 p-8 text-center"
    >
      <h1 class="m-0 text-xl font-semibold">Jogo não encontrado</h1>
      <p class="m-0 text-surface-600">Este jogo não existe ou foi apagado.</p>
      <RouterLink
        :to="{ name: 'today' }"
        class="inline-flex min-h-11 items-center rounded-lg px-4 font-medium text-primary-700 hover:bg-primary-50"
      >
        Voltar a hoje
      </RouterLink>
    </section>

    <template v-else>
      <header class="flex flex-col gap-1 rounded-xl border border-surface-200 bg-surface-0 p-4">
        <span class="text-sm text-surface-500">
          <template v-if="event.league">{{ event.league.name }} · </template>
          <span class="first-letter:uppercase">{{ kickoff }}</span>
        </span>
        <h1 class="m-0 flex flex-wrap items-baseline gap-x-3 text-2xl font-semibold">
          <span>{{ event.home_team.name }}</span>
          <span v-if="hasScore" class="tabular-nums">
            {{ event.home_score }} – {{ event.away_score }}
          </span>
          <span v-else class="text-surface-400" aria-hidden="true">vs</span>
          <span>{{ event.away_team.name }}</span>
        </h1>
      </header>

      <section class="flex flex-col gap-3 rounded-xl border border-surface-200 bg-surface-0 p-4">
        <h2 class="m-0 text-lg font-semibold">Resultado</h2>
        <form class="flex flex-wrap items-end gap-3" novalidate @submit.prevent="saveScore">
          <div class="flex flex-col gap-1">
            <label for="home-score" class="text-sm font-medium">{{ event.home_team.name }}</label>
            <InputText
              id="home-score"
              v-model="score.home"
              inputmode="numeric"
              autocomplete="off"
              maxlength="2"
              class="min-h-11 w-20 text-center text-lg"
              :invalid="!!scoreError"
            />
          </div>
          <span class="pb-2.5 text-surface-400" aria-hidden="true">–</span>
          <div class="flex flex-col gap-1">
            <label for="away-score" class="text-sm font-medium">{{ event.away_team.name }}</label>
            <InputText
              id="away-score"
              v-model="score.away"
              inputmode="numeric"
              autocomplete="off"
              maxlength="2"
              class="min-h-11 w-20 text-center text-lg"
              :invalid="!!scoreError"
            />
          </div>
          <Button type="submit" label="Guardar resultado" :loading="savingScore" class="min-h-11" />
        </form>
        <small v-if="scoreError" class="text-red-600">{{ scoreError }}</small>
      </section>

      <section class="rounded-xl border border-surface-200 bg-surface-0">
        <div
          class="flex flex-wrap items-center justify-between gap-2 border-b border-surface-200 px-4 py-2.5"
        >
          <h2 class="m-0 text-lg font-semibold">Os teus prognósticos neste jogo</h2>
          <RouterLink
            :to="{ name: 'predictions', query: { evento: event.id } }"
            class="inline-flex min-h-11 items-center rounded-lg px-3 font-medium text-primary-700 hover:bg-primary-50"
          >
            + Registar prognóstico
          </RouterLink>
        </div>
        <Message v-if="error" severity="error" class="m-4">{{ error }}</Message>
        <p v-if="!rows.length" class="m-0 p-4 text-surface-600">
          Ainda não tens prognósticos neste jogo.
        </p>
        <div v-else class="divide-y divide-surface-100 px-4">
          <PredictionRow
            v-for="prediction in rows"
            :key="prediction.id"
            :prediction="prediction"
            :unit-value="settings.unitValue"
            :busy="saving.has(prediction.id)"
            @settle="settle(prediction, $event)"
          />
        </div>
      </section>

      <!--
        Reserved for the Game Analyser (phase 6, docs/specs/future-integrations.md): API stats,
        AI summary and news for this game. Empty until then; shows nothing to the user.
      -->
      <section aria-hidden="true" data-slot="game-analyser" />
    </template>
  </div>
</template>
