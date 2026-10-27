<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import Message from 'primevue/message'
import PredictionRow from '@/components/PredictionRow.vue'
import { profitClass } from '@/components/profitClass'
import { useSettlement } from '@/components/useSettlement'
import { daySummary, groupByEvent } from '@/domain/daySummary'
import { addDays, fromDayKey, startOfDay, toDayKey } from '@/domain/days'
import { formatMoney } from '@/domain/money'
import { userMessage } from '@/lib/errors'
import { usePredictionsStore } from '@/stores/predictions'
import { useSettingsStore } from '@/stores/settings'
import type { PredictionWithRelations } from '@/types/db'

const route = useRoute()
const router = useRouter()
const predictions = usePredictionsStore()
const settings = useSettingsStore()

const rows = ref<PredictionWithRelations[]>([])
const pendingBefore = ref<PredictionWithRelations[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const { saving, settle } = useSettlement(rows, error)

/** Today's local midnight; moves on at midnight so a screen left open follows the date. */
const today = ref(startOfDay(new Date()))
function checkDate() {
  const now = startOfDay(new Date())
  if (now.getTime() !== today.value.getTime()) today.value = now
}
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => {
  timer = setInterval(checkDate, 60_000)
  document.addEventListener('visibilitychange', checkDate)
})
onUnmounted(() => {
  clearInterval(timer)
  document.removeEventListener('visibilitychange', checkDate)
})

const todayKey = computed(() => toDayKey(today.value))

/** Selected day from `?dia=YYYY-MM-DD`; today when missing or invalid. */
const dayKey = computed(() => {
  const raw = route.query.dia
  return typeof raw === 'string' && fromDayKey(raw) ? raw : todayKey.value
})
const day = computed(() => fromDayKey(dayKey.value) as Date)
const isToday = computed(() => dayKey.value === todayKey.value)

/** Earlier pending predictions are counted before the selected day, never past today. */
const pendingCutoff = computed(() => (day.value < today.value ? day.value : today.value))

const longDate = new Intl.DateTimeFormat('pt-PT', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
})
const time = new Intl.DateTimeFormat('pt-PT', { hour: '2-digit', minute: '2-digit' })
const percent = new Intl.NumberFormat('pt-PT', { style: 'percent', maximumFractionDigits: 0 })

const relativeLabel = computed(() => {
  if (isToday.value) return 'Hoje'
  if (dayKey.value === toDayKey(addDays(today.value, -1))) return 'Ontem'
  if (dayKey.value === toDayKey(addDays(today.value, 1))) return 'Amanhã'
  return null
})

const groups = computed(() =>
  groupByEvent(rows.value).map((group) => ({
    ...group,
    event: group.predictions[0]!.event,
  })),
)

const summary = computed(() => daySummary(rows.value))

function goTo(key: string) {
  router.push({ name: 'today', query: key === todayKey.value ? {} : { dia: key } })
}

function shift(days: number) {
  goTo(toDayKey(addDays(day.value, days)))
}

function pick(event: Event) {
  const key = (event.target as HTMLInputElement).value
  if (fromDayKey(key)) goTo(key)
}

function openPicker(event: Event) {
  const input = event.target as HTMLInputElement
  try {
    input.showPicker?.()
  } catch {
    // Some browsers only allow it on a direct user gesture; the native control still works.
  }
}

function jumpToOldestPending() {
  const oldest = pendingBefore.value[0]
  if (oldest) goTo(toDayKey(new Date(oldest.event.kickoff_at)))
}

let request = 0
async function load() {
  const current = ++request
  loading.value = true
  error.value = null
  rows.value = []
  pendingBefore.value = []
  try {
    const [dayRows, pending] = await Promise.all([
      predictions.listByDate(day.value),
      predictions.listPendingBefore(pendingCutoff.value),
      settings.ensureLoaded(),
    ])
    if (current !== request) return
    rows.value = dayRows
    pendingBefore.value = pending
  } catch (e) {
    if (current !== request) return
    error.value = userMessage(e, 'Não foi possível carregar os prognósticos.')
  } finally {
    if (current === request) loading.value = false
  }
}

watch([dayKey, todayKey], load, { immediate: true })

// A malformed `?dia` shows today; drop it from the URL too.
watch(
  () => route.query.dia,
  (raw) => {
    if (raw != null && !(typeof raw === 'string' && fromDayKey(raw))) {
      router.replace({ name: 'today', query: {} })
    }
  },
  { immediate: true },
)
</script>

