<script setup lang="ts">
import { computed, ref } from 'vue'
import { useLocale } from '@/composables/useLocale'
import { shortDayLabel } from '@/domain/days'
import { formatDecimal, formatMoney, type MoneyDisplay } from '@/domain/money'
import { settleMultiple } from '@/domain/savedMultiples'
import type { BetStatus, SavedMultiple } from '@/types/db'
import AppIcon from './AppIcon.vue'

/** One saved multiple on Guardadas: summary, Apostado / result boxes, legs, Reutilizar. */
const props = defineProps<{
  multiple: SavedMultiple
  unitValue: number
  moneyDisplay: MoneyDisplay
  /** Disables Apagar while the delete is in flight. */
  busy?: boolean
}>()

const emit = defineEmits<{ reuse: []; delete: [] }>()

const { t, intlLocale, betParts } = useLocale()

/** Phone: legs behind "Ver prognósticos". Desktop shows them always. */
const open = ref(false)
const confirming = ref(false)

const settlement = computed(() => settleMultiple(props.multiple))

const date = computed(() => shortDayLabel(new Date(props.multiple.created_at), intlLocale.value))

/** "Manual", "Odd alvo", "Mista · Mais confiança". */
const originLabel = computed(() => {
  const { origin, generator_mode: mode } = props.multiple
  if (origin === 'manual') return t('multiples.savedList.origin.manual')
  const modeLabel = mode ? t(`multiples.generator.mode.${mode}`) : null
  if (origin === 'mixed') {
    return [t('multiples.savedList.origin.mixed'), modeLabel].filter(Boolean).join(' · ')
  }
  return modeLabel ?? t('multiples.savedList.origin.generated')
})

/** "1 nula · odd 2,26": the odd the multiple pays with void legs at 1,00. */
const voidNote = computed(() => {
  const { voidLegs, effectiveOdd } = settlement.value
  if (!voidLegs) return null
  return t('multiples.savedList.voidNote', {
    n: voidLegs,
    odd: formatDecimal(effectiveOdd, intlLocale.value),
  })
})

const money = (units: number, signed: boolean) =>
  formatMoney(units, props.unitValue, props.moneyDisplay, { signed }, intlLocale.value)

const resultClasses: Record<BetStatus, string> = {
  pending: 'bg-eb-surface-2 text-eb-muted',
  won: 'bg-eb-pos-soft text-eb-pos',
  lost: 'bg-eb-neg-soft text-eb-neg',
  void: 'bg-eb-surface-2 text-eb-muted',
}

const stake = computed(() =>
  settlement.value.real
    ? {
        label: t('predictionRow.staked'),
        amount: money(settlement.value.stake, false),
        classes: 'bg-eb-info-soft text-eb-info',
      }
    : {
        label: t('multiples.savedList.simulated'),
        amount: '—',
        classes: 'bg-eb-surface-2 text-eb-muted',
      },
)

const result = computed(() => {
  const { status, profit, real } = settlement.value
  return {
    label: t(`predictionRow.result.${status}`),
    classes: resultClasses[status],
    amount: profit == null ? '—' : money(profit, true),
    virtual: profit != null && !real,
  }
})

const DOTS: Record<BetStatus, { mark: string; classes: string }> = {
  won: { mark: '✓', classes: 'bg-eb-pos-soft text-eb-pos' },
  lost: { mark: '✕', classes: 'bg-eb-neg-soft text-eb-neg' },
  void: { mark: '–', classes: 'bg-eb-surface-2 text-eb-muted' },
  pending: { mark: '•', classes: 'bg-eb-surface-2 text-eb-muted' },
}

const legs = computed(() =>
  props.multiple.legs.map((leg) => {
    const { prediction } = leg
    const parts = betParts(prediction)
    const status = prediction.status
    return {
      id: prediction.id,
      status,
      dot: DOTS[status],
      game: `${prediction.event.home_team.name} – ${prediction.event.away_team.name}`,
      bet: `${parts[0]} · ${parts[3]}`,
      odd: formatDecimal(leg.odd_at_selection, intlLocale.value),
    }
  }),
)

function confirmDelete() {
  confirming.value = false
  emit('delete')
}
</script>

