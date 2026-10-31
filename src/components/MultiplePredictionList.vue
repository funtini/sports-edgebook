<script setup lang="ts">
import { computed, ref } from 'vue'
import { useLocale } from '@/composables/useLocale'
import { formatTime } from '@/domain/intl'
import { formatDecimal } from '@/domain/money'
import { valueBand, valueIndex } from '@/domain/value'
import type { PredictionWithRelations } from '@/types/db'
import AppIcon from './AppIcon.vue'
import { VALUE_BAND_STYLES, valueRowLabel } from './valueBands'

/** The generator window's predictions, searchable, each with a "+" that adds it to the multiple. */
const props = defineProps<{
  predictions: PredictionWithRelations[]
  /** Prediction ids already in the multiple. */
  inSlip: ReadonlySet<string>
  /** Event ids already in the multiple. */
  usedEvents: ReadonlySet<string>
}>()

defineEmits<{ add: [prediction: PredictionWithRelations] }>()

const { t, intlLocale, betParts } = useLocale()
const query = ref('')

/** Lower case without accents, so "sporting" finds "Sporting" and "golos" finds "Golos". */
const fold = (text: string) =>
  text
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()

const rows = computed(() =>
  props.predictions.map((prediction) => {
    const { event } = prediction
    const game = `${event.home_team.name} – ${event.away_team.name}`
    const parts = betParts(prediction)
    const bet = `${parts[0]} · ${parts[3]}`
    const index = valueIndex(prediction.probability, prediction.odd)
    const band = valueBand(index)
    const state = props.inSlip.has(prediction.id)
      ? 'inSlip'
      : props.usedEvents.has(prediction.event_id)
        ? 'gameInSlip'
        : null
    return {
      prediction,
      game,
      bet,
      time: formatTime(new Date(event.kickoff_at), intlLocale.value),
      value: {
        dot: VALUE_BAND_STYLES[band].fill,
        text: VALUE_BAND_STYLES[band].text,
        label: valueRowLabel(
          band,
          t(`valueBand.row.${band}`),
          formatDecimal(index, intlLocale.value),
        ),
      },
      state,
      search: fold([game, event.league?.name ?? '', parts.join(' ')].join(' ')),
    }
  }),
)

const shown = computed(() => {
  const words = fold(query.value).split(/\s+/).filter(Boolean)
  return rows.value.filter((row) => words.every((word) => row.search.includes(word)))
})
</script>

<template>
  <div class="flex min-h-0 flex-col gap-2.5">
    <label class="relative block">
      <span class="sr-only">{{ t('multiples.list.search') }}</span>
      <AppIcon
        name="search"
        class="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-eb-muted"
      />
      <input
        v-model="query"
        type="search"
        autocomplete="off"
        :placeholder="t('multiples.list.search')"
        class="min-h-11 w-full rounded-xl border border-eb-border bg-eb-surface pr-3 pl-9 text-[15px] text-eb-text outline-none placeholder:text-eb-muted focus:border-eb-accent"
        data-search
      />
    </label>
    <p v-if="!predictions.length" class="m-0 py-3 text-center text-sm text-eb-muted">
      {{ t('multiples.list.empty') }}
    </p>
    <p v-else-if="!shown.length" class="m-0 py-3 text-center text-sm text-eb-muted">
      {{ t('multiples.list.noMatch') }}
    </p>
    <ul
      v-else
      class="m-0 list-none divide-y divide-eb-border overflow-y-auto rounded-xl border border-eb-border p-0"
      data-prediction-list
    >
      <li
        v-for="row in shown"
        :key="row.prediction.id"
        class="flex items-center gap-2.5 px-3 py-2 tabular-nums"
        :class="row.state && 'opacity-55'"
        :data-prediction="row.prediction.id"
      >
        <div class="min-w-0 flex-1">
          <div class="truncate text-[13px] font-semibold">
            <span class="text-eb-muted">{{ row.time }}</span> · {{ row.game }}
          </div>
          <div class="truncate text-xs text-eb-muted">{{ row.bet }}</div>
          <div
            class="mt-0.5 flex items-center gap-1.5 text-xs font-semibold"
            :class="row.value.text"
          >
            <span class="size-2 shrink-0 rounded-full" :class="row.value.dot" aria-hidden="true" />
            <span class="truncate">{{ row.value.label }}</span>
          </div>
        </div>
        <span class="text-base font-bold">{{ formatDecimal(row.prediction.odd, intlLocale) }}</span>
        <span
          v-if="row.state"
          class="w-[76px] shrink-0 text-right text-[11px] leading-tight font-semibold text-eb-muted"
          :data-state="row.state"
          >{{ t(`multiples.list.${row.state}`) }}</span
        >
        <button
          v-else
          type="button"
          class="flex size-11 shrink-0 items-center justify-center rounded-xl border border-eb-border text-eb-accent-text hover:bg-eb-accent-soft"
          :aria-label="t('multiples.list.add', { name: `${row.game} · ${row.bet}` })"
          data-action="add"
          @click="$emit('add', row.prediction)"
        >
          <AppIcon name="plus" class="size-[18px]" />
        </button>
      </li>
    </ul>
  </div>
</template>
