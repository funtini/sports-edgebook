<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import AutoComplete, { type AutoCompleteCompleteEvent } from 'primevue/autocomplete'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Textarea from 'primevue/textarea'
import { useToast } from 'primevue/usetoast'
import GamePicker from '@/components/GamePicker.vue'
import PunterFields from '@/components/PunterFields.vue'
import ValueIndex from '@/components/ValueIndex.vue'
import { CONFIDENCE_LABELS, CONFIDENCE_LEVELS, probabilityFor } from '@/domain/confidence'
import { parseDecimal, toggleSign } from '@/domain/decimal'
import { toSearchResult, type EventSearchResult } from '@/domain/eventSource'
import { suggestNames } from '@/domain/names'
import { emptyPredictionDraft, marketInput, predictionInput } from '@/domain/predictionDraft'
import {
  marketFormSchema,
  newGameFormSchema,
  predictionFormSchema,
  type NewGameForm,
  type PredictionForm,
} from '@/domain/schemas'
import { UserError, userMessage } from '@/lib/errors'
import { useEventsStore } from '@/stores/events'
import { usePredictionsStore } from '@/stores/predictions'
import { useReferenceStore } from '@/stores/reference'
import { useSettingsStore } from '@/stores/settings'

const props = defineProps<{
  /** Game to preselect, from `?evento=<id>`; ignored when it does not exist. */
  eventId?: string
}>()

type ErrorKey = 'game' | keyof NewGameForm | 'category' | 'marketName' | keyof PredictionForm
type FieldErrors = Partial<Record<ErrorKey, string>>

const events = useEventsStore()
const predictions = usePredictionsStore()
const reference = useReferenceStore()
const settings = useSettingsStore()
const toast = useToast()

const loading = ref(true)
const saving = ref(false)
const error = ref<string | null>(null)
const errors = ref<FieldErrors>({})
const bookmakers = ref<string[]>([])

const game = ref<EventSearchResult | null>(null)
const newGame = ref<NewGameForm | null>(null)
/** Event id of the game kept after the last save, shown as "Mesmo jogo". */
const keptEventId = ref<string | null>(null)
const draft = reactive(emptyPredictionDraft())
const showNotes = ref(false)

const categorySuggestions = ref<string[]>([])
const marketNameSuggestions = ref<string[]>([])

const kept = computed(() => !!game.value && game.value.eventId === keptEventId.value)
const probability = computed(() =>
  draft.confidence == null ? null : probabilityFor(draft.confidence, settings.confidenceAnchors),
)
const parsedOdd = computed(() => parseDecimal(draft.odd))

const completeCategory = (event: AutoCompleteCompleteEvent) =>
  (categorySuggestions.value = suggestNames(
    reference.markets.map((m) => m.category),
    event.query,
  ))
const completeMarketName = (event: AutoCompleteCompleteEvent) => {
  const category = draft.category.trim().toLowerCase()
  const markets = category
    ? reference.markets.filter((m) => m.category.toLowerCase() === category)
    : reference.markets
  marketNameSuggestions.value = suggestNames(
    markets.map((m) => m.name),
    event.query,
  )
}

/** Clears everything about the prediction but keeps the game. */
function resetPrediction() {
  Object.assign(draft, emptyPredictionDraft())
  showNotes.value = false
  errors.value = {}
}

/** Adds each field's first issue to `found`, under `rename[path]` when given. */
function collect(
  found: FieldErrors,
  result: { error?: { issues: { path: PropertyKey[]; message: string }[] } } | null,
  rename: Partial<Record<string, ErrorKey>> = {},
) {
  for (const issue of result?.error?.issues ?? []) {
    const path = String(issue.path[0])
    found[rename[path] ?? (path as ErrorKey)] ??= issue.message
  }
}