<template>
  <article
    class="flex flex-col overflow-hidden rounded-2xl border border-eb-border bg-eb-surface tabular-nums"
    :data-multiple="multiple.id"
    :data-status="settlement.status"
  >
    <div class="flex flex-col gap-3 p-4">
      <div class="flex items-start gap-2">
        <div class="min-w-0 flex-1">
          <div class="truncate text-xs text-eb-muted">
            {{ date }} · {{ t('multiples.generator.predictions', multiple.legs.length) }}
          </div>
          <div class="mt-1.5 flex flex-wrap items-center gap-1.5">
            <span
              class="rounded-full px-2 py-0.5 text-[11px] font-bold"
              :class="
                multiple.origin === 'manual'
                  ? 'bg-eb-info-soft text-eb-info'
                  : 'bg-eb-surface-2 text-eb-text'
              "
              data-origin
              >{{ originLabel }}</span
            >
            <span v-if="voidNote" class="text-xs text-eb-muted" data-void-note>{{ voidNote }}</span>
          </div>
        </div>
        <div class="shrink-0 text-right">
          <div class="text-[11px] text-eb-muted">{{ t('multiples.totals.odd') }}</div>
          <div class="text-xl font-bold" data-total-odd>
            {{ formatDecimal(multiple.total_odd, intlLocale) }}
          </div>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-1.5">
        <div class="min-w-0 rounded-[10px] px-2.5 py-2" :class="stake.classes" data-box="stake">
          <div class="text-[11px] font-semibold">{{ stake.label }}</div>
          <div class="mt-0.5 truncate text-base font-bold">{{ stake.amount }}</div>
        </div>
        <div class="min-w-0 rounded-[10px] px-2.5 py-2" :class="result.classes" data-box="result">
          <div class="flex justify-between gap-1 text-[11px] font-semibold">
            <span>{{ result.label }}</span>
            <span v-if="result.virtual" class="text-eb-muted">{{
              t('predictionRow.virtual')
            }}</span>
          </div>
          <div class="mt-0.5 truncate text-base font-bold">{{ result.amount }}</div>
        </div>
      </div>
    </div>

    <button
      type="button"
      class="flex min-h-11 items-center justify-between gap-2 border-t border-eb-border px-4 text-sm font-semibold text-eb-text hover:bg-eb-surface-2 lg:hidden"
      :aria-expanded="open"
      data-action="toggle-legs"
      @click="open = !open"
    >
      {{ t(open ? 'multiples.savedList.hideLegs' : 'multiples.savedList.showLegs') }}
      <AppIcon
        name="chevron-down"
        class="size-[18px] text-eb-muted transition-transform"
        :class="open && 'rotate-180'"
      />
    </button>

    <ul
      class="m-0 list-none divide-y divide-eb-border border-t border-eb-border p-0"
      :class="open ? 'block' : 'hidden lg:block'"
      data-legs
    >
      <li
        v-for="leg in legs"
        :key="leg.id"
        class="flex items-center gap-2.5 px-4 py-2.5"
        :data-saved-leg="leg.id"
      >
        <span
          class="grid size-6 shrink-0 place-items-center rounded-full text-xs font-extrabold"
          :class="leg.dot.classes"
          aria-hidden="true"
          data-dot
          >{{ leg.dot.mark }}</span
        >
        <span class="sr-only">{{ t(`multiples.savedList.legStatus.${leg.status}`) }}</span>
        <div class="min-w-0 flex-1">
          <div class="truncate text-xs text-eb-muted">{{ leg.game }}</div>
          <div class="truncate text-sm font-semibold">{{ leg.bet }}</div>
        </div>
        <div
          class="shrink-0 text-[15px] font-bold"
          :class="leg.status === 'void' && 'text-eb-muted line-through'"
          data-leg-odd
        >
          <span class="sr-only">{{ `${t('predictionRow.odd')} ` }}</span
          >{{ leg.odd }}
        </div>
      </li>
    </ul>

    <div class="mt-auto border-t border-eb-border p-3">
      <div v-if="confirming" class="flex flex-wrap items-center gap-2" role="group" data-confirm>
        <span class="min-w-0 flex-1 text-sm font-semibold">{{
          t('multiples.savedList.deleteConfirm')
        }}</span>
        <button
          type="button"
          class="min-h-11 rounded-xl border border-eb-border px-3 text-sm font-semibold text-eb-text hover:bg-eb-surface-2"
          data-action="cancel-delete"
          @click="confirming = false"
        >
          {{ t('multiples.savedList.cancel') }}
        </button>
        <button
          type="button"
          class="min-h-11 rounded-xl bg-eb-neg px-3 text-sm font-bold text-eb-on-fill disabled:opacity-60"
          :disabled="busy"
          data-action="confirm-delete"
          @click="confirmDelete"
        >
          {{ t('multiples.savedList.delete') }}
        </button>
      </div>
      <div v-else class="flex items-center gap-2">
        <button
          type="button"
          class="inline-flex min-h-11 items-center gap-2 rounded-xl border border-eb-border px-3.5 text-sm font-semibold text-eb-text hover:bg-eb-surface-2"
          data-action="reuse"
          @click="$emit('reuse')"
        >
          <AppIcon name="copy" class="size-[18px]" />
          {{ t('multiples.savedList.reuse') }}
        </button>
        <span class="flex-1" />
        <button
          v-if="!multiple.is_placed"
          type="button"
          class="inline-flex min-h-11 items-center gap-2 rounded-xl px-3 text-sm font-semibold text-eb-muted hover:bg-eb-neg-soft hover:text-eb-neg disabled:opacity-60"
          :disabled="busy"
          data-action="delete"
          @click="confirming = true"
        >
          <AppIcon name="trash" class="size-[18px]" />
          {{ t('multiples.savedList.delete') }}
        </button>
      </div>
    </div>
  </article>
</template>
