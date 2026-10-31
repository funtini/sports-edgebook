<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Message from 'primevue/message'
import { useToast } from 'primevue/usetoast'
import AppIcon from '@/components/AppIcon.vue'
import MultipleGenerator from '@/components/MultipleGenerator.vue'
import MultipleLegRow from '@/components/MultipleLegRow.vue'
import MultiplePredictionList from '@/components/MultiplePredictionList.vue'
import ChipGroup from '@/components/ChipGroup.vue'
import SavedMultipleCard from '@/components/SavedMultipleCard.vue'
import SegmentedControl from '@/components/SegmentedControl.vue'
import StepperField from '@/components/StepperField.vue'
import { profitClass } from '@/components/profitClass'
import { useLocale } from '@/composables/useLocale'
import { DESKTOP_QUERY, useMediaQuery } from '@/composables/useMediaQuery'
import { useMultipleDraft } from '@/composables/useMultipleDraft'
import { addDays, fromDayKey, shortDayLabel, startOfDay, toDayKey } from '@/domain/days'
import { MAX_WINDOW_DAYS, type DayRange } from '@/domain/generator'
import { dateTimeFormat, formatPercent } from '@/domain/intl'
import { formatDecimal, formatMoney } from '@/domain/money'
import { MIN_SAVED_LEGS, potentialProfit, withinTolerance } from '@/domain/multipleDraft'
import {
  matchesFilter,
  reusableLegs,
  SAVED_FILTERS,
  type SavedFilter,
} from '@/domain/savedMultiples'
import { userMessage } from '@/lib/errors'
import { useMultiplesStore } from '@/stores/multiples'
import { usePredictionsStore } from '@/stores/predictions'
import { useSettingsStore } from '@/stores/settings'
import type { PredictionWithRelations, SavedMultiple } from '@/types/db'

const predictions = usePredictionsStore()
const multiples = useMultiplesStore()
const settings = useSettingsStore()
const draft = useMultipleDraft()
const toast = useToast()
const { t, intlLocale, message } = useLocale()
const desktop = useMediaQuery(DESKTOP_QUERY)

const route = useRoute()
const router = useRouter()

/** `?vista=guardadas` opens Guardadas (Hoje's "Múltiplas do dia" links there). */
const SAVED_VIEW = 'guardadas'
const tab = ref<'create' | 'saved'>(route.query.vista === SAVED_VIEW ? 'saved' : 'create')
watch(
  () => route.query.vista,
  (vista) => {
    tab.value = vista === SAVED_VIEW ? 'saved' : 'create'
  },
)
watch(tab, (value) => {
  const vista = value === 'saved' ? SAVED_VIEW : undefined
  if (route.query.vista !== vista) {
    router.replace({ query: { ...route.query, vista } })
  }
})
const tabs = computed(() =>
  (['create', 'saved'] as const).map((value) => ({ value, label: t(`multiples.tab.${value}`) })),
)

const today = startOfDay(new Date())
/** Pending predictions from today to the last day a window can reach. */
const pending = ref<PredictionWithRelations[]>([])
const loading = ref(true)
const saving = ref(false)
const error = ref<string | null>(null)
/** A generation or swap that found nothing; cleared by the next action. */
const notice = ref<string | null>(null)

/** Phone: the panel open inside the slip card. Desktop: whether the Gerador card is expanded. */
const panel = ref<'add' | 'generator' | null>(null)
const generatorOpen = ref(false)

const range = computed<DayRange | null>(() => {
  try {
    return draft.range(today)
  } catch {
    return null
  }
})

/** The window's predictions: what the list shows and the generator picks from. */
const windowRows = computed(() => {
  const r = range.value
  if (!r) return []
  return pending.value.filter((p) => {
    const day = toDayKey(new Date(p.event.kickoff_at))
    return day >= r.from && day <= r.to
  })
})

const inSlip = computed(() => new Set(draft.legs.map((leg) => leg.prediction.id)))

