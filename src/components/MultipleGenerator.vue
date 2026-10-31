<script setup lang="ts">
import { computed, ref } from 'vue'
import { useLocale } from '@/composables/useLocale'
import { TOLERANCES, useMultipleDraft, type WindowChoice } from '@/composables/useMultipleDraft'
import { CONFIDENCE_LEVELS, type ConfidenceLevel } from '@/domain/confidence'
import { parseDecimal } from '@/domain/decimal'
import { addDays, toDayKey } from '@/domain/days'
import {
  GENERATOR_MODES,
  MAX_ADDED_LEGS,
  MAX_WINDOW_DAYS,
  windowRange,
  type DayRange,
} from '@/domain/generator'
import { formatPercent } from '@/domain/intl'
import { MARKETS, type Market } from '@/domain/markets'
import { formatDecimal } from '@/domain/money'
import type { PredictionWithRelations } from '@/types/db'
import StepperField from './StepperField.vue'

/** The Gerador panel (docs/specs/ui.md, Múltiplas): window, mode, size, filters and the button. */
const props = defineProps<{
  /** Pending predictions from today to the last day a window can reach. */
  predictions: PredictionWithRelations[]
  /** Local midnight of today. */
  today: Date
}>()

defineEmits<{ generate: [] }>()

const { t, intlLocale } = useLocale()
const draft = useMultipleDraft()
const settings = draft.settings

const kickoffDay = (p: PredictionWithRelations) => toDayKey(new Date(p.event.kickoff_at))
const inRange = (p: PredictionWithRelations, range: DayRange) => {
  const day = kickoffDay(p)
  return day >= range.from && day <= range.to
}
const countIn = (range: DayRange) => props.predictions.filter((p) => inRange(p, range)).length

function rangeOf(choice: WindowChoice): DayRange | null {
  try {
    return windowRange(choice === 'custom' ? settings.custom : choice, props.today)
  } catch {
    return null
  }
}

const windows = computed(() =>
  (['today', 'tomorrow', 'next3', 'custom'] as const).map((value) => {
    const range = rangeOf(value)
    return {
      value,
      label: t(`multiples.generator.window.${value}`),
      count: range ? countIn(range) : 0,
    }
  }),
)

const firstDay = computed(() => toDayKey(props.today))
const lastDay = computed(() => toDayKey(addDays(props.today, MAX_WINDOW_DAYS - 1)))
const customRange = computed(() => rangeOf('custom'))
const customDays = computed(() => {
  const range = customRange.value
  if (!range) return 0
  return Math.round((Date.parse(range.to) - Date.parse(range.from)) / 86_400_000) + 1
})

const windowPredictions = computed(() => {
  const range = rangeOf(settings.window)
  return range ? props.predictions.filter((p) => inRange(p, range)) : []
})

/** Leagues of the window's games, by name; Sem liga is not offered (the filter drops them). */
const leagues = computed(() => {
  const byId = new Map<string, string>()
  for (const p of windowPredictions.value) {
    if (p.event.league) byId.set(p.event.league.id, p.event.league.name)
  }
  return [...byId].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name))
})

const showFilters = ref(false)
const activeFilters = computed(
  () =>
    [
      settings.minConfidence != null,
      settings.minOdd != null,
      settings.maxOdd != null,
      settings.leagueIds.length > 0,
      settings.markets.length > 0,
      settings.nonPunterOnly,
    ].filter(Boolean).length,
)

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value]
}

/** Odd filters as typed; blank or unreadable clears them. */
function oddText(value: number | null) {
  return value == null ? '' : formatDecimal(value, intlLocale.value)
}
function setOdd(key: 'minOdd' | 'maxOdd', text: string) {
  const value = parseDecimal(text)
  settings[key] = value != null && Number.isFinite(value) && value > 1 ? value : null
}

function clearFilters() {
  Object.assign(settings, {
    minConfidence: null,
    minOdd: null,
    maxOdd: null,
    leagueIds: [],
    markets: [],
    nonPunterOnly: false,
  })
}

// The stepper's lower bound moves with the slip: 2 to start a multiple, 1 to add to one.
const count = computed({
  get: () => Math.max(settings.count, draft.minCount),
  set: (value: number) => (settings.count = value),
})

const submitLabel = computed(() =>
  settings.mode === 'target_odd'
    ? t('multiples.generator.submitTarget', {
        odd: formatDecimal(settings.targetOdd, intlLocale.value),
      })
    : t('multiples.generator.submit', count.value),
)

const chip = (active: boolean) =>
  active
    ? 'border-eb-accent bg-eb-accent text-eb-on-accent'
    : 'border-eb-border bg-eb-surface text-eb-text hover:bg-eb-surface-2'
const sectionLabel = 'text-[13px] font-semibold text-eb-muted'
</script>

