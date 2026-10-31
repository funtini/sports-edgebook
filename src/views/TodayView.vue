<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { RouterLink, useRoute, useRouter } from 'vue-router'
import Message from 'primevue/message'
import AppIcon from '@/components/AppIcon.vue'
import PredictionRow from '@/components/PredictionRow.vue'
import { profitClass } from '@/components/profitClass'
import { useKeyShortcut } from '@/composables/useKeyShortcut'
import { useLatestRequest } from '@/composables/useLatestRequest'
import { useLocale } from '@/composables/useLocale'
import { useSettlement } from '@/composables/useSettlement'
import { daySummary, groupByEvent } from '@/domain/daySummary'
import { addDays, fromDayKey, shortDayLabel, startOfDay, toDayKey } from '@/domain/days'
import { formatPercent, formatTime } from '@/domain/intl'
import { formatMoney } from '@/domain/money'
import { dayMultiples } from '@/domain/savedMultiples'
import { userMessage } from '@/lib/errors'
import { useMultiplesStore } from '@/stores/multiples'
import { usePredictionsStore } from '@/stores/predictions'
import { useSettingsStore } from '@/stores/settings'
import type { PredictionWithRelations, SavedMultiple } from '@/types/db'

const route = useRoute()
const router = useRouter()
const predictions = usePredictionsStore()
const multiples = useMultiplesStore()
const settings = useSettingsStore()
const { t, intlLocale, message } = useLocale()

const rows = ref<PredictionWithRelations[]>([])
const pendingBefore = ref<PredictionWithRelations[]>([])
/** Placed multiples, for "Múltiplas do dia"; empty if they fail to load. */
const placedMultiples = ref<SavedMultiple[]>([])
const loading = ref(true)
const error = ref<string | null>(null)
const settlement = useSettlement(rows)
const { saving, settle, error: settleError } = settlement

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

const relativeLabel = computed(() => {
  if (isToday.value) return t('today.today')
  if (dayKey.value === toDayKey(addDays(today.value, -1))) return t('today.yesterday')
  if (dayKey.value === toDayKey(addDays(today.value, 1))) return t('today.tomorrow')
  return null
})

/** `Hoje · ter, 27 out`, or just `qua, 4 nov` away from today and its neighbours. */
const dayLabel = computed(() => {
  const date = shortDayLabel(day.value, intlLocale.value)
  return relativeLabel.value ? `${relativeLabel.value} · ${date}` : date
})

const groups = computed(() =>
  groupByEvent(rows.value).map((group) => ({
    ...group,
    event: group.predictions[0]!.event,
  })),
)

const summary = computed(() => daySummary(rows.value))
const multiplesOfDay = computed(() => dayMultiples(placedMultiples.value, dayKey.value))

const money = (units: number, signed = true) =>
  formatMoney(units, settings.unitValue, settings.moneyDisplay, { signed }, intlLocale.value)

const tiles = computed(() => {
  const s = summary.value
  return [
    {
      key: 'staked',
      label: t('today.staked'),
      value: s.punterBets ? money(s.punterStaked, false) : '—',
      class: s.punterBets ? 'text-eb-info' : 'text-eb-muted',
    },
    { key: 'predictions', label: t('common.predictions'), value: String(s.total), class: '' },
    {
      key: 'won',
      label: t('today.won'),
      value: String(s.won),
      class: s.won > 0 ? 'text-eb-pos' : '',
    },
    {
      key: 'hitRate',
      label: t('today.hitRate'),
      value: s.hitRate == null ? '—' : formatPercent(s.hitRate, intlLocale.value),
      class: '',
    },
    {
      key: 'open',
      label: t('today.open'),
      value: String(s.open),
      class: s.open > 0 ? 'text-eb-amber' : '',
    },
  ]
})

