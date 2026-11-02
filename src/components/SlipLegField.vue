<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import InputText from 'primevue/inputtext'
import ChipGroup from './ChipGroup.vue'
import SegmentedControl from './SegmentedControl.vue'
import { useLocale } from '@/composables/useLocale'
import { parseDecimal } from '@/domain/decimal'
import { numberFormat } from '@/domain/intl'
import {
  BET_TYPES_BY_MARKET,
  lineKind,
  MARKETS,
  MATCH_PERIODS,
  PICKS,
  type BetType,
  type Market,
  type MatchPeriod,
  type OverUnder,
} from '@/domain/markets'
import {
  fromLocalInput,
  joinSelection,
  selectionOverUnder,
  selectionSide,
  toLocalInput,
  withBetType,
  withMarket,
} from '@/domain/slipLegEdit'
import { SLIP_STATUSES, type SlipLeg, type SlipLegField, type SlipStatus } from '@/domain/slipRead'

/** One field of a slip leg with its Registo control (docs/specs/slip-import.md#prediction-cards). */
const props = defineProps<{
  field: SlipLegField
  /** Prefix for input ids, unique per card. */
  idPrefix: string
  invalid?: boolean
}>()

const leg = defineModel<SlipLeg>('leg', { required: true })

const { t, intlLocale } = useLocale()
const id = computed(() => `${props.idPrefix}-${props.field}`)
const label = computed(() => t(`slipImport.field.${props.field}`))

function patch(values: Partial<SlipLeg>) {
  leg.value = { ...leg.value, ...values }
}

// Text fields
const textValue = computed({
  get: () => {
    const value = leg.value[props.field as 'homeTeam' | 'awayTeam' | 'league']
    return value ?? ''
  },
  set: (value: string) => {
    if (props.field === 'league') patch({ league: value.trim() ? value : null })
    else patch({ [props.field]: value })
  },
})

const kickoff = computed({
  get: () => toLocalInput(leg.value.kickoffAt),
  set: (value: string) => patch({ kickoffAt: fromLocalInput(value) }),
})

// Numbers are typed as text and kept in the leg once they read as numbers.
const decimal = computed(() =>
  numberFormat(intlLocale.value, { maximumFractionDigits: 3, useGrouping: false }),
)
const numberField = computed(() => props.field as 'line' | 'odd')
const format = (value: number | null) => (value == null ? '' : decimal.value.format(value))
const numberText = ref(
  props.field === 'line' || props.field === 'odd' ? format(leg.value[numberField.value]) : '',
)
watch(
  () => (props.field === 'line' || props.field === 'odd' ? leg.value[numberField.value] : null),
  (value) => {
    if (parseDecimal(numberText.value) !== value) numberText.value = format(value)
  },
)
function typeNumber(text: string | undefined) {
  numberText.value = text ?? ''
  const value = parseDecimal(numberText.value)
  patch({ [numberField.value]: value != null && Number.isFinite(value) ? value : null })
}

// Catalogue fields
const timingOptions = computed(() => [
  { value: 'pre' as const, label: t('timing.prematch') },
  { value: 'live' as const, label: t('timing.live') },
])
const timing = computed({
  get: () => leg.value.timing ?? 'pre',
  set: (value: 'pre' | 'live') => patch({ timing: value }),
})

const marketOptions = computed(() =>
  MARKETS.map((value) => ({ value, label: t(`catalogue.market.${value}`) })),
)
const market = computed({
  get: () => (leg.value.market ?? '') as Market,
  set: (value: Market) => (leg.value = withMarket(leg.value, value)),
})

const betTypeOptions = computed(() =>
  (leg.value.market ? BET_TYPES_BY_MARKET[leg.value.market] : []).map((value) => ({
    value,
    label: t(`catalogue.betType.${value}`),
  })),
)
const betType = computed({
  get: () => (leg.value.betType ?? '') as BetType,
  set: (value: BetType) => (leg.value = withBetType(leg.value, value)),
})

const periodOptions = MATCH_PERIODS.map((value) => ({ value, label: value }))
const period = computed({
  get: () => (leg.value.period ?? '') as MatchPeriod,
  set: (value: MatchPeriod) => patch({ period: value }),
})

const statusOptions = computed(() =>
  SLIP_STATUSES.map((value) => ({ value, label: t(`slipImport.status.${value}`) })),
)
const status = computed({
  get: () => leg.value.status ?? 'pending',
  set: (value: SlipStatus) => patch({ status: value }),
})

