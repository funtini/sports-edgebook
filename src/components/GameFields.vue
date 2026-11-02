<script setup lang="ts">
import { ref } from 'vue'
import AutoComplete, { type AutoCompleteCompleteEvent } from 'primevue/autocomplete'
import InputText from 'primevue/inputtext'
import { useLocale } from '@/composables/useLocale'
import { suggestNames } from '@/domain/names'
import type { NewGameForm } from '@/domain/schemas'
import { useReferenceStore } from '@/stores/reference'

export type GameFieldErrors = Partial<Record<keyof NewGameForm, string>>

/**
 * Data, Hora, Liga, Equipa da casa and Equipa de fora of a game, with league and team names
 * suggested from the owner's lists. Used by "Novo evento" (Registo) and "Editar evento" (Evento).
 */
withDefaults(
  defineProps<{
    errors: GameFieldErrors
    /** Prefix of the inputs' ids (`<prefix>-date`, `<prefix>-home`...). */
    idPrefix?: string
  }>(),
  { idPrefix: 'new' },
)

const game = defineModel<NewGameForm>({ required: true })

const reference = useReferenceStore()
const { t, message } = useLocale()

const leagueSuggestions = ref<string[]>([])
const teamSuggestions = ref<string[]>([])

const completeLeague = (event: AutoCompleteCompleteEvent) =>
  (leagueSuggestions.value = suggestNames(
    reference.leagues.map((l) => l.name),
    event.query,
  ))
const completeTeam = (event: AutoCompleteCompleteEvent) =>
  (teamSuggestions.value = suggestNames(
    reference.teams.map((t) => t.name),
    event.query,
  ))
</script>

<template>
  <div class="grid grid-cols-2 gap-3">
    <div class="flex min-w-0 flex-col gap-1">
      <label :for="`${idPrefix}-date`" class="text-[13px] font-semibold text-eb-muted">{{
        t('gamePicker.date')
      }}</label>
      <InputText
        :id="`${idPrefix}-date`"
        v-model="game.date"
        type="date"
        class="min-h-12 w-full"
        :invalid="!!errors.date"
      />
    </div>
    <div class="flex min-w-0 flex-col gap-1">
      <label :for="`${idPrefix}-time`" class="text-[13px] font-semibold text-eb-muted">{{
        t('gamePicker.time')
      }}</label>
      <InputText
        :id="`${idPrefix}-time`"
        v-model="game.time"
        type="time"
        class="min-h-12 w-full"
        :invalid="!!errors.time"
      />
    </div>
    <small v-if="errors.date || errors.time" class="col-span-2 text-eb-neg">
      {{ message(errors.date ?? errors.time ?? '') }}
    </small>
  </div>
  <div class="flex flex-col gap-1">
    <label :for="`${idPrefix}-league`" class="text-[13px] font-semibold text-eb-muted">{{
      t('gamePicker.league')
    }}</label>
    <AutoComplete
      v-model="game.league"
      :input-id="`${idPrefix}-league`"
      :suggestions="leagueSuggestions"
      input-class="min-h-12 w-full"
      fluid
      @complete="completeLeague"
    />
  </div>
  <div class="flex flex-col gap-1">
    <label :for="`${idPrefix}-home`" class="text-[13px] font-semibold text-eb-muted">{{
      t('gamePicker.home')
    }}</label>
    <AutoComplete
      v-model="game.home"
      :input-id="`${idPrefix}-home`"
      :suggestions="teamSuggestions"
      input-class="min-h-12 w-full"
      :invalid="!!errors.home"
      fluid
      @complete="completeTeam"
    />
    <small v-if="errors.home" class="text-eb-neg">{{ message(errors.home) }}</small>
  </div>
  <div class="flex flex-col gap-1">
    <label :for="`${idPrefix}-away`" class="text-[13px] font-semibold text-eb-muted">{{
      t('gamePicker.away')
    }}</label>
    <AutoComplete
      v-model="game.away"
      :input-id="`${idPrefix}-away`"
      :suggestions="teamSuggestions"
      input-class="min-h-12 w-full"
      :invalid="!!errors.away"
      fluid
      @complete="completeTeam"
    />
    <small v-if="errors.away" class="text-eb-neg">{{ message(errors.away) }}</small>
  </div>
</template>
