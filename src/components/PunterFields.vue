<script setup lang="ts">
import { computed, ref } from 'vue'
import AutoComplete, { type AutoCompleteCompleteEvent } from 'primevue/autocomplete'
import InputText from 'primevue/inputtext'
import ToggleSwitch from 'primevue/toggleswitch'
import { parseDecimal } from '@/domain/decimal'
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

const suggestions = ref<string[]>([])

/** The stake is typed in units; in euros mode its euro value shows beside it. */
const stakeHint = computed(() => {
  const units = parseDecimal(stake.value)
  if (props.moneyDisplay !== 'euros' || units == null || !(units > 0)) return 'unidades'
  return `unidades · ${formatMoney(units, props.unitValue, 'euros', { signed: false })}`
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
        <span class="text-[15px] font-semibold">Aposta real (punter)</span>
        <span class="text-[13px] text-eb-muted">Conta para o lucro real</span>
      </span>
      <ToggleSwitch :model-value="isPunter" input-id="is-punter" @update:model-value="toggle" />
    </label>

    <template v-if="isPunter">
      <div class="flex flex-col gap-1.5">
        <label for="stake" class="text-[13px] font-semibold text-eb-muted">Valor apostado</label>
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
        <small v-if="stakeError" id="stake-error" class="text-eb-neg">{{ stakeError }}</small>
      </div>
      <div class="flex flex-col gap-1.5">
        <label for="bookmaker" class="text-[13px] font-semibold text-eb-muted">
          Casa de apostas
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
