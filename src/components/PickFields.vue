<script setup lang="ts">
import { computed, watch } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import AppIcon from './AppIcon.vue'
import ChipGroup from './ChipGroup.vue'
import SegmentedControl from './SegmentedControl.vue'
import { useLocale } from '@/composables/useLocale'
import { parseDecimal, toggleSign } from '@/domain/decimal'
import { numberFormat } from '@/domain/intl'
import {
  BET_TYPES_BY_MARKET,
  lineKind,
  MARKETS,
  MATCH_PERIODS,
  PICKS,
  stepLine,
  type BetType,
  type Market,
  type MatchPeriod,
  type OverUnder,
} from '@/domain/markets'

/**
 * Mercado, Tipo, Período, Seleção and Linha of a prediction (docs/specs/ui.md#registo), shared by
 * Registo and "Editar prognóstico". The default slot goes last in the grid, beside Linha (the Odd).
 */
const props = withDefaults(
  defineProps<{
    errors?: Partial<Record<'bet_type' | 'selection' | 'line', string>>
    /** Prefix for the input ids, so two forms on a page do not clash. */
    idPrefix?: string
    /** From `lg`, Período / Seleção and Linha / Odd side by side (Registo). */
    columns?: boolean
  }>(),
  { errors: () => ({}), idPrefix: '', columns: true },
)

const market = defineModel<Market>('market', { required: true })
const betType = defineModel<BetType>('betType', { required: true })
const period = defineModel<MatchPeriod>('period', { required: true })
const pick = defineModel<string>('pick', { required: true })
const line = defineModel<string>('line', { required: true })
const overUnder = defineModel<OverUnder>('overUnder', { required: true })

const { t, intlLocale, message } = useLocale()

const ids = computed(() => ({
  selection: `${props.idPrefix}selection`,
  line: `${props.idPrefix}line`,
}))

const marketOptions = computed(() =>
  MARKETS.map((value) => ({ value, label: t(`catalogue.market.${value}`) })),
)
const betTypeOptions = computed(() =>
  BET_TYPES_BY_MARKET[market.value].map((value) => ({
    value,
    label: t(`catalogue.betType.${value}`),
  })),
)
const periodOptions = MATCH_PERIODS.map((value) => ({ value, label: value }))
const overUnderOptions = computed(() =>
  (['over', 'under'] as const).map((value) => ({
    value,
    label: t(`catalogue.overUnder.${value}`),
  })),
)
const pickOptions = computed(() =>
  PICKS[betType.value].map((value) => ({ value, label: t(`catalogue.pick.${value}`) })),
)
const kind = computed(() => lineKind(betType.value))
/** Linha after − / +, null when it cannot step (see `stepLine`). */
const steppedLine = (direction: 1 | -1) =>
  kind.value ? stepLine(kind.value, parseDecimal(line.value), direction) : null
const lineFormat = computed(() =>
  numberFormat(intlLocale.value, { maximumFractionDigits: 2, useGrouping: false }),
)
function step(direction: 1 | -1) {
  const next = steppedLine(direction)
  if (next != null) line.value = lineFormat.value.format(next)
}

// A type the new market does not offer falls back to its first; a side only fits its own type.
watch(market, (value) => {
  if (!BET_TYPES_BY_MARKET[value].includes(betType.value)) {
    betType.value = BET_TYPES_BY_MARKET[value][0] as BetType
  }
})
watch(betType, (value) => {
  pick.value = ''
  if (!lineKind(value)) line.value = ''
})
</script>