async function save() {
  error.value = null
  const found: FieldErrors = {}
  if (!game.value && !newGame.value) found.game = 'Escolhe o jogo ou cria um novo'
  const gameResult = newGame.value ? newGameFormSchema.safeParse(newGame.value) : null
  const marketResult = marketFormSchema.safeParse(marketInput(draft))
  const predictionResult = predictionFormSchema.safeParse(predictionInput(draft))
  collect(found, gameResult)
  collect(found, marketResult, { name: 'marketName' })
  collect(found, predictionResult)
  errors.value = found
  if (Object.keys(found).length > 0 || !marketResult.success || !predictionResult.success) return

  saving.value = true
  try {
    if (gameResult?.success) {
      const { league: leagueName, home, away, kickoff_at } = gameResult.data
      const league = leagueName ? await reference.ensureLeague(leagueName) : null
      const leagueId = league?.id ?? null
      const homeTeam = await reference.ensureTeam(home, leagueId)
      const awayTeam = await reference.ensureTeam(away, leagueId)
      const event = await events.create({
        kickoff_at,
        league_id: leagueId,
        home_team_id: homeTeam.id,
        away_team_id: awayTeam.id,
      })
      // From here on the game exists: a failure below must not create it twice.
      game.value = toSearchResult(event)
      newGame.value = null
    }
    const eventId = game.value?.eventId
    if (!eventId) throw new UserError('Este jogo ainda não está guardado.')
    const market = await reference.ensureMarket(marketResult.data.category, marketResult.data.name)
    await predictions.create({ ...predictionResult.data, event_id: eventId, market_id: market.id })

    const usedBookmaker = predictionResult.data.bookmaker
    if (usedBookmaker && !bookmakers.value.includes(usedBookmaker)) {
      bookmakers.value.push(usedBookmaker)
    }
    toast.add({ severity: 'success', summary: 'Prognóstico guardado', life: 2500 })
    keptEventId.value = eventId
    resetPrediction()
  } catch (e) {
    error.value = userMessage(e, 'Não foi possível guardar o prognóstico.')
  } finally {
    saving.value = false
  }
}

/** Picks the `?evento` game unless one was chosen meanwhile; optional, so failures are ignored. */
async function preselect(eventId: string) {
  try {
    const event = await events.getById(eventId)
    if (event && !game.value && !newGame.value) game.value = toSearchResult(event)
  } catch (e) {
    console.error(e)
  }
}

