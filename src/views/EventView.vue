<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import AppIcon from '@/components/AppIcon.vue'
import PredictionRow from '@/components/PredictionRow.vue'
import { useLatestRequest } from '@/composables/useLatestRequest'
import { useLocale } from '@/composables/useLocale'
import { useSettlement } from '@/composables/useSettlement'
import { shortDayLabel } from '@/domain/days'
import { formatTime } from '@/domain/intl'
import { scoreFormSchema, toScoreForm, type ScoreForm } from '@/domain/schemas'
import { userMessage } from '@/lib/errors'
import { useEventsStore } from '@/stores/events'
import { usePredictionsStore } from '@/stores/predictions'
import { useSettingsStore } from '@/stores/settings'
import type { EventWithTeams, PredictionWithRelations } from '@/types/db'

const props = defineProps<{ id: string }>()

const events = useEventsStore()
const predictions = usePredictionsStore()
const settings = useSettingsStore()
const { t, intlLocale, message } = useLocale()

const event = ref<EventWithTeams | null>(null)
const rows = ref<PredictionWithRelations[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const settlement = useSettlement(rows)
const { saving, settle, error: settleError } = settlement

const score = ref<ScoreForm>({ home: '', away: '' })
const scoreError = ref<string | null>(null)
const savingScore = ref(false)

/** `ter, 27 out · 20:15` */
const kickoff = computed(() => {
  if (!event.value) return ''
  const date = new Date(event.value.kickoff_at)
  return `${shortDayLabel(date, intlLocale.value)} · ${formatTime(date, intlLocale.value)}`
})
const hasScore = computed(() => event.value?.home_score != null && event.value.away_score != null)
const settled = computed(() => rows.value.filter((p) => p.status !== 'pending').length)

const loads = useLatestRequest()
async function load() {
  const isLatest = loads.start()
  settlement.reset()
  loading.value = true
  error.value = null
  scoreError.value = null
  savingScore.value = false
  event.value = null
  rows.value = []
  try {
    const found = await events.getById(props.id)
    if (!isLatest()) return
    if (found) {
      const [list] = await Promise.all([predictions.listByEvent(found.id), settings.ensureLoaded()])
      if (!isLatest()) return
      rows.value = list
      score.value = toScoreForm(found)
    }
    event.value = found
  } catch (e) {
    if (!isLatest()) return
    error.value = userMessage(e, 'event.loadFailed')
  } finally {
    if (isLatest()) loading.value = false
  }
}

watch(() => props.id, load, { immediate: true })

async function saveScore() {
  if (!event.value) return
  scoreError.value = null
  const parsed = scoreFormSchema.safeParse(score.value)
  if (!parsed.success) {
    scoreError.value = parsed.error.issues[0]?.message ?? 'event.invalidScore'
    return
  }
  const id = event.value.id
  // A save that ends after the screen moved to another game must not touch it.
  const isSameGame = () => event.value?.id === id
  savingScore.value = true
  try {
    const saved = await events.setScore(id, parsed.data)
    if (!isSameGame()) return
    event.value = saved
    score.value = toScoreForm(saved)
  } catch (e) {
    if (isSameGame()) scoreError.value = userMessage(e, 'event.saveScoreFailed')
  } finally {
    if (isSameGame()) savingScore.value = false
  }
}
</script>

<template>
  <div class="mx-auto flex max-w-3xl flex-col gap-3.5 tabular-nums lg:max-w-[1200px]">
    <RouterLink
      :to="{ name: 'today' }"
      class="-mt-2 flex min-h-11 items-center gap-1 self-start text-[15px] font-semibold text-eb-accent-text"
    >
      <AppIcon name="chevron-left" class="size-[18px]" />
      {{ t('app.nav.today') }}
    </RouterLink>

    <p v-if="loading" class="text-center text-eb-muted">{{ t('common.loading') }}</p>

    <Message v-else-if="error" severity="error">{{ message(error) }}</Message>

    <section
      v-else-if="!event"
      class="flex flex-col items-center gap-3 rounded-2xl border border-eb-border bg-eb-surface p-8 text-center"
    >
      <h1 class="m-0 text-xl font-bold">{{ t('event.notFound') }}</h1>
      <p class="m-0 text-eb-muted">{{ t('event.notFoundText') }}</p>
      <RouterLink
        :to="{ name: 'today' }"
        class="inline-flex min-h-11 items-center rounded-xl px-4 font-semibold text-eb-accent-text hover:bg-eb-accent-soft"
      >
        {{ t('common.backToToday') }}
      </RouterLink>
    </section>

    <!--
      Phone: one column. Desktop: the game and the analysis on the left (340px), the predictions on
      the right; the second row takes the extra height so the analysis stays under the game.
    -->
    <div
      v-else
      class="flex flex-col gap-3.5 lg:grid lg:grid-cols-[minmax(0,340px)_minmax(0,1fr)] lg:grid-rows-[auto_1fr] lg:items-start lg:gap-x-5 lg:gap-y-3.5"
    >
      <section
        class="rounded-2xl border border-eb-border bg-eb-surface px-4 py-[18px] lg:col-start-1 lg:row-start-1 lg:p-5"
      >
        <div class="flex flex-wrap justify-between gap-x-3 text-[13px] text-eb-muted">
          <span class="font-semibold">{{ event.league?.name }}</span>
          <span>{{ kickoff }}</span>
        </div>
        <h1
          class="m-0 mt-4 grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-3 text-lg font-bold"
        >
          <span class="text-right break-words">{{ event.home_team.name }}</span>
          <span
            v-if="hasScore"
            class="rounded-xl bg-eb-surface-2 px-3 py-1.5 text-[26px] tracking-wide"
          >
            {{ event.home_score }} – {{ event.away_score }}
          </span>
          <span v-else class="px-1 text-base font-semibold text-eb-muted">{{ t('event.vs') }}</span>
          <span class="break-words">{{ event.away_team.name }}</span>
        </h1>

        <form
          class="mt-[18px] flex flex-wrap items-end gap-2 border-t border-eb-border pt-3.5"
          :aria-label="t('event.result')"
          novalidate
          @submit.prevent="saveScore"
        >
          <div class="flex flex-col gap-1.5">
            <label for="home-score" class="text-[13px] font-semibold text-eb-muted">
              {{ t('event.home') }}<span class="sr-only"> ({{ event.home_team.name }})</span>
            </label>
            <InputText
              id="home-score"
              v-model="score.home"
              inputmode="numeric"
              autocomplete="off"
              maxlength="2"
              class="min-h-11 w-14 text-center text-lg font-bold"
              :invalid="!!scoreError"
            />
          </div>
          <span class="flex h-11 items-center text-eb-muted" aria-hidden="true">–</span>
          <div class="flex flex-col gap-1.5">
            <label for="away-score" class="text-[13px] font-semibold text-eb-muted">
              {{ t('event.away') }}<span class="sr-only"> ({{ event.away_team.name }})</span>
            </label>
            <InputText
              id="away-score"
              v-model="score.away"
              inputmode="numeric"
              autocomplete="off"
              maxlength="2"
              class="min-h-11 w-14 text-center text-lg font-bold"
              :invalid="!!scoreError"
            />
          </div>
          <button
            type="submit"
            class="ml-auto min-h-11 rounded-[10px] border border-eb-border bg-eb-surface-2 px-4 text-sm font-semibold text-eb-text hover:border-eb-muted disabled:opacity-60"
            :disabled="savingScore"
          >
            {{ savingScore ? t('common.saving') : t('event.saveScore') }}
          </button>
        </form>
        <small v-if="scoreError" class="mt-2 block text-eb-neg">{{ message(scoreError) }}</small>
      </section>

      <section
        class="contents lg:col-start-2 lg:row-[1/span_2] lg:flex lg:min-w-0 lg:flex-col lg:gap-3"
        data-column="predictions"
      >
        <div class="mt-1 flex items-baseline justify-between gap-3 lg:mt-0 lg:items-center">
          <div class="contents lg:flex lg:items-baseline lg:gap-2.5">
            <h2 class="m-0 text-[17px] font-bold lg:text-lg">{{ t('common.predictions') }}</h2>
            <span v-if="rows.length" class="text-[13px] text-eb-muted">
              {{ t('event.settledCount', { count: rows.length, settled }) }}
            </span>
          </div>
          <RouterLink
            :to="{ name: 'predictions', query: { evento: event.id } }"
            class="hidden min-h-11 shrink-0 items-center gap-2 rounded-xl border-[1.5px] border-dashed border-eb-accent px-4 text-sm font-semibold text-eb-accent-text hover:bg-eb-accent-soft lg:flex"
            data-new-prediction="desktop"
          >
            <AppIcon name="plus" class="size-4" stroke-width="2.5" />
            {{ t('common.newPrediction') }}
          </RouterLink>
        </div>

        <Message v-if="settleError" severity="error">{{ message(settleError) }}</Message>
        <p
          v-if="!rows.length"
          class="m-0 rounded-2xl border border-eb-border bg-eb-surface p-4 text-eb-muted"
        >
          {{ t('event.empty') }}
        </p>
        <div
          v-else
          class="divide-y divide-eb-border overflow-hidden rounded-2xl border border-eb-border bg-eb-surface"
        >
          <PredictionRow
            v-for="prediction in rows"
            :key="prediction.id"
            :prediction="prediction"
            :unit-value="settings.unitValue"
            :money-display="settings.moneyDisplay"
            layout="line"
            :busy="saving.has(prediction.id)"
            @settle="settle(prediction, $event)"
          />
        </div>

        <RouterLink
          :to="{ name: 'predictions', query: { evento: event.id } }"
          class="flex min-h-12 items-center justify-center gap-2 rounded-xl border-[1.5px] border-dashed border-eb-accent text-[15px] font-semibold text-eb-accent-text hover:bg-eb-accent-soft lg:hidden"
          data-new-prediction="phone"
        >
          <AppIcon name="plus" class="size-4" stroke-width="2.5" />
          {{ t('common.newPrediction') }}
        </RouterLink>
      </section>

      <!--
        Reserved for the Game Analyser (phase 6, docs/specs/future-integrations.md): API stats,
        AI summary and news for this game. A placeholder card until then.
      -->
      <section
        data-slot="game-analyser"
        class="mt-1.5 flex flex-col gap-2.5 rounded-2xl border border-dashed border-eb-border p-4 lg:col-start-1 lg:row-start-2 lg:mt-0"
      >
        <div class="flex items-center justify-between gap-3">
          <h2 class="m-0 text-[17px] font-bold">{{ t('event.analyser.title') }}</h2>
          <span
            class="rounded-full bg-eb-surface-2 px-2 py-0.5 text-xs font-semibold text-eb-muted"
          >
            {{ t('event.analyser.soon') }}
          </span>
        </div>
        <p class="m-0 text-sm leading-snug text-eb-muted">
          {{ t('event.analyser.text') }}
        </p>
        <div class="grid grid-cols-3 gap-2" aria-hidden="true">
          <div class="h-14 rounded-[10px] bg-eb-surface-2" />
          <div class="h-14 rounded-[10px] bg-eb-surface-2" />
          <div class="h-14 rounded-[10px] bg-eb-surface-2" />
        </div>
      </section>
    </div>
  </div>
</template>