const currentType = computed(() => leg.value.betType)
const hasTotal = computed(() => !!currentType.value && lineKind(currentType.value) === 'total')
const pickOptions = computed(() =>
  currentType.value
    ? PICKS[currentType.value].map((value) => ({ value, label: t(`catalogue.pick.${value}`) }))
    : [],
)
const overUnderOptions = computed(() =>
  (['over', 'under'] as const).map((value) => ({
    value,
    label: t(`catalogue.overUnder.${value}`),
  })),
)
const side = ref(selectionSide(leg.value.betType ?? 'other', leg.value.selection))
const overUnder = ref<OverUnder>(selectionOverUnder(leg.value.selection))
watch(
  () => [leg.value.betType, leg.value.selection] as const,
  ([type, selection]) => {
    const joined = type ? joinSelection(type, side.value, overUnder.value) : null
    if (joined === selection) return
    side.value = selectionSide(type ?? 'other', selection)
    overUnder.value = selectionOverUnder(selection)
  },
)
function setSelection(nextSide: string, nextOverUnder: OverUnder) {
  side.value = nextSide
  overUnder.value = nextOverUnder
  if (currentType.value)
    patch({ selection: joinSelection(currentType.value, nextSide, nextOverUnder) })
}
const sideModel = computed({
  get: () => side.value,
  set: (value: string) => setSelection(value, overUnder.value),
})
const overUnderModel = computed({
  get: () => overUnder.value,
  set: (value: OverUnder) => setSelection(side.value, value),
})
</script>

<template>
  <div class="flex min-w-0 flex-col gap-1.5" :data-field="field">
    <template v-if="field === 'homeTeam' || field === 'awayTeam' || field === 'league'">
      <label :for="id" class="text-[13px] font-semibold text-eb-muted">{{ label }}</label>
      <InputText
        :id="id"
        v-model="textValue"
        autocomplete="off"
        class="min-h-11 w-full"
        :invalid="invalid"
      />
    </template>

    <template v-else-if="field === 'kickoffAt'">
      <label :for="id" class="text-[13px] font-semibold text-eb-muted">{{ label }}</label>
      <InputText
        :id="id"
        v-model="kickoff"
        type="datetime-local"
        class="min-h-11 w-full"
        :invalid="invalid"
      />
    </template>

    <template v-else-if="field === 'line' || field === 'odd'">
      <label :for="id" class="text-[13px] font-semibold text-eb-muted">{{ label }}</label>
      <InputText
        :id="id"
        :model-value="numberText"
        inputmode="decimal"
        autocomplete="off"
        class="min-h-11 w-full tabular-nums"
        :class="field === 'odd' && 'text-lg font-bold'"
        :disabled="field === 'line' && !!currentType && !lineKind(currentType)"
        :invalid="invalid"
        @update:model-value="typeNumber"
      />
    </template>

    <template v-else-if="field === 'timing'">
      <span class="text-[13px] font-semibold text-eb-muted">{{ label }}</span>
      <SegmentedControl v-model="timing" :options="timingOptions" :label="label" />
    </template>

    <template v-else-if="field === 'market'">
      <span class="text-[13px] font-semibold text-eb-muted">{{ label }}</span>
      <ChipGroup v-model="market" :options="marketOptions" :label="label" :invalid="invalid" />
    </template>

    <template v-else-if="field === 'betType'">
      <span class="text-[13px] font-semibold text-eb-muted">{{ label }}</span>
      <ChipGroup v-model="betType" :options="betTypeOptions" :label="label" :invalid="invalid" />
    </template>

    <template v-else-if="field === 'period'">
      <span class="text-[13px] font-semibold text-eb-muted">{{ label }}</span>
      <SegmentedControl v-model="period" :options="periodOptions" :label="label" />
    </template>

    <template v-else-if="field === 'status'">
      <span class="text-[13px] font-semibold text-eb-muted">{{ label }}</span>
      <ChipGroup v-model="status" :options="statusOptions" :label="label" />
    </template>

    <template v-else-if="field === 'selection'">
      <span v-if="currentType !== 'other'" class="text-[13px] font-semibold text-eb-muted">{{
        label
      }}</span>
      <label v-else :for="id" class="text-[13px] font-semibold text-eb-muted">{{ label }}</label>
      <InputText
        v-if="currentType === 'other'"
        :id="id"
        v-model="sideModel"
        autocomplete="off"
        class="min-h-11 w-full"
        :invalid="invalid"
      />
      <div v-else class="flex flex-col gap-2">
        <ChipGroup
          v-if="pickOptions.length > 0"
          v-model="sideModel"
          :options="pickOptions"
          :label="label"
          :invalid="invalid"
        />
        <SegmentedControl
          v-if="hasTotal"
          v-model="overUnderModel"
          :options="overUnderOptions"
          :label="t('logging.overUnder')"
          class="max-w-[240px]"
        />
      </div>
    </template>
  </div>
</template>
