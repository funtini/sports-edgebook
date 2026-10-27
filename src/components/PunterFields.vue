<script setup lang="ts">
import { computed, ref } from 'vue'
import AutoComplete, { type AutoCompleteCompleteEvent } from 'primevue/autocomplete'
import InputText from 'primevue/inputtext'
import ToggleSwitch from 'primevue/toggleswitch'
import { parseDecimal } from '@/domain/decimal'
import { useLocale } from '@/composables/useLocale'
import { DEFAULT_UNIT_VALUE, formatMoney, type MoneyDisplay } from '@/domain/money'
import { suggestNames } from '@/domain/names'

const props = withDefaults(
  defineProps<{
    /** Bookmakers used before, for autocomplete. */
    bookmakers: string[]
    stakeError?: string
    unitValue?: number
    moneyDisplay?: MoneyDisplay
  }>(),
  { stakeError: undefined, unitValue: DEFAULT_UNIT_VALUE, moneyDisplay: 'units' },
)

const isPunter = defineModel<boolean>('isPunter', { required: true })
/** Stake in units, as typed (comma or dot). */
const stake = defineModel<string>('stake', { required: true })
const bookmaker = defineModel<string>('bookmaker', { required: true })

const { t, intlLocale, message } = useLocale()
const suggestions = ref<string[]>([])

/** The stake is typed in units; in euros mode its euro value shows beside it. */
const stakeHint = computed(() => {
  const units = parseDecimal(stake.value)
  const label = t('punter.units')
  if (props.moneyDisplay !== 'euros' || units == null || !(units > 0)) return label
  const euros = formatMoney(units, props.unitValue, 'euros', { signed: false }, intlLocale.value)
  return `${label} · ${euros}`
})

function toggle(on: boolean) {
  isPunter.value = on
  // A single bet starts at the base stake of 1 unit.
  if (on && !stake.value.trim()) stake.value = '1'
}

function complete(event: AutoCompleteCompleteEvent) {
  suggestions.value = suggestNames(props.bookmakers, event.query)
}
</script>

<template>
  <div class="flex flex-col gap-3.5 rounded-2xl border border-eb-border bg-eb-surface px-4 py-3.5">
    <label class="flex min-h-11 cursor-pointer items-center justify-between gap-3">
      <span class="flex flex-col">
        <span class="text-[15px] font-semibold">{{ t('punter.title') }}</span>
        <span class="text-[13px] text-eb-muted">{{ t('punter.hint') }}</span>
      </span>
      <ToggleSwitch :model-value="isPunter" input-id="is-punter" @update:model-value="toggle" />
    </label>

    <template v-if="isPunter">
      <div class="flex flex-col gap-1.5">
        <label for="stake" class="text-[13px] font-semibold text-eb-muted">
          {{ t('punter.stake') }}
        </label>
        <div class="flex items-center gap-3">
          <InputText
            id="stake"
            v-model="stake"
            inputmode="decimal"
            autocomplete="off"
            class="min-h-12 w-28 text-xl font-bold !text-eb-info tabular-nums"
            :invalid="!!stakeError"
            :aria-describedby="stakeError ? 'stake-error' : undefined"
          />
          <span class="text-[13px] text-eb-info tabular-nums" data-hint="stake">
            {{ stakeHint }}
          </span>
        </div>
        <small v-if="stakeError" id="stake-error" class="text-eb-neg">{{
          message(stakeError)
        }}</small>
      </div>
      <div class="flex flex-col gap-1.5">
        <label for="bookmaker" class="text-[13px] font-semibold text-eb-muted">
          {{ t('punter.bookmaker') }}
        </label>
        <AutoComplete
          v-model="bookmaker"
          input-id="bookmaker"
          :suggestions="suggestions"
          input-class="min-h-12 w-full"
          fluid
          @complete="complete"
        />
      </div>
    </template>
  </div>
</template>