<template>
  <div class="flex flex-col gap-1.5">
    <span class="text-[13px] font-semibold text-eb-muted">{{ t('logging.market') }}</span>
    <ChipGroup v-model="market" :options="marketOptions" :label="t('logging.market')" />
  </div>

  <div class="flex flex-col gap-1.5">
    <span class="text-[13px] font-semibold text-eb-muted">{{ t('logging.type') }}</span>
    <ChipGroup
      v-model="betType"
      :options="betTypeOptions"
      :label="t('logging.type')"
      :invalid="!!errors.bet_type"
    />
    <small v-if="errors.bet_type" class="text-eb-neg">{{ message(errors.bet_type) }}</small>
  </div>

  <!-- Desktop (Registo): Período and Seleção side by side, then Linha and Odd. -->
  <div
    class="flex flex-col gap-3"
    :class="columns && 'lg:grid lg:grid-cols-2 lg:items-start lg:gap-4'"
  >
    <div class="flex flex-col gap-1.5">
      <span class="text-[13px] font-semibold text-eb-muted">{{ t('logging.period') }}</span>
      <SegmentedControl v-model="period" :options="periodOptions" :label="t('logging.period')" />
    </div>

    <div v-if="betType === 'other'" class="flex flex-col gap-1">
      <label :for="ids.selection" class="text-[13px] font-semibold text-eb-muted">{{
        t('logging.selection')
      }}</label>
      <InputText
        :id="ids.selection"
        v-model="pick"
        autocomplete="off"
        :placeholder="t('logging.selectionPlaceholder')"
        class="min-h-12 w-full"
        :invalid="!!errors.selection"
      />
      <small v-if="errors.selection" class="text-eb-neg">{{ message(errors.selection) }}</small>
    </div>
    <div v-else-if="pickOptions.length > 0" class="flex flex-col gap-1.5">
      <span class="text-[13px] font-semibold text-eb-muted">{{ t('logging.selection') }}</span>
      <ChipGroup
        v-model="pick"
        :options="pickOptions"
        :label="t('logging.selection')"
        :invalid="!!errors.selection"
      />
      <small v-if="errors.selection" class="text-eb-neg">{{ message(errors.selection) }}</small>
    </div>

    <div v-if="kind" class="flex flex-col gap-1">
      <label :for="ids.line" class="text-[13px] font-semibold text-eb-muted">{{
        t('logging.line')
      }}</label>
      <div class="flex gap-1">
        <!-- A total's side is picked here, so its line is never signed. -->
        <SegmentedControl
          v-if="kind === 'total'"
          v-model="overUnder"
          :options="overUnderOptions"
          :label="t('logging.overUnder')"
          class="mr-1 shrink-0 [&_button]:px-3"
        />
        <Button
          type="button"
          :aria-label="t('logging.lineDown')"
          severity="secondary"
          outlined
          class="min-h-12 min-w-12 shrink-0"
          :disabled="steppedLine(-1) == null"
          data-line-down
          @click="step(-1)"
        >
          <AppIcon name="minus" class="size-4" stroke-width="2.5" />
        </Button>
        <InputText
          :id="ids.line"
          v-model="line"
          inputmode="decimal"
          :placeholder="
            t(kind === 'total' ? 'logging.lineTotalPlaceholder' : 'logging.lineHandicapPlaceholder')
          "
          autocomplete="off"
          class="min-h-12 w-full min-w-0 text-center tabular-nums"
          :invalid="!!errors.line"
        />
        <Button
          type="button"
          :aria-label="t('logging.lineUp')"
          severity="secondary"
          outlined
          class="min-h-12 min-w-12 shrink-0"
          :disabled="steppedLine(1) == null"
          data-line-up
          @click="step(1)"
        >
          <AppIcon name="plus" class="size-4" stroke-width="2.5" />
        </Button>
        <Button
          v-if="kind === 'handicap'"
          type="button"
          label="±"
          :aria-label="t('logging.toggleSign')"
          severity="secondary"
          outlined
          class="min-h-12 min-w-12 shrink-0"
          @click="line = toggleSign(line)"
        />
      </div>
      <small v-if="errors.line" class="text-eb-neg">{{ message(errors.line) }}</small>
    </div>

    <slot />
  </div>
</template>
