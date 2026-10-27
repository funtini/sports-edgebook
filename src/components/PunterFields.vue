<script setup lang="ts">
import { ref } from 'vue'
import AutoComplete, { type AutoCompleteCompleteEvent } from 'primevue/autocomplete'
import InputText from 'primevue/inputtext'
import ToggleSwitch from 'primevue/toggleswitch'

const props = defineProps<{
  /** Bookmakers used before, for autocomplete. */
  bookmakers: string[]
  stakeError?: string
}>()

const isPunter = defineModel<boolean>('isPunter', { required: true })
/** Stake in units, as typed (comma or dot). */
const stake = defineModel<string>('stake', { required: true })
const bookmaker = defineModel<string>('bookmaker', { required: true })

const suggestions = ref<string[]>([])

function toggle(on: boolean) {
  isPunter.value = on
  // A single bet starts at the base stake of 1 unit.
  if (on && !stake.value.trim()) stake.value = '1'
}

function complete(event: AutoCompleteCompleteEvent) {
  const q = event.query.trim().toLowerCase()
  suggestions.value = props.bookmakers.filter((b) => b.toLowerCase().includes(q))
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <label class="flex min-h-11 cursor-pointer items-center justify-between gap-3">
      <span class="flex flex-col">
        <span class="font-medium">Punter</span>
        <span class="text-sm text-surface-500">Apostei mesmo nesta seleção.</span>
      </span>
      <ToggleSwitch :model-value="isPunter" input-id="is-punter" @update:model-value="toggle" />
    </label>

    <div v-if="isPunter" class="grid grid-cols-[minmax(0,7rem)_minmax(0,1fr)] gap-3">
      <div class="flex flex-col gap-1">
        <label for="stake" class="text-sm font-medium">Stake (u)</label>
        <InputText
          id="stake"
          v-model="stake"
          inputmode="decimal"
          autocomplete="off"
          class="min-h-11 w-full"
          :invalid="!!stakeError"
          :aria-describedby="stakeError ? 'stake-error' : undefined"
        />
      </div>
      <div class="flex flex-col gap-1">
        <label for="bookmaker" class="text-sm font-medium">Casa de apostas</label>
        <AutoComplete
          v-model="bookmaker"
          input-id="bookmaker"
          :suggestions="suggestions"
          input-class="min-h-11 w-full"
          fluid
          @complete="complete"
        />
      </div>
      <small v-if="stakeError" id="stake-error" class="col-span-2 text-red-600">
        {{ stakeError }}
      </small>
    </div>
  </div>
</template>