const shortDay = (key: string) =>
  dateTimeFormat(intlLocale.value, { day: 'numeric', month: 'short' }).format(
    fromDayKey(key) ?? today,
  )
const windowLabel = computed(() =>
  draft.settings.window === 'custom'
    ? t('multiples.generator.windowShort.custom', {
        from: shortDay(draft.settings.custom.from),
        to: shortDay(draft.settings.custom.to),
      })
    : t(`multiples.generator.windowShort.${draft.settings.window}`),
)

/** "Melhor valor · hoje · 3 prognósticos" on the minimized Gerador card. */
const generatorSummary = computed(() => {
  const s = draft.settings
  const size =
    s.mode === 'target_odd'
      ? t('multiples.generator.summaryTarget', {
          odd: formatDecimal(s.targetOdd, intlLocale.value),
        })
      : t('multiples.generator.predictions', Math.max(s.count, draft.minCount))
  return [t(`multiples.generator.mode.${s.mode}`), windowLabel.value, size].join(' · ')
})

/** "2 manuais · 3 gerados · 2 fixados · Melhor valor". */
const slipSummary = computed(() => {
  const manual = draft.legs.filter((leg) => leg.origin === 'manual').length
  const generated = draft.legs.length - manual
  const pinned = draft.legs.filter((leg) => leg.pinned).length
  return [
    manual && t('multiples.slip.manual', manual),
    generated && t('multiples.slip.generated', generated),
    pinned && t('multiples.slip.pinned', pinned),
    draft.hasGenerated &&
      draft.lastGeneration &&
      t(`multiples.generator.mode.${draft.lastGeneration.mode}`),
  ]
    .filter(Boolean)
    .join(' · ')
})

const outOfTolerance = computed(() => {
  const generation = draft.lastGeneration
  if (!draft.hasGenerated || generation?.mode !== 'target_odd') return null
  const { targetOdd, tolerance } = generation.params as { targetOdd: number; tolerance: number }
  if (withinTolerance(draft.totals.totalOdd, targetOdd, tolerance)) return null
  return t('multiples.totals.outOfTolerance', {
    target: formatDecimal(targetOdd, intlLocale.value),
    tolerance: formatPercent(tolerance, intlLocale.value),
  })
})

const canSave = computed(() => draft.legs.length >= MIN_SAVED_LEGS)

const euros = computed(() => settings.moneyDisplay === 'euros')
/** Valor apostado in the display money; stored in units. */
const stake = computed({
  get: () =>
    euros.value ? Math.round(draft.stakeUnits * settings.unitValue * 100) / 100 : draft.stakeUnits,
  set: (value: number) => {
    const units = euros.value ? value / settings.unitValue : value
    draft.stakeUnits = Math.max(0.01, Math.round(units * 100) / 100)
  },
})
const money = (units: number, signed: boolean) =>
  formatMoney(units, settings.unitValue, settings.moneyDisplay, { signed }, intlLocale.value)

/** Guardadas: loaded each time the tab opens, so settlement on Hoje shows up. */
const saved = ref<SavedMultiple[]>([])
const savedLoading = ref(false)
const savedError = ref<string | null>(null)
const filter = ref<SavedFilter>('all')
const filters = computed(() =>
  SAVED_FILTERS.map((value) => ({ value, label: t(`multiples.savedList.filter.${value}`) })),
)
const shownSaved = computed(() => saved.value.filter((m) => matchesFilter(m, filter.value)))
const deleting = ref(new Set<string>())

async function loadSaved() {
  savedLoading.value = true
  savedError.value = null
  try {
    const [rows] = await Promise.all([multiples.list(), settings.ensureLoaded()])
    saved.value = rows
  } catch (e) {
    savedError.value = userMessage(e, 'multiples.savedList.loadFailed')
  } finally {
    savedLoading.value = false
  }
}

watch(tab, (value) => value === 'saved' && loadSaved(), { immediate: true })

