<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Message from 'primevue/message'
import ProfitChart, { type ProfitLine } from '@/components/ProfitChart.vue'
import SegmentedControl from '@/components/SegmentedControl.vue'
import { profitClass } from '@/components/profitClass'
import { useLatestRequest } from '@/composables/useLatestRequest'
import { useLocale } from '@/composables/useLocale'
import { fromDayKey, startOfDay } from '@/domain/days'
import { dateTimeFormat, formatPercent, numberFormat } from '@/domain/intl'
import {
  breakdown,
  cumulativeSeries,
  inPeriod,
  oddsBands,
  scope,
  SMALL_SAMPLE,
  summary,
  type Bet,
  type Dimension,
  type Scope,
  type Summary,
} from '@/domain/metrics'
import { formatDecimal, formatMoney, type MoneyDisplay } from '@/domain/money'
import { PERIODS, periodRange, periodStart, type Period } from '@/domain/periods'
import { userMessage } from '@/lib/errors'
import { useBetsStore } from '@/stores/bets'
import { useSettingsStore } from '@/stores/settings'

const betsStore = useBetsStore()
const settings = useSettingsStore()
const { t, intlLocale, message } = useLocale()

const period = ref<Period>('month')
const betScope = ref<Scope>('punter')
/** Follows the money display setting until changed here; the change is not saved. */
const displayChoice = ref<MoneyDisplay | null>(null)
const display = computed<MoneyDisplay>({
  get: () => displayChoice.value ?? settings.moneyDisplay,
  set: (value) => (displayChoice.value = value),
})

const periodOptions = computed(() =>
  PERIODS.map((value) => ({ value, label: t(`dashboard.period.${value}`) })),
)
const scopeOptions = computed(() =>
  (['punter', 'all', 'multiples'] as const).map((value) => ({
    value,
    label: t(`dashboard.scope.${value}`),
  })),
)
const moneyOptions = computed(() =>
  (['units', 'euros'] as const).map((value) => ({
    value,
    label: t(`dashboard.money.${value}`),
  })),
)

const bets = ref<Bet[]>([])
const today = ref(startOfDay(new Date()))
const loading = ref(true)
const error = ref<string | null>(null)

const loads = useLatestRequest()
async function load() {
  const isLatest = loads.start()
  loading.value = true
  error.value = null
  today.value = startOfDay(new Date())
  try {
    const [rows] = await Promise.all([
      betsStore.listSettled(periodStart(period.value, today.value), today.value),
      settings.ensureLoaded(),
    ])
    if (!isLatest()) return
    bets.value = rows
  } catch (e) {
    if (!isLatest()) return
    bets.value = []
    error.value = userMessage(e, 'dashboard.loadFailed')
  } finally {
    if (isLatest()) loading.value = false
  }
}
watch(period, load, { immediate: true })

/** Settled bets of the period: every metric below reads these, through `src/domain/metrics.ts`. */
const range = computed(() =>
  periodRange(
    period.value,
    today.value,
    bets.value.filter((b) => b.status !== 'pending').map((b) => b.date),
  ),
)
const periodBets = computed(() =>
  inPeriod(bets.value, range.value.from, range.value.to).filter((b) => b.status !== 'pending'),
)
const scoped = computed(() => scope(periodBets.value, betScope.value))
const totals = computed(() => summary(scoped.value))

/** Singles line of the chart: follows the scope, punter when looking at multiples. */
const singlesScope = computed<Scope>(() => (betScope.value === 'all' ? 'all' : 'punter'))
const lines = computed<ProfitLine[]>(() => {
  const { from, to } = range.value
  const series = (s: Scope) => cumulativeSeries(scope(periodBets.value, s), from, to)
  return [
    {
      name: t(`dashboard.scope.${singlesScope.value}`),
      color: 'accent',
      values: series(singlesScope.value).map((p) => p.profit),
    },
    {
      name: t('dashboard.scope.multiples'),
      color: 'info',
      values: series('multiples').map((p) => p.profit),
    },
  ]
})
const chartDays = computed(() => {
  const format = dateTimeFormat(intlLocale.value, { day: 'numeric', month: 'short' })
  const { from, to } = range.value
  return cumulativeSeries([], from, to).map((p) => format.format(fromDayKey(p.day) as Date))
})
const chartLabel = computed(() =>
  t('dashboard.chartLabel', {
    lines: lines.value
      .map((line) => `${line.name} ${money(line.values[line.values.length - 1] ?? 0)}`)
      .join(', '),
  }),
)

const versus = computed(() =>
  (['punter', 'multiples'] as const).map((s) => ({
    scope: s,
    summary: summary(scope(periodBets.value, s)),
  })),
)