<template>
  <div class="mx-auto flex max-w-3xl flex-col gap-4">
    <div class="flex items-center gap-2">
      <Button text rounded aria-label="Dia anterior" class="size-11 shrink-0" @click="shift(-1)">
        <span aria-hidden="true" class="text-xl">‹</span>
      </Button>
      <label
        class="relative flex min-h-11 flex-1 cursor-pointer flex-col items-center justify-center"
      >
        <span class="text-lg font-semibold leading-tight first-letter:uppercase">
          {{ relativeLabel ?? longDate.format(day) }}
        </span>
        <span v-if="relativeLabel" class="text-sm text-surface-600">
          {{ longDate.format(day) }}
        </span>
        <input
          type="date"
          :value="dayKey"
          aria-label="Escolher dia"
          class="absolute inset-0 cursor-pointer opacity-0"
          @click="openPicker"
          @change="pick"
        />
      </label>
      <Button text rounded aria-label="Dia seguinte" class="size-11 shrink-0" @click="shift(1)">
        <span aria-hidden="true" class="text-xl">›</span>
      </Button>
    </div>
    <div v-if="!isToday" class="-mt-2 text-center">
      <button
        type="button"
        class="min-h-11 rounded-lg px-3 text-sm font-medium text-primary-700 hover:bg-primary-50"
        @click="goTo(todayKey)"
      >
        Voltar a hoje
      </button>
    </div>

    <button
      v-if="pendingBefore.length"
      type="button"
      class="flex min-h-11 items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-left text-amber-900"
      @click="jumpToOldestPending"
    >
      <span>
        <strong>Pendentes de dias anteriores:</strong>
        {{ pendingBefore.length }}
      </span>
      <span class="text-sm font-medium underline">Ver o mais antigo</span>
    </button>

    <section
      v-if="summary.total"
      class="grid grid-cols-2 gap-3 rounded-xl border border-surface-200 bg-surface-0 p-4 sm:grid-cols-4"
      aria-label="Resumo do dia"
    >
      <div>
        <div class="text-xs text-surface-500">Prognósticos</div>
        <div class="text-lg font-semibold tabular-nums">{{ summary.total }}</div>
      </div>
      <div>
        <div class="text-xs text-surface-500">Liquidados</div>
        <div class="text-lg font-semibold tabular-nums">
          {{ summary.settled }}/{{ summary.total }}
        </div>
      </div>
      <div>
        <div class="text-xs text-surface-500">Taxa de acerto</div>
        <div class="text-lg font-semibold tabular-nums">
          {{ summary.hitRate == null ? '—' : percent.format(summary.hitRate) }}
        </div>
      </div>
      <div>
        <div class="text-xs text-surface-500">P/L punter</div>
        <div class="font-semibold tabular-nums" :class="profitClass(summary.punterProfit)">
          {{ summary.punterBets ? formatMoney(summary.punterProfit, settings.unitValue) : '—' }}
        </div>
      </div>
    </section>

    <Message v-if="error" severity="error">{{ error }}</Message>

    <p v-if="loading" class="text-center text-surface-500">A carregar…</p>

    <section
      v-else-if="!groups.length && !error"
      class="flex flex-col items-center gap-3 rounded-xl border border-surface-200 bg-surface-0 p-8 text-center"
    >
      <p class="m-0 text-surface-600">Sem prognósticos neste dia.</p>
      <RouterLink
        :to="{ name: 'predictions' }"
        class="inline-flex min-h-11 items-center rounded-lg bg-primary px-4 font-medium text-primary-contrast"
      >
        Registar prognóstico
      </RouterLink>
    </section>

    <section
      v-for="group in groups"
      v-else
      :key="group.eventId"
      class="rounded-xl border border-surface-200 bg-surface-0"
    >
      <RouterLink
        :to="{ name: 'event', params: { id: group.eventId } }"
        class="flex min-h-11 flex-wrap items-baseline gap-x-3 gap-y-0.5 rounded-t-xl border-b border-surface-200 px-4 py-2.5 text-surface-900 hover:bg-surface-50"
      >
        <span class="font-semibold tabular-nums">
          {{ time.format(new Date(group.event.kickoff_at)) }}
        </span>
        <span class="font-semibold">
          {{ group.event.home_team.name }} – {{ group.event.away_team.name }}
        </span>
        <span v-if="group.event.league" class="text-sm text-surface-500">
          {{ group.event.league.name }}
        </span>
      </RouterLink>
      <div class="divide-y divide-surface-100 px-4">
        <PredictionRow
          v-for="prediction in group.predictions"
          :key="prediction.id"
          :prediction="prediction"
          :unit-value="settings.unitValue"
          :busy="saving.has(prediction.id)"
          @settle="settle(prediction, $event)"
        />
      </div>
    </section>
  </div>
</template>