async function removeSaved(multiple: SavedMultiple) {
  savedError.value = null
  deleting.value = new Set(deleting.value).add(multiple.id)
  try {
    await multiples.removeSimulated(multiple.id)
    saved.value = saved.value.filter((m) => m.id !== multiple.id)
  } catch (e) {
    savedError.value = userMessage(e, 'multiples.savedList.deleteFailed')
  } finally {
    const next = new Set(deleting.value)
    next.delete(multiple.id)
    deleting.value = next
  }
}

/** After Reutilizar: the copied multiple's date and how many legs were left out. */
const reuseNote = ref<{ date: string; dropped: number } | null>(null)

/** Reutilizar: Criar with the card's legs, all pinned, minus games that already started. */
function reuse(multiple: SavedMultiple) {
  const { kept, dropped } = reusableLegs(
    multiple.legs.map((leg) => ({ origin: leg.origin, prediction: leg.prediction })),
  )
  notice.value = null
  error.value = null
  draft.reuse(
    kept,
    multiple.generator_mode
      ? { mode: multiple.generator_mode, params: multiple.generator_params ?? {} }
      : null,
  )
  if (multiple.is_placed && multiple.stake_units != null) draft.stakeUnits = multiple.stake_units
  reuseNote.value = {
    date: shortDayLabel(new Date(multiple.created_at), intlLocale.value),
    dropped,
  }
  panel.value = null
  tab.value = 'create'
}

function togglePanel(name: 'add' | 'generator') {
  panel.value = panel.value === name ? null : name
}

function generate() {
  notice.value = null
  if (!draft.generate(windowRows.value)) {
    notice.value = 'multiples.generator.noResult'
    return
  }
  panel.value = null
  generatorOpen.value = false
}

function regenerate() {
  notice.value = null
  if (!draft.regenerate(windowRows.value)) notice.value = 'multiples.generator.noResult'
}

function swap(predictionId: string) {
  notice.value = null
  if (!draft.swap(predictionId, windowRows.value)) notice.value = 'multiples.generator.noSwap'
}

function clear() {
  notice.value = null
  reuseNote.value = null
  draft.clear()
}

async function save(placed: boolean) {
  error.value = null
  saving.value = true
  try {
    await multiples.create({
      legs: draft.legs.map((leg) => ({
        prediction_id: leg.prediction.id,
        odd: leg.prediction.odd,
        origin: leg.origin,
      })),
      is_placed: placed,
      stake_units: placed ? draft.stakeUnits : null,
      generator: draft.lastGeneration,
    })
    toast.add({ severity: 'success', summary: t('multiples.saved'), life: 2500 })
    clear()
  } catch (e) {
    error.value = userMessage(e, 'multiples.saveFailed')
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  try {
    await settings.ensureLoaded()
    pending.value = await predictions.listPendingBetween(today, addDays(today, MAX_WINDOW_DAYS - 1))
  } catch (e) {
    error.value = userMessage(e, 'multiples.loadFailed')
  } finally {
    loading.value = false
  }
})

const panelButton = (active: boolean) =>
  active
    ? 'border-eb-accent bg-eb-accent text-eb-on-accent'
    : 'border-eb-border bg-eb-surface text-eb-text hover:bg-eb-surface-2'
</script>