<template>
  <div class="flex flex-col gap-4" data-generator>
    <fieldset class="m-0 flex min-w-0 flex-col gap-1.5 border-0 p-0">
      <legend :class="[sectionLabel, 'mb-1.5 p-0']">{{ t('multiples.generator.games') }}</legend>
      <div class="grid grid-cols-2 gap-2">
        <button
          v-for="option in windows"
          :key="option.value"
          type="button"
          class="flex min-h-12 flex-col items-start justify-center rounded-xl border-[1.5px] px-3 py-1.5 text-left transition-colors"
          :class="chip(settings.window === option.value)"
          :aria-pressed="settings.window === option.value"
          :data-window="option.value"
          @click="settings.window = option.value"
        >
          <span class="text-[15px] font-semibold">{{ option.label }}</span>
          <span class="text-xs opacity-80">{{
            t('multiples.generator.predictions', option.count)
          }}</span>
        </button>
      </div>
      <div v-if="settings.window === 'custom'" class="mt-1 flex flex-col gap-1.5">
        <div class="grid grid-cols-2 gap-2">
          <label class="flex flex-col gap-1">
            <span :class="sectionLabel">{{ t('multiples.generator.from') }}</span>
            <input
              v-model="settings.custom.from"
              type="date"
              :min="firstDay"
              :max="lastDay"
              class="min-h-11 w-full min-w-0 rounded-xl border border-eb-border bg-eb-surface px-2 text-eb-text"
              data-custom="from"
            />
          </label>
          <label class="flex flex-col gap-1">
            <span :class="sectionLabel">{{ t('multiples.generator.to') }}</span>
            <input
              v-model="settings.custom.to"
              type="date"
              :min="firstDay"
              :max="lastDay"
              class="min-h-11 w-full min-w-0 rounded-xl border border-eb-border bg-eb-surface px-2 text-eb-text"
              data-custom="to"
            />
          </label>
        </div>
        <p v-if="customRange" class="m-0 text-xs text-eb-muted">
          {{
            t(
              'multiples.generator.customSummary',
              {
                count: t('multiples.generator.predictions', countIn(customRange)),
                days: customDays,
              },
              customDays,
            )
          }}
        </p>
        <p v-else class="m-0 text-xs font-semibold text-eb-neg">
          {{ t('multiples.generator.invalidRange') }}
        </p>
      </div>
    </fieldset>

    <fieldset class="m-0 min-w-0 border-0 p-0">
      <legend :class="[sectionLabel, 'mb-1.5 p-0']">
        {{ t('multiples.generator.modeLabel') }}
      </legend>
      <div class="grid grid-cols-2 gap-2">
        <button
          v-for="mode in GENERATOR_MODES"
          :key="mode"
          type="button"
          class="flex min-h-14 flex-col items-start justify-center rounded-xl border-[1.5px] px-3 py-2 text-left transition-colors"
          :class="chip(settings.mode === mode)"
          :aria-pressed="settings.mode === mode"
          :data-mode="mode"
          @click="settings.mode = mode"
        >
          <span class="text-sm font-semibold">{{ t(`multiples.generator.mode.${mode}`) }}</span>
          <span class="text-[11px] leading-tight opacity-80">{{
            t(`multiples.generator.modeHint.${mode}`)
          }}</span>
        </button>
      </div>
    </fieldset>

    <div v-if="settings.mode === 'target_odd'" class="flex flex-col gap-3">
      <div class="flex flex-col gap-1.5">
        <label for="target-odd" :class="sectionLabel">{{ t('multiples.generator.target') }}</label>
        <StepperField
          id="target-odd"
          v-model="settings.targetOdd"
          :min="1.1"
          :max="1000"
          :step="0.5"
          :decimals="2"
          :down-label="t('multiples.generator.targetDown')"
          :up-label="t('multiples.generator.targetUp')"
        />
      </div>
      <div class="flex flex-col gap-1.5">
        <span :class="sectionLabel">{{ t('multiples.generator.tolerance') }}</span>
        <div
          class="grid grid-cols-3 gap-2"
          role="group"
          :aria-label="t('multiples.generator.tolerance')"
        >
          <button
            v-for="tolerance in TOLERANCES"
            :key="tolerance"
            type="button"
            class="min-h-11 rounded-xl border-[1.5px] text-[15px] font-semibold transition-colors"
            :class="chip(settings.tolerance === tolerance)"
            :aria-pressed="settings.tolerance === tolerance"
            @click="settings.tolerance = tolerance"
          >
            ±{{ formatPercent(tolerance, intlLocale) }}
          </button>
        </div>
      </div>
    </div>
    <div v-else class="flex flex-col gap-1.5">
      <label for="generate-count" :class="sectionLabel">{{ t('multiples.generator.count') }}</label>
      <StepperField
        id="generate-count"
        v-model="count"
        :min="draft.minCount"
        :max="MAX_ADDED_LEGS"
        :step="1"
        :decimals="0"
        :down-label="t('multiples.generator.countDown')"
        :up-label="t('multiples.generator.countUp')"
      />
    </div>

    <div class="flex flex-col gap-3 rounded-xl border border-eb-border p-1">
      <button
        type="button"
        class="flex min-h-11 items-center justify-between rounded-lg px-2.5 text-sm font-semibold text-eb-text hover:bg-eb-surface-2"
        :aria-expanded="showFilters"
        data-toggle="filters"
        @click="showFilters = !showFilters"
      >
        <span>{{
          activeFilters
            ? t('multiples.generator.filtersActive', { n: activeFilters })
            : t('multiples.generator.filters')
        }}</span>
        <span aria-hidden="true" class="text-eb-muted">{{ showFilters ? '−' : '+' }}</span>
      </button>
      <div v-if="showFilters" class="flex flex-col gap-3.5 px-2.5 pb-2.5">
        <div class="flex flex-col gap-1.5">
          <span :class="sectionLabel">{{ t('multiples.generator.minConfidence') }}</span>
          <div
            class="grid grid-cols-6 gap-1.5"
            role="group"
            :aria-label="t('multiples.generator.minConfidence')"
          >
            <button
              type="button"
              class="min-h-11 rounded-xl border-[1.5px] text-xs font-semibold"
              :class="chip(settings.minConfidence == null)"
              :aria-pressed="settings.minConfidence == null"
              @click="settings.minConfidence = null"
            >
              {{ t('multiples.generator.anyConfidence') }}
            </button>
            <button
              v-for="level in CONFIDENCE_LEVELS"
              :key="level"
              type="button"
              class="min-h-11 rounded-xl border-[1.5px] text-[15px] font-bold"
              :class="chip(settings.minConfidence === level)"
              :aria-pressed="settings.minConfidence === level"
              :title="t(`confidence.${level}`)"
              @click="settings.minConfidence = level as ConfidenceLevel"
            >
              {{ level }}+
            </button>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-2">
          <label class="flex flex-col gap-1">
            <span :class="sectionLabel">{{ t('multiples.generator.minOdd') }}</span>
            <input
              :value="oddText(settings.minOdd)"
              inputmode="decimal"
              autocomplete="off"
              placeholder="1,20"
              class="min-h-11 w-full min-w-0 rounded-xl border border-eb-border bg-eb-surface px-3 text-eb-text tabular-nums"
              data-filter="min-odd"
              @change="setOdd('minOdd', ($event.target as HTMLInputElement).value)"
            />
          </label>
          <label class="flex flex-col gap-1">
            <span :class="sectionLabel">{{ t('multiples.generator.maxOdd') }}</span>
            <input
              :value="oddText(settings.maxOdd)"
              inputmode="decimal"
              autocomplete="off"
              placeholder="3,00"
              class="min-h-11 w-full min-w-0 rounded-xl border border-eb-border bg-eb-surface px-3 text-eb-text tabular-nums"
              data-filter="max-odd"
              @change="setOdd('maxOdd', ($event.target as HTMLInputElement).value)"
            />
          </label>
        </div>
        <div class="flex flex-col gap-1.5">
          <span :class="sectionLabel">{{ t('multiples.generator.markets') }}</span>
          <div
            class="flex flex-wrap gap-1.5"
            role="group"
            :aria-label="t('multiples.generator.markets')"
          >
            <button
              v-for="market in MARKETS"
              :key="market"
              type="button"
              class="min-h-11 rounded-xl border-[1.5px] px-3 text-sm font-semibold"
              :class="chip(settings.markets.includes(market))"
              :aria-pressed="settings.markets.includes(market)"
              @click="settings.markets = toggle<Market>(settings.markets, market)"
            >
              {{ t(`catalogue.market.${market}`) }}
            </button>
          </div>
        </div>
        <div v-if="leagues.length" class="flex flex-col gap-1.5">
          <span :class="sectionLabel">{{ t('multiples.generator.leagues') }}</span>
          <div
            class="flex flex-wrap gap-1.5"
            role="group"
            :aria-label="t('multiples.generator.leagues')"
          >
            <button
              v-for="league in leagues"
              :key="league.id"
              type="button"
              class="min-h-11 rounded-xl border-[1.5px] px-3 text-sm font-semibold"
              :class="chip(settings.leagueIds.includes(league.id))"
              :aria-pressed="settings.leagueIds.includes(league.id)"
              @click="settings.leagueIds = toggle(settings.leagueIds, league.id)"
            >
              {{ league.name }}
            </button>
          </div>
        </div>
        <label class="flex min-h-11 cursor-pointer items-center gap-2.5 text-sm font-semibold">
          <input v-model="settings.nonPunterOnly" type="checkbox" class="size-5 accent-eb-accent" />
          {{ t('multiples.generator.nonPunter') }}
        </label>
        <button
          v-if="activeFilters"
          type="button"
          class="min-h-11 self-start rounded-xl px-3 text-sm font-semibold text-eb-accent-text hover:bg-eb-accent-soft"
          @click="clearFilters"
        >
          {{ t('multiples.generator.clearFilters') }}
        </button>
      </div>
    </div>

    <div class="flex flex-col gap-2">
      <button
        type="button"
        class="min-h-12 rounded-[14px] bg-eb-accent px-4 text-base font-bold text-eb-on-accent disabled:opacity-60"
        :disabled="settings.window === 'custom' && !customRange"
        data-action="generate"
        @click="$emit('generate')"
      >
        {{ submitLabel }}
      </button>
      <p class="m-0 text-xs text-eb-muted">{{ t('multiples.generator.hint') }}</p>
    </div>
  </div>
</template>