const DIMENSIONS = [
  'betType',
  'market',
  'period',
  'timing',
  'league',
  'team',
  'oddsBand',
  'confidence',
  'valueBand',
  'bookmaker',
  'weekday',
] as const satisfies readonly Dimension[]
type TableDimension = (typeof DIMENSIONS)[number]
const dimension = ref<TableDimension>('betType')

const rows = computed(() =>
  breakdown(scoped.value, dimension.value, { oddsBands: [...settings.oddsBands] }),
)

/** Segment keys from `breakdown` as shown: translated where the app translates them. */
function segmentLabel(key: string): string {
  switch (dimension.value) {
    case 'market':
      return t(`catalogue.market.${key}`)
    case 'timing':
      return t(`timing.${key}`)
    case 'betType': {
      const [market, betType] = key.split(' · ')
      return `${t(`catalogue.market.${market}`)} - ${t(`catalogue.betType.${betType}`)}`
    }
    case 'oddsBand': {
      const band = oddsBands([...settings.oddsBands]).find((b) => b.key === key)
      if (!band) return key
      const min = formatDecimal(band.min === 1 ? 1.01 : band.min, intlLocale.value)
      return band.max == null
        ? `${min}+`
        : `${min}–${formatDecimal(band.max - 0.01, intlLocale.value)}`
    }
    case 'confidence':
      return `${key} · ${t(`confidence.${key}`)}`
    case 'valueBand':
      return t(`valueBand.row.${key}`)
    case 'weekday':
      // 4 January 2026 is a Sunday, the 0 of `getDay()`.
      return dateTimeFormat(intlLocale.value, { weekday: 'long' }).format(
        new Date(2026, 0, 4 + Number(key)),
      )
    default:
      return key
  }
}

const money = (units: number, signed = true) =>
  formatMoney(units, settings.unitValue, display.value, { signed }, intlLocale.value)
/** A new function whenever the display changes, so the chart redraws its axis. */
const chartMoney = computed(() => {
  const [unitValue, mode, locale] = [settings.unitValue, display.value, intlLocale.value]
  return (units: number) => formatMoney(units, unitValue, mode, { signed: true }, locale)
})
const percent = (value: number | null, signed = false) =>
  value == null ? '—' : formatPercent(value, intlLocale.value, { decimals: 1, signed })
/** Edge in percentage points, signed: `0.148` → `+14,8`. */
const points = (value: number) =>
  numberFormat(intlLocale.value, {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
    signDisplay: 'exceptZero',
  }).format(value * 100)
const odd = (value: number | null) => (value == null ? '—' : formatDecimal(value, intlLocale.value))
const signedClass = (value: number | null) => (value == null ? 'text-eb-muted' : profitClass(value))