<template>
  <div class="mx-auto flex max-w-xl flex-col gap-4 tabular-nums lg:max-w-[1200px]">
    <div class="flex flex-wrap items-center justify-between gap-3">
      <h1 class="m-0 text-[22px] font-bold tracking-tight lg:text-[26px]">
        {{ t('multiples.title') }}
      </h1>
      <SegmentedControl
        v-model="tab"
        :options="tabs"
        :label="t('multiples.tabs')"
        class="w-full sm:w-[260px]"
      />
    </div>

    <template v-if="tab === 'saved'">
      <ChipGroup v-model="filter" :options="filters" :label="t('multiples.savedList.filters')" />
      <Message v-if="savedError" severity="error">{{ message(savedError) }}</Message>
      <p v-if="savedLoading && !saved.length" class="m-0 text-center text-eb-muted">
        {{ t('common.loading') }}
      </p>
      <section
        v-else-if="!shownSaved.length && !savedError"
        class="rounded-2xl border border-eb-border bg-eb-surface p-6 text-center text-eb-muted"
        data-saved-empty
      >
        {{ t(`multiples.savedList.empty.${filter}`) }}
      </section>
      <div
        v-else
        class="grid grid-cols-1 gap-3 lg:grid-cols-[repeat(auto-fill,minmax(340px,1fr))] lg:items-start lg:gap-4"
        data-saved-grid
      >
        <SavedMultipleCard
          v-for="multiple in shownSaved"
          :key="multiple.id"
          :multiple="multiple"
          :unit-value="settings.unitValue"
          :money-display="settings.moneyDisplay"
          :busy="deleting.has(multiple.id)"
          @reuse="reuse(multiple)"
          @delete="removeSaved(multiple)"
        />
      </div>
    </template>

    <template v-else>
      <Message v-if="error" severity="error">{{ message(error) }}</Message>
      <div
        v-if="reuseNote"
        class="flex items-start gap-2 rounded-xl bg-eb-info-soft py-1 pr-1 pl-3.5 text-sm font-semibold text-eb-info"
        role="status"
        data-reuse-note
      >
        <p class="m-0 flex-1 py-2.5">
          {{ t('multiples.savedList.reuseNote', { date: reuseNote.date }) }}
          <template v-if="reuseNote.dropped">
            {{ t('multiples.savedList.reuseDropped', reuseNote.dropped) }}
          </template>
        </p>
        <button
          type="button"
          class="flex size-11 shrink-0 items-center justify-center rounded-xl hover:bg-eb-surface/40"
          :aria-label="t('multiples.savedList.closeNote')"
          data-action="close-note"
          @click="reuseNote = null"
        >
          <AppIcon name="x" class="size-[18px]" />
        </button>
      </div>

      <div
        class="flex flex-col gap-4 lg:grid lg:grid-cols-[minmax(0,400px)_minmax(0,1fr)] lg:items-start lg:gap-5"
      >
        <div v-if="desktop" class="flex min-w-0 flex-col gap-4" data-column="tools">
          <section class="rounded-2xl border border-eb-border bg-eb-surface" data-card="generator">
            <div class="flex items-center gap-3 p-3 pl-4">
              <AppIcon name="spark" class="size-5 shrink-0 text-eb-accent-text" />
              <div class="min-w-0 flex-1">
                <h2 class="m-0 text-base font-bold">{{ t('multiples.generator.title') }}</h2>
                <p class="m-0 truncate text-xs text-eb-muted">{{ generatorSummary }}</p>
              </div>
              <button
                type="button"
                class="flex size-11 shrink-0 items-center justify-center rounded-xl border border-eb-border text-eb-text hover:bg-eb-surface-2"
                :aria-expanded="generatorOpen"
                :aria-label="t('multiples.generator.toggle')"
                @click="generatorOpen = !generatorOpen"
              >
                <AppIcon
                  name="chevron-down"
                  class="size-[18px] transition-transform"
                  :class="generatorOpen && 'rotate-180'"
                />
              </button>
            </div>
            <div v-if="generatorOpen" class="border-t border-eb-border p-4">
              <MultipleGenerator :predictions="pending" :today="today" @generate="generate" />
            </div>
          </section>

          <section class="rounded-2xl border border-eb-border bg-eb-surface p-4" data-card="list">
            <h2 class="m-0 text-base font-bold">{{ t('multiples.list.title') }}</h2>
            <p class="m-0 mb-3 text-xs text-eb-muted">
              {{ t('multiples.list.subtitle', { window: windowLabel }) }}
            </p>
            <p v-if="loading" class="m-0 text-sm text-eb-muted">{{ t('common.loading') }}</p>
            <MultiplePredictionList
              v-else
              :predictions="windowRows"
              :in-slip="inSlip"
              :used-events="draft.usedEvents"
              class="[&_[data-prediction-list]]:max-h-[394px]"
              @add="draft.add"
            />
          </section>
        </div>

        <section
          class="min-w-0 overflow-hidden rounded-2xl border border-eb-border bg-eb-surface"
          data-card="slip"
        >
          <template v-if="!desktop">
            <div
              class="grid grid-cols-2 gap-2 p-3"
              role="group"
              :aria-label="t('multiples.panels')"
            >
              <button
                v-for="name in ['add', 'generator'] as const"
                :key="name"
                type="button"
                class="flex min-h-11 items-center justify-center gap-2 rounded-xl border-[1.5px] text-[15px] font-semibold transition-colors"
                :class="panelButton(panel === name)"
                :aria-expanded="panel === name"
                :data-panel-button="name"
                @click="togglePanel(name)"
              >
                <AppIcon :name="name === 'add' ? 'plus' : 'spark'" class="size-4" />
                {{ name === 'add' ? t('multiples.add') : t('multiples.generator.title') }}
              </button>
            </div>
            <div v-if="panel" class="border-t border-eb-border p-3.5" :data-panel="panel">
              <p v-if="loading" class="m-0 text-sm text-eb-muted">{{ t('common.loading') }}</p>
              <MultiplePredictionList
                v-else-if="panel === 'add'"
                :predictions="windowRows"
                :in-slip="inSlip"
                :used-events="draft.usedEvents"
                class="[&_[data-prediction-list]]:max-h-[328px]"
                @add="draft.add"
              />
              <MultipleGenerator
                v-else
                :predictions="pending"
                :today="today"
                @generate="generate"
              />
            </div>
          </template>

          <div
            v-if="!draft.legs.length"
            class="border-t border-eb-border px-4 py-8 text-center lg:border-t-0"
            data-slip-empty
          >
            <p class="m-0 font-semibold">{{ t('multiples.slip.empty') }}</p>
            <p class="m-0 mt-1 text-sm text-eb-muted">{{ t('multiples.slip.emptyHint') }}</p>
          </div>

          <template v-else>
            <div
              class="flex items-start gap-3 border-t border-eb-border px-4 py-3 lg:border-t-0"
              data-slip-header
            >
              <div class="min-w-0 flex-1">
                <h2 class="m-0 text-base font-bold">
                  {{ t('multiples.slip.title', draft.legs.length) }}
                </h2>
                <p class="m-0 text-xs text-eb-muted">{{ slipSummary }}</p>
              </div>
              <button
                v-if="draft.unpinned.length"
                type="button"
                class="min-h-11 shrink-0 rounded-xl border border-eb-accent px-3 text-sm font-semibold text-eb-accent-text hover:bg-eb-accent-soft"
                :title="t('multiples.slip.regenerateHint')"
                data-action="regenerate"
                @click="regenerate"
              >
                {{ t('multiples.slip.regenerate', { n: draft.unpinned.length }) }}
              </button>
            </div>
            <div class="divide-y divide-eb-border border-y border-eb-border">
              <MultipleLegRow
                v-for="leg in draft.legs"
                :key="leg.prediction.id"
                :leg="leg"
                :fresh="draft.fresh.has(leg.prediction.id)"
                @pin="draft.togglePin(leg.prediction.id)"
                @swap="swap(leg.prediction.id)"
                @remove="draft.remove(leg.prediction.id)"
              />
            </div>
          </template>

          <p
            v-if="notice"
            class="m-0 border-t border-eb-border bg-eb-amber-soft px-4 py-2.5 text-sm font-semibold text-eb-amber"
            role="status"
          >
            {{ t(notice) }}
          </p>

          <div v-if="draft.legs.length" class="flex flex-col gap-3 p-4" data-totals>
            <div class="grid grid-cols-3 gap-2">
              <div class="min-w-0 rounded-xl bg-eb-surface-2 p-2.5">
                <div class="truncate text-xs text-eb-muted">{{ t('multiples.totals.odd') }}</div>
                <div class="mt-0.5 truncate text-lg font-bold" data-total="odd">
                  {{ formatDecimal(draft.totals.totalOdd, intlLocale) }}
                </div>
              </div>
              <div class="min-w-0 rounded-xl bg-eb-surface-2 p-2.5">
                <div class="truncate text-xs text-eb-muted">
                  {{ t('multiples.totals.probability') }}
                </div>
                <div class="mt-0.5 truncate text-lg font-bold" data-total="probability">
                  {{ formatPercent(draft.totals.probability, intlLocale, { decimals: 1 }) }}
                </div>
              </div>
              <div class="min-w-0 rounded-xl bg-eb-surface-2 p-2.5">
                <div class="truncate text-xs text-eb-muted">{{ t('multiples.totals.ev') }}</div>
                <div
                  class="mt-0.5 truncate text-lg font-bold"
                  :class="profitClass(draft.totals.ev)"
                  data-total="ev"
                >
                  {{ formatPercent(draft.totals.ev, intlLocale, { decimals: 1, signed: true }) }}
                </div>
              </div>
            </div>
            <p
              v-if="outOfTolerance"
              class="m-0 rounded-xl bg-eb-amber-soft px-3 py-2 text-sm font-semibold text-eb-amber"
              data-out-of-tolerance
            >
              {{ outOfTolerance }}
            </p>

            <div
              class="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-3 sm:grid-cols-[minmax(0,280px)_1fr]"
            >
              <div class="flex min-w-0 flex-col gap-1.5">
                <label for="multiple-stake" class="text-[13px] font-semibold text-eb-muted">
                  {{ t(euros ? 'multiples.totals.stakeEuros' : 'multiples.totals.stakeUnits') }}
                </label>
                <StepperField
                  id="multiple-stake"
                  v-model="stake"
                  :min="euros ? 1 : 0.1"
                  :max="euros ? 9999.99 * settings.unitValue : 9999.99"
                  :step="euros ? 5 : 0.5"
                  :decimals="2"
                  :down-label="t('multiples.totals.stakeDown')"
                  :up-label="t('multiples.totals.stakeUp')"
                  tone="info"
                />
              </div>
              <div class="text-right">
                <div class="text-xs text-eb-muted">{{ t('multiples.totals.profit') }}</div>
                <div class="text-lg font-bold text-eb-pos" data-total="profit">
                  {{ money(potentialProfit(draft.stakeUnits, draft.totals.totalOdd), true) }}
                </div>
              </div>
            </div>

            <!-- Phone: the two save buttons side by side, Limpar tudo under them. -->
            <div class="flex flex-col-reverse gap-2 sm:flex-row sm:items-center">
              <button
                type="button"
                class="min-h-11 self-center rounded-xl px-3 text-sm font-semibold text-eb-muted hover:bg-eb-surface-2 hover:text-eb-text sm:self-auto"
                data-action="clear"
                @click="clear"
              >
                {{ t('multiples.totals.clear') }}
              </button>
              <span class="hidden flex-1 sm:block" />
              <div class="grid grid-cols-2 gap-2 sm:flex">
                <button
                  type="button"
                  class="min-h-12 rounded-[14px] border-[1.5px] border-eb-border px-3 text-sm font-bold sm:px-4 sm:text-[15px] text-eb-text hover:bg-eb-surface-2 disabled:opacity-50"
                  :disabled="!canSave || saving"
                  data-action="simulate"
                  @click="save(false)"
                >
                  {{ t('multiples.totals.simulate') }}
                </button>
                <button
                  type="button"
                  class="min-h-12 rounded-[14px] bg-eb-accent px-5 text-[15px] font-bold text-eb-on-accent disabled:opacity-50"
                  :disabled="!canSave || saving"
                  data-action="place"
                  @click="save(true)"
                >
                  {{ t('multiples.totals.place') }}
                </button>
              </div>
            </div>
            <p v-if="!canSave" class="m-0 text-xs text-eb-muted" data-min-legs>
              {{ t('multiples.totals.minLegs') }}
            </p>
          </div>
        </section>
      </div>
    </template>
  </div>
</template>