onMounted(async () => {
  if (props.eventId) void preselect(props.eventId)
  try {
    // Settings first: a new user's first load seeds the default markets.
    await settings.ensureLoaded()
    const [, used] = await Promise.all([reference.load(), predictions.listBookmakers()])
    bookmakers.value = used
  } catch (e) {
    error.value = userMessage(e, 'Não foi possível carregar os dados.')
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="mx-auto flex max-w-xl flex-col gap-5">
    <h1 class="m-0 text-2xl font-semibold">Registo</h1>

    <form
      class="flex flex-col gap-6 rounded-xl border border-surface-200 bg-surface-0 p-4 sm:p-5"
      novalidate
      @submit.prevent="save"
    >
      <fieldset class="m-0 flex min-w-0 flex-col gap-3 border-0 p-0" :disabled="loading">
        <legend class="mb-1 p-0 text-lg font-semibold">Jogo</legend>
        <GamePicker v-model:game="game" v-model:new-game="newGame" :errors="errors" :kept="kept" />
      </fieldset>

      <fieldset class="m-0 flex min-w-0 flex-col gap-3 border-0 p-0" :disabled="loading">
        <legend class="mb-1 p-0 text-lg font-semibold">Prognóstico</legend>
        <div class="grid grid-cols-2 gap-3">
          <div class="flex min-w-0 flex-col gap-1">
            <label for="category" class="text-sm font-medium">Mercado</label>
            <AutoComplete
              v-model="draft.category"
              input-id="category"
              :suggestions="categorySuggestions"
              input-class="min-h-11 w-full"
              :invalid="!!errors.category"
              dropdown
              fluid
              @complete="completeCategory"
            />
            <small v-if="errors.category" class="text-red-600">{{ errors.category }}</small>
          </div>
          <div class="flex min-w-0 flex-col gap-1">
            <label for="market-name" class="text-sm font-medium">Tipo</label>
            <AutoComplete
              v-model="draft.marketName"
              input-id="market-name"
              :suggestions="marketNameSuggestions"
              input-class="min-h-11 w-full"
              :invalid="!!errors.marketName"
              dropdown
              fluid
              @complete="completeMarketName"
            />
            <small v-if="errors.marketName" class="text-red-600">{{ errors.marketName }}</small>
          </div>
        </div>

        <div class="grid grid-cols-[minmax(0,1fr)_8rem] gap-3">
          <div class="flex min-w-0 flex-col gap-1">
            <label for="selection" class="text-sm font-medium">Aposta</label>
            <InputText
              id="selection"
              v-model="draft.selection"
              autocomplete="off"
              class="min-h-11 w-full"
              :invalid="!!errors.selection"
            />
          </div>
          <div class="flex min-w-0 flex-col gap-1">
            <label for="line" class="text-sm font-medium">Linha</label>
            <div class="flex gap-1">
              <InputText
                id="line"
                v-model="draft.line"
                inputmode="decimal"
                placeholder="2,5"
                autocomplete="off"
                class="min-h-11 w-full min-w-0"
                :invalid="!!errors.line"
              />
              <Button
                type="button"
                label="±"
                aria-label="Trocar o sinal da linha"
                severity="secondary"
                outlined
                class="min-h-11 min-w-11 shrink-0"
                @click="draft.line = toggleSign(draft.line)"
              />
            </div>
          </div>
          <small v-if="errors.selection" class="col-span-2 text-red-600">
            {{ errors.selection }}
          </small>
          <small v-if="errors.line" class="col-span-2 text-red-600">{{ errors.line }}</small>
        </div>

        <div class="flex flex-col gap-1">
          <label for="odd" class="text-sm font-medium">Odd</label>
          <InputText
            id="odd"
            v-model="draft.odd"
            inputmode="decimal"
            placeholder="1,85"
            autocomplete="off"
            class="min-h-11 w-full text-lg"
            :invalid="!!errors.odd"
          />
          <small v-if="errors.odd" class="text-red-600">{{ errors.odd }}</small>
        </div>
      </fieldset>

      <fieldset class="m-0 flex min-w-0 flex-col gap-3 border-0 p-0" :disabled="loading">
        <legend class="mb-1 p-0 text-lg font-semibold">Confiança</legend>
        <div class="grid grid-cols-5 gap-2">
          <button
            v-for="level in CONFIDENCE_LEVELS"
            :key="level"
            type="button"
            class="flex min-h-16 min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg border px-1 py-2 transition-colors"
            :class="
              draft.confidence === level
                ? 'border-primary bg-primary text-primary-contrast'
                : 'border-surface-300 bg-surface-0 text-surface-700 hover:bg-surface-100'
            "
            :aria-pressed="draft.confidence === level"
            @click="draft.confidence = level"
          >
            <span class="text-xl font-semibold">{{ level }}</span>
            <span class="text-center text-xs leading-tight">{{ CONFIDENCE_LABELS[level] }}</span>
          </button>
        </div>
        <small v-if="errors.confidence" class="text-red-600">{{ errors.confidence }}</small>
        <ValueIndex :odd="parsedOdd" :probability="probability" />
      </fieldset>

      <PunterFields
        v-model:is-punter="draft.isPunter"
        v-model:stake="draft.stake"
        v-model:bookmaker="draft.bookmaker"
        :bookmakers="bookmakers"
        :stake-error="errors.stake_units"
      />

      <div class="flex flex-col gap-1">
        <Button
          v-if="!showNotes"
          type="button"
          label="Adicionar notas"
          text
          class="min-h-11 self-start"
          @click="showNotes = true"
        />
        <template v-else>
          <label for="notes" class="text-sm font-medium">Notas</label>
          <Textarea id="notes" v-model="draft.notes" rows="3" auto-resize class="w-full" />
        </template>
      </div>

      <Message v-if="error" severity="error">{{ error }}</Message>
      <Button
        type="submit"
        label="Guardar"
        :loading="saving"
        :disabled="loading"
        class="min-h-12"
      />
    </form>
  </div>
</template>