const subtitle = computed(() => {
  const from = fromDayKey(range.value.from) as Date
  const to = fromDayKey(range.value.to) as Date
  const format = dateTimeFormat(intlLocale.value, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
  const label =
    period.value === 'all'
      ? t('dashboard.since', { date: format.format(from) })
      : from.getTime() === to.getTime()
        ? format.format(from)
        : `${format.format(from)} – ${format.format(to)}`
  return t('dashboard.subtitle', { period: label, n: totals.value.n }, totals.value.n)
})

const kpis = computed(() => {
  const s: Summary = totals.value
  return [
    {
      key: 'profit',
      label: t('dashboard.profit'),
      value: money(s.profit),
      class: signedClass(s.profit),
      hint: t(display.value === 'euros' ? 'dashboard.stakedEuros' : 'dashboard.stakedUnits', {
        amount: money(s.staked, false),
      }),
    },
    {
      key: 'yield',
      label: t('dashboard.yield'),
      value: percent(s.yield, true),
      class: signedClass(s.yield),
      hint: t('dashboard.yieldHint'),
    },
    {
      key: 'hitRate',
      label: t('dashboard.hitRate'),
      value: percent(s.hitRate),
      class: 'text-eb-text',
      hint: t('dashboard.hitRateHint', { won: s.won, decided: s.won + s.lost }),
    },
    {
      key: 'edge',
      label: t('dashboard.edge'),
      value: s.edge == null ? '—' : t('dashboard.points', { value: points(s.edge) }),
      class: signedClass(s.edge),
      hint: t('dashboard.edgeHint', { rate: percent(s.breakEvenHitRate) }),
    },
  ]
})

/** Yield bar: ±20% fills half the track on its side. */
const YIELD_FULL = 0.2
function yieldBar(value: number | null) {
  if (value == null || value === 0) return null
  const width = `${(Math.min(Math.abs(value) / YIELD_FULL, 1) * 50).toFixed(2)}%`
  return value > 0
    ? { class: 'bg-eb-pos', style: { left: '50%', width } }
    : { class: 'bg-eb-neg', style: { right: '50%', width } }
}
</script>

<template>
  <div class="flex flex-col gap-4 tabular-nums">
    <header class="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
      <div class="min-w-0">
        <h1 class="m-0 text-[26px] font-bold tracking-tight">{{ t('dashboard.title') }}</h1>
        <p class="m-0 mt-0.5 text-sm text-eb-muted" data-subtitle>{{ subtitle }}</p>
      </div>
      <div
        class="grid gap-2 sm:grid-cols-[minmax(0,4fr)_minmax(0,3.4fr)_minmax(0,2.2fr)] lg:w-[760px] lg:shrink-0"
        role="group"
        :aria-label="t('dashboard.filters')"
      >
        <SegmentedControl
          v-model="period"
          :options="periodOptions"
          :label="t('dashboard.periodLabel')"
        />
        <SegmentedControl
          v-model="betScope"
          :options="scopeOptions"
          :label="t('dashboard.scopeLabel')"
        />
        <SegmentedControl
          v-model="display"
          :options="moneyOptions"
          :label="t('dashboard.moneyLabel')"
        />
      </div>
    </header>

    <Message v-if="error" severity="error">{{ message(error) }}</Message>

    <p v-if="loading" class="text-center text-eb-muted">{{ t('common.loading') }}</p>

    <section
      v-else-if="!totals.n && !error"
      class="flex flex-col items-center gap-1 rounded-2xl border border-eb-border bg-eb-surface p-8 text-center"
      data-empty
    >
      <p class="m-0 font-semibold">{{ t('dashboard.empty') }}</p>
      <p class="m-0 text-sm text-eb-muted">{{ t('dashboard.emptyHint') }}</p>
    </section>

    <template v-else-if="!error">
      <section
        class="grid grid-cols-2 gap-3 sm:[grid-template-columns:repeat(auto-fit,minmax(220px,1fr))]"
        :aria-label="t('dashboard.kpis')"
      >
        <div
          v-for="kpi in kpis"
          :key="kpi.key"
          class="rounded-2xl border border-eb-border bg-eb-surface p-4"
          :data-kpi="kpi.key"
        >
          <div class="text-[13px] font-semibold text-eb-muted">{{ kpi.label }}</div>
          <div
            class="mt-1 text-[22px] font-bold tracking-tight sm:text-[28px]"
            :class="kpi.class"
            data-value
          >
            {{ kpi.value }}
          </div>
          <div class="mt-0.5 text-[13px] text-eb-muted" data-hint>{{ kpi.hint }}</div>
        </div>
      </section>

      <div class="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section class="min-w-0 rounded-2xl border border-eb-border bg-eb-surface p-4">
          <h2 class="m-0 mb-2 text-[17px] font-bold">{{ t('dashboard.cumulative') }}</h2>
          <ProfitChart :days="chartDays" :lines="lines" :format="chartMoney" :label="chartLabel" />
        </section>

        <section class="min-w-0 rounded-2xl border border-eb-border bg-eb-surface p-4">
          <h2 class="m-0 mb-3 text-[17px] font-bold">{{ t('dashboard.versus') }}</h2>
          <div class="grid grid-cols-2 gap-3 lg:grid-cols-1">
            <div
              v-for="side in versus"
              :key="side.scope"
              class="min-w-0 rounded-xl bg-eb-surface-2 p-3"
              :data-versus="side.scope"
            >
              <div class="flex flex-wrap items-center gap-x-2 text-[13px] font-semibold">
                <span
                  class="size-2.5 shrink-0 rounded-full"
                  :class="side.scope === 'punter' ? 'bg-eb-accent' : 'bg-eb-info'"
                />
                {{ t(`dashboard.scope.${side.scope}`) }}
                <span class="font-normal whitespace-nowrap text-eb-muted sm:ml-auto">
                  {{ t('dashboard.bets', { n: side.summary.n }, side.summary.n) }}
                </span>
              </div>
              <div
                class="mt-1 text-[22px] font-bold"
                :class="side.summary.n ? profitClass(side.summary.profit) : 'text-eb-muted'"
                data-value
              >
                {{ side.summary.n ? money(side.summary.profit) : '—' }}
              </div>
              <dl class="m-0 mt-1 grid grid-cols-2 gap-x-3 text-[13px]">
                <dt class="text-eb-muted">{{ t('dashboard.column.yield') }}</dt>
                <dd class="m-0 text-right font-semibold" :class="signedClass(side.summary.yield)">
                  {{ percent(side.summary.yield, true) }}
                </dd>
                <dt class="text-eb-muted">{{ t('dashboard.column.hitRate') }}</dt>
                <dd class="m-0 text-right font-semibold">{{ percent(side.summary.hitRate) }}</dd>
              </dl>
              <p
                v-if="side.summary.n && side.summary.n < SMALL_SAMPLE"
                class="m-0 mt-2 text-xs text-eb-muted"
                data-small-sample
              >
                {{ t('dashboard.smallSampleNote') }}
              </p>
            </div>
          </div>
        </section>
      </div>

      <section class="min-w-0 rounded-2xl border border-eb-border bg-eb-surface p-4">
        <h2 class="m-0 mb-3 text-[17px] font-bold">{{ t('dashboard.segments') }}</h2>
        <div
          class="-mx-4 flex gap-1 overflow-x-auto px-4 pb-1"
          role="tablist"
          :aria-label="t('dashboard.segments')"
        >
          <button
            v-for="d in DIMENSIONS"
            :key="d"
            type="button"
            role="tab"
            class="min-h-11 shrink-0 rounded-[10px] px-3 text-sm font-semibold whitespace-nowrap"
            :class="
              dimension === d
                ? 'bg-eb-accent-soft text-eb-accent-text'
                : 'text-eb-muted hover:bg-eb-surface-2 hover:text-eb-text'
            "
            :aria-selected="dimension === d"
            @click="dimension = d"
          >
            {{ t(`dashboard.dimension.${d}`) }}
          </button>
        </div>

        <p v-if="betScope === 'multiples'" class="m-0 mt-3 text-sm text-eb-muted">
          {{ t('dashboard.singlesOnly') }}
        </p>
        <p v-else-if="!rows.length" class="m-0 mt-3 text-sm text-eb-muted">
          {{ t('dashboard.noSegments') }}
        </p>
        <div v-else class="-mx-4 mt-2 overflow-x-auto px-4" role="tabpanel">
          <table class="w-full min-w-[640px] border-collapse text-sm">
            <thead>
              <tr class="text-left text-xs text-eb-muted">
                <th class="py-2 pr-3 font-semibold">{{ t('dashboard.column.segment') }}</th>
                <th class="px-3 py-2 text-right font-semibold">{{ t('dashboard.column.bets') }}</th>
                <th class="px-3 py-2 text-right font-semibold">
                  {{ t('dashboard.column.hitRate') }}
                </th>
                <th class="px-3 py-2 text-right font-semibold">
                  {{ t('dashboard.column.averageOdd') }}
                </th>
                <th class="px-3 py-2 font-semibold">{{ t('dashboard.column.yield') }}</th>
                <th class="py-2 pl-3 text-right font-semibold">
                  {{ t('dashboard.column.profit') }}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="row in rows"
                :key="row.key"
                class="border-t border-eb-border"
                :class="row.smallSample && 'text-eb-muted'"
                data-segment
              >
                <td class="py-2.5 pr-3 whitespace-nowrap">
                  <span class="font-semibold">{{ segmentLabel(row.key) }}</span>
                  <span
                    v-if="row.smallSample"
                    class="ml-2 rounded-full bg-eb-surface-2 px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap text-eb-muted"
                  >
                    {{ t('dashboard.smallSample') }}
                  </span>
                </td>
                <td class="px-3 py-2.5 text-right">{{ row.n }}</td>
                <td class="px-3 py-2.5 text-right">{{ percent(row.hitRate) }}</td>
                <td class="px-3 py-2.5 text-right">{{ odd(row.averageOdd) }}</td>
                <td class="px-3 py-2.5">
                  <div class="flex items-center gap-2">
                    <div class="relative h-2 w-24 shrink-0 rounded-full bg-eb-surface-2">
                      <span class="absolute inset-y-[-2px] left-1/2 w-px bg-eb-border" />
                      <span
                        v-if="yieldBar(row.yield)"
                        class="absolute inset-y-0 rounded-full"
                        :class="[yieldBar(row.yield)!.class, row.smallSample && 'opacity-60']"
                        :style="yieldBar(row.yield)!.style"
                      />
                    </div>
                    <span
                      class="w-16 text-right font-semibold"
                      :class="row.smallSample ? '' : signedClass(row.yield)"
                    >
                      {{ percent(row.yield, true) }}
                    </span>
                  </div>
                </td>
                <td
                  class="py-2.5 pl-3 text-right font-semibold"
                  :class="row.smallSample ? '' : profitClass(row.profit)"
                >
                  {{ money(row.profit) }}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </template>
  </div>
</template>