/** "2 apostadas · +1,50", or "Por resolver" until one is settled. */
const multiplesLine = computed(() => {
  const m = multiplesOfDay.value
  return {
    count: t('today.multiplesCount', m.count),
    result: m.settled ? money(m.profit) : t('predictionRow.result.pending'),
    class: m.settled ? profitClass(m.profit) : 'text-eb-muted',
  }
})

const staked = computed(() => {
  const amount = money(summary.value.punterStaked, false)
  return t(settings.moneyDisplay === 'euros' ? 'today.stakedEuros' : 'today.stakedUnits', {
    amount,
  })
})

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

useKeyShortcut('n', () => router.push({ name: 'predictions' }))

function jumpToOldestPending() {
  const oldest = pendingBefore.value[0]
  if (oldest) goTo(toDayKey(new Date(oldest.event.kickoff_at)))
}

const loads = useLatestRequest()
async function load() {
  const isLatest = loads.start()
  settlement.reset()
  loading.value = true
  error.value = null
  rows.value = []
  pendingBefore.value = []
  placedMultiples.value = []
  try {
    const [dayRows, pending, placed] = await Promise.all([
      predictions.listByDate(day.value),
      predictions.listPendingBefore(pendingCutoff.value),
      multiples.list({ placedOnly: true }).catch(() => []),
      settings.ensureLoaded(),
    ])
    if (!isLatest()) return
    rows.value = dayRows
    pendingBefore.value = pending
    placedMultiples.value = placed
  } catch (e) {
    if (!isLatest()) return
    error.value = userMessage(e, 'today.loadFailed')
  } finally {
    if (isLatest()) loading.value = false
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
  <div class="mx-auto flex max-w-3xl flex-col gap-3 tabular-nums lg:max-w-[1200px]">
    <div class="flex items-center gap-2 lg:justify-center">
      <button
        type="button"
        :aria-label="t('today.previousDay')"
        class="flex size-11 shrink-0 items-center justify-center rounded-xl border border-eb-border bg-eb-surface text-eb-text hover:bg-eb-surface-2"
        @click="shift(-1)"
      >
        <AppIcon name="chevron-left" class="size-[18px]" />
      </button>
      <label
        class="relative flex min-h-11 min-w-0 flex-1 cursor-pointer lg:min-w-[260px] lg:flex-none items-center justify-center gap-2 rounded-xl border border-eb-border bg-eb-surface px-2 text-[15px] font-semibold hover:bg-eb-surface-2"
      >
        <AppIcon name="calendar" class="size-4 shrink-0" />
        <span class="truncate">{{ dayLabel }}</span>
        <input
          type="date"
          :value="dayKey"
          :aria-label="t('today.pickDay')"
          class="absolute inset-0 cursor-pointer opacity-0"
          @click="openPicker"
          @change="pick"
        />
      </label>
      <button
        type="button"
        :aria-label="t('today.nextDay')"
        class="flex size-11 shrink-0 items-center justify-center rounded-xl border border-eb-border bg-eb-surface text-eb-text hover:bg-eb-surface-2"
        @click="shift(1)"
      >
        <AppIcon name="chevron-right" class="size-[18px]" />
      </button>
    </div>
    <div v-if="!isToday" class="-my-1 text-center">
      <button
        type="button"
        class="min-h-11 rounded-xl px-3 text-sm font-semibold text-eb-accent-text hover:bg-eb-accent-soft"
        @click="goTo(todayKey)"
      >
        {{ t('common.backToToday') }}
      </button>
    </div>

    <section
      v-if="summary.total"
      class="rounded-2xl border border-eb-border bg-eb-surface p-4 lg:hidden"
      :aria-label="t('today.summary')"
    >
      <div class="flex items-baseline justify-between gap-3 text-[13px] text-eb-muted">
        <span class="font-semibold">{{ t('today.punterProfit') }}</span>
        <span>{{ t('today.settledOf', { settled: summary.settled, total: summary.total }) }}</span>
      </div>
      <div class="mt-1 flex flex-wrap items-baseline gap-x-2.5">
        <span
          class="text-[32px] font-bold tracking-tight"
          :class="summary.punterBets ? profitClass(summary.punterProfit) : 'text-eb-muted'"
        >
          {{ summary.punterBets ? money(summary.punterProfit) : '—' }}
        </span>
        <span v-if="summary.punterBets" class="text-[13px] text-eb-muted">{{ staked }}</span>
      </div>
      <div class="mt-3.5 grid grid-cols-3 gap-2">
        <div class="min-w-0 rounded-xl bg-eb-surface-2 p-2.5">
          <div class="text-xs text-eb-muted">{{ t('common.predictions') }}</div>
          <div class="mt-0.5 text-lg font-bold">{{ summary.total }}</div>
        </div>
        <div class="min-w-0 rounded-xl bg-eb-surface-2 p-2.5">
          <div class="text-xs text-eb-muted">{{ t('today.hitRate') }}</div>
          <div class="mt-0.5 text-lg font-bold">
            {{ summary.hitRate == null ? '—' : formatPercent(summary.hitRate, intlLocale) }}
          </div>
        </div>
        <div class="min-w-0 rounded-xl bg-eb-surface-2 p-2.5">
          <div class="text-xs text-eb-muted">{{ t('today.open') }}</div>
          <div class="mt-0.5 text-lg font-bold">{{ summary.total - summary.settled }}</div>
        </div>
      </div>
      <RouterLink
        v-if="multiplesOfDay.count"
        :to="{ name: 'multiples', query: { vista: 'guardadas' } }"
        class="mt-2.5 -mb-1.5 flex min-h-11 items-center gap-2 rounded-xl px-1 text-[13px] text-eb-muted hover:bg-eb-surface-2"
        data-day-multiples
      >
        <AppIcon name="layers" class="size-4 shrink-0" />
        <span class="font-semibold text-eb-text">{{ t('today.multiples') }}</span>
        <span>· {{ multiplesLine.count }} ·</span>
        <span class="font-bold" :class="multiplesLine.class">{{ multiplesLine.result }}</span>
        <AppIcon name="chevron-right" class="ml-auto size-4 shrink-0" />
      </RouterLink>
    </section>

    <section
      v-if="summary.total"
      class="hidden items-center gap-6 rounded-2xl border border-eb-border bg-eb-surface p-5 lg:flex"
      :aria-label="t('today.summary')"
      data-summary="strip"
    >
      <div class="min-w-48 shrink-0">
        <div class="text-[13px] font-semibold text-eb-muted">{{ t('today.punterProfit') }}</div>
        <div
          class="text-[34px] leading-tight font-bold tracking-tight"
          :class="summary.punterBets ? profitClass(summary.punterProfit) : 'text-eb-muted'"
        >
          {{ summary.punterBets ? money(summary.punterProfit) : '—' }}
        </div>
        <div class="text-[13px] text-eb-muted">
          {{ t('today.settledOf', { settled: summary.settled, total: summary.total }) }}
        </div>
        <RouterLink
          v-if="multiplesOfDay.count"
          :to="{ name: 'multiples', query: { vista: 'guardadas' } }"
          class="-mx-1 mt-1 flex min-h-11 items-center gap-2 rounded-xl px-1 text-[13px] text-eb-muted hover:bg-eb-surface-2"
          data-day-multiples
        >
          <AppIcon name="layers" class="size-4 shrink-0" />
          <span class="font-semibold text-eb-text">{{ t('today.multiples') }}</span>
          <span>· {{ multiplesLine.count }} ·</span>
          <span class="font-bold" :class="multiplesLine.class">{{ multiplesLine.result }}</span>
          <AppIcon name="chevron-right" class="ml-auto size-4 shrink-0" />
        </RouterLink>
      </div>
      <div class="w-px self-stretch bg-eb-border" aria-hidden="true"></div>
      <div class="grid min-w-0 flex-1 grid-cols-5 gap-2">
        <div
          v-for="tile in tiles"
          :key="tile.key"
          class="min-w-0 rounded-xl bg-eb-surface-2 px-3 py-2.5"
          :data-tile="tile.key"
        >
          <div class="truncate text-xs text-eb-muted">{{ tile.label }}</div>
          <div class="mt-0.5 truncate text-lg font-bold" :class="tile.class">{{ tile.value }}</div>
        </div>
      </div>
    </section>

    <button
      v-if="pendingBefore.length"
      type="button"
      class="flex min-h-12 items-center gap-2.5 rounded-xl bg-eb-amber-soft px-3.5 text-left text-sm font-semibold text-eb-amber"
      @click="jumpToOldestPending"
    >
      <AppIcon name="clock" class="size-[18px] shrink-0" />
      <span class="flex-1">
        {{ t('today.pendingBefore', pendingBefore.length) }}
      </span>
      <span>{{ t('today.see') }}</span>
    </button>

    <Message v-if="error || settleError" severity="error">
      {{ message(error ?? settleError ?? '') }}
    </Message>

    <div v-if="!loading && groups.length" class="mt-2 hidden items-center gap-3 lg:flex">
      <h2 class="m-0 flex-1 text-lg font-bold">{{ t('common.predictions') }}</h2>
      <RouterLink
        :to="{ name: 'predictions' }"
        class="inline-flex min-h-11 items-center gap-2.5 rounded-xl bg-eb-accent px-4 font-semibold text-eb-on-accent"
        aria-keyshortcuts="n"
      >
        {{ t('common.newPrediction') }}
        <kbd
          class="rounded-md border border-current/40 px-1.5 font-sans text-xs leading-5 font-semibold"
          :title="t('today.newShortcut')"
          >N</kbd
        >
      </RouterLink>
    </div>

    <p v-if="loading" class="text-center text-eb-muted">{{ t('common.loading') }}</p>

    <section
      v-else-if="!groups.length && !error"
      class="flex flex-col items-center gap-3 rounded-2xl border border-eb-border bg-eb-surface p-8 text-center"
    >
      <p class="m-0 text-eb-muted">{{ t('today.empty') }}</p>
      <RouterLink
        :to="{ name: 'predictions' }"
        class="inline-flex min-h-11 items-center rounded-xl bg-eb-accent px-4 font-semibold text-eb-on-accent"
      >
        {{ t('common.newPrediction') }}
      </RouterLink>
    </section>

    <section v-for="group in groups" v-else :key="group.eventId" class="mt-2">
      <RouterLink
        :to="{ name: 'event', params: { id: group.eventId } }"
        class="flex min-h-11 items-center gap-2.5 rounded-xl text-eb-text"
      >
        <span class="rounded-lg bg-eb-surface-2 px-2 py-1 text-[13px] font-bold">
          {{ formatTime(new Date(group.event.kickoff_at), intlLocale) }}
        </span>
        <span class="min-w-0 flex-1">
          <span class="block text-[15px] font-semibold">
            {{ group.event.home_team.name }} – {{ group.event.away_team.name }}
          </span>
          <span v-if="group.event.league" class="block text-xs text-eb-muted">
            {{ group.event.league.name }}
          </span>
        </span>
        <span class="hidden text-sm font-semibold text-eb-muted lg:inline">
          {{ t('today.seeGame') }}
        </span>
        <AppIcon name="chevron-right" class="size-[18px] shrink-0 text-eb-muted" />
      </RouterLink>
      <div
        class="mt-1.5 divide-y divide-eb-border overflow-hidden rounded-2xl border border-eb-border bg-eb-surface"
      >
        <PredictionRow
          v-for="prediction in group.predictions"
          :key="prediction.id"
          :prediction="prediction"
          :unit-value="settings.unitValue"
          :money-display="settings.moneyDisplay"
          layout="line"
          :busy="saving.has(prediction.id)"
          @settle="settle(prediction, $event)"
        />
      </div>
    </section>
  </div>
</template>
