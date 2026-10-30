<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Textarea from 'primevue/textarea'
import { useToast } from 'primevue/usetoast'
import AppIcon from '@/components/AppIcon.vue'
import ChipGroup from '@/components/ChipGroup.vue'
import GamePicker from '@/components/GamePicker.vue'
import PunterFields from '@/components/PunterFields.vue'
import SegmentedControl from '@/components/SegmentedControl.vue'
import ValueIndex from '@/components/ValueIndex.vue'
import { useLocale } from '@/composables/useLocale'
import { CONFIDENCE_LEVELS, probabilityFor } from '@/domain/confidence'
import { parseDecimal, toggleSign } from '@/domain/decimal'
import { formatPercent } from '@/domain/intl'
import { formatDecimal } from '@/domain/money'
import { fairOdd } from '@/domain/value'
import { toSearchResult, type EventSearchResult } from '@/domain/eventSource'
import {
  BET_TYPES_BY_MARKET,
  lineKind,
  MARKETS,
  MATCH_PERIODS,
  PICKS,
  type BetType,
} from '@/domain/markets'
import { emptyPredictionDraft, predictionInput } from '@/domain/predictionDraft'
import {
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

type ErrorKey = 'game' | keyof NewGameForm | keyof PredictionForm
type FieldErrors = Partial<Record<ErrorKey, string>>

const events = useEventsStore()
const predictions = usePredictionsStore()
const reference = useReferenceStore()
const settings = useSettingsStore()
const toast = useToast()
const { t, intlLocale, message } = useLocale()

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

const hasEvent = computed(() => !!game.value || !!newGame.value)
const kept = computed(() => !!game.value && game.value.eventId === keptEventId.value)
const probability = computed(() =>
  draft.confidence == null ? null : probabilityFor(draft.confidence, settings.confidenceAnchors),
)
const parsedOdd = computed(() => parseDecimal(draft.odd))
const probabilityLabel = computed(() => {
  if (probability.value == null) return null
  return t('logging.probabilityFair', {
    probability: formatPercent(probability.value, intlLocale.value),
    fairOdd: formatDecimal(fairOdd(probability.value), intlLocale.value),
  })
})

const marketOptions = computed(() =>
  MARKETS.map((value) => ({ value, label: t(`catalogue.market.${value}`) })),
)
const betTypeOptions = computed(() =>
  BET_TYPES_BY_MARKET[draft.market].map((value) => ({
    value,
    label: t(`catalogue.betType.${value}`),
  })),
)
const periodOptions = MATCH_PERIODS.map((value) => ({ value, label: value }))
const pickOptions = computed(() =>
  PICKS[draft.betType].map((value) => ({ value, label: t(`catalogue.pick.${value}`) })),
)
const line = computed(() => lineKind(draft.betType))

// A type the new market does not offer falls back to its first; a side only fits its own type.
watch(
  () => draft.market,
  (market) => {
    if (!BET_TYPES_BY_MARKET[market].includes(draft.betType)) {
      draft.betType = BET_TYPES_BY_MARKET[market][0] as BetType
    }
  },
)
watch(
  () => draft.betType,
  () => {
    draft.pick = ''
    if (!lineKind(draft.betType)) draft.line = ''
  },
)

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
  if (!game.value && !newGame.value) found.game = 'logging.pickGame'
  const gameResult = newGame.value ? newGameFormSchema.safeParse(newGame.value) : null
  const predictionResult = predictionFormSchema.safeParse(predictionInput(draft))
  collect(found, gameResult)
  collect(found, predictionResult)
  errors.value = found
  if (Object.keys(found).length > 0 || !predictionResult.success) return

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
    if (!eventId) throw new UserError('logging.gameNotSaved')
    await predictions.create({ ...predictionResult.data, event_id: eventId })

    const usedBookmaker = predictionResult.data.bookmaker
    if (usedBookmaker && !bookmakers.value.includes(usedBookmaker)) {
      bookmakers.value.push(usedBookmaker)
    }
    toast.add({ severity: 'success', summary: t('logging.saved'), life: 2500 })
    keptEventId.value = eventId
    resetPrediction()
  } catch (e) {
    error.value = userMessage(e, 'logging.saveFailed')
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
    // Settings first: a new user's first load creates their settings row.
    await settings.ensureLoaded()
    const [, used] = await Promise.all([reference.load(), predictions.listBookmakers()])
    bookmakers.value = used
  } catch (e) {
    error.value = userMessage(e, 'logging.loadFailed')
  } finally {
    loading.value = false
  }
})
</script>

<template>
  <div class="mx-auto flex max-w-xl flex-col gap-4">
    <h1 class="m-0 text-[22px] font-bold tracking-tight">{{ t('logging.title') }}</h1>

    <form class="flex flex-col gap-[18px]" novalidate @submit.prevent="save">
      <fieldset class="m-0 flex min-w-0 flex-col gap-3 border-0 p-0" :disabled="loading">
        <legend class="sr-only">{{ t('logging.game') }}</legend>
        <GamePicker v-model:game="game" v-model:new-game="newGame" :errors="errors" :kept="kept" />
      </fieldset>

      <!-- The rest of the form appears once an event is picked or being created. -->
      <template v-if="hasEvent">
        <fieldset class="m-0 flex min-w-0 flex-col gap-3 border-0 p-0" :disabled="loading">
          <legend class="sr-only">{{ t('logging.prediction') }}</legend>
          <div class="flex flex-col gap-1.5">
            <span class="text-[13px] font-semibold text-eb-muted">{{ t('logging.market') }}</span>
            <ChipGroup
              v-model="draft.market"
              :options="marketOptions"
              :label="t('logging.market')"
            />
          </div>

          <div class="flex flex-col gap-1.5">
            <span class="text-[13px] font-semibold text-eb-muted">{{ t('logging.type') }}</span>
            <ChipGroup
              v-model="draft.betType"
              :options="betTypeOptions"
              :label="t('logging.type')"
              :invalid="!!errors.bet_type"
            />
            <small v-if="errors.bet_type" class="text-eb-neg">{{ message(errors.bet_type) }}</small>
          </div>

          <div class="flex flex-col gap-1.5">
            <span class="text-[13px] font-semibold text-eb-muted">{{ t('logging.period') }}</span>
            <SegmentedControl
              v-model="draft.period"
              :options="periodOptions"
              :label="t('logging.period')"
            />
          </div>

          <div v-if="draft.betType === 'other'" class="flex flex-col gap-1">
            <label for="selection" class="text-[13px] font-semibold text-eb-muted">{{
              t('logging.selection')
            }}</label>
            <InputText
              id="selection"
              v-model="draft.pick"
              autocomplete="off"
              :placeholder="t('logging.selectionPlaceholder')"
              class="min-h-12 w-full"
              :invalid="!!errors.selection"
            />
            <small v-if="errors.selection" class="text-eb-neg">{{
              message(errors.selection)
            }}</small>
          </div>
          <div v-else-if="pickOptions.length > 0" class="flex flex-col gap-1.5">
            <span class="text-[13px] font-semibold text-eb-muted">{{
              t('logging.selection')
            }}</span>
            <ChipGroup
              v-model="draft.pick"
              :options="pickOptions"
              :label="t('logging.selection')"
              :invalid="!!errors.selection"
            />
            <small v-if="errors.selection" class="text-eb-neg">{{
              message(errors.selection)
            }}</small>
          </div>

          <div v-if="line" class="flex flex-col gap-1">
            <label for="line" class="text-[13px] font-semibold text-eb-muted">{{
              t('logging.line')
            }}</label>
            <div class="flex gap-1">
              <InputText
                id="line"
                v-model="draft.line"
                inputmode="decimal"
                :placeholder="
                  t(
                    line === 'total'
                      ? 'logging.lineTotalPlaceholder'
                      : 'logging.lineHandicapPlaceholder',
                  )
                "
                autocomplete="off"
                class="min-h-12 w-full min-w-0"
                :invalid="!!errors.line"
              />
              <Button
                type="button"
                label="±"
                :aria-label="t('logging.toggleSign')"
                severity="secondary"
                outlined
                class="min-h-12 min-w-12 shrink-0"
                @click="draft.line = toggleSign(draft.line)"
              />
            </div>
            <small v-if="errors.line" class="text-eb-neg">{{ message(errors.line) }}</small>
            <small v-else-if="line === 'total'" class="text-eb-muted">{{
              t('logging.lineTotalHint')
            }}</small>
          </div>

          <div class="flex flex-col gap-1">
            <label for="odd" class="text-[13px] font-semibold text-eb-muted">{{
              t('logging.odd')
            }}</label>
            <InputText
              id="odd"
              v-model="draft.odd"
              inputmode="decimal"
              :placeholder="t('logging.oddPlaceholder')"
              autocomplete="off"
              class="min-h-12 w-full text-xl font-bold tabular-nums"
              :invalid="!!errors.odd"
            />
            <small v-if="errors.odd" class="text-eb-neg">{{ message(errors.odd) }}</small>
          </div>
        </fieldset>

        <fieldset class="m-0 flex min-w-0 flex-col gap-3 border-0 p-0" :disabled="loading">
          <legend
            class="mb-2 flex w-full justify-between gap-3 p-0 text-[13px] font-semibold text-eb-muted"
          >
            <span>{{ t('logging.confidence') }}</span>
            <span v-if="probabilityLabel" class="tabular-nums">{{ probabilityLabel }}</span>
          </legend>
          <div class="grid grid-cols-5 gap-2">
            <button
              v-for="level in CONFIDENCE_LEVELS"
              :key="level"
              type="button"
              class="flex min-h-16 min-w-0 flex-col items-center justify-center gap-0.5 rounded-xl border-[1.5px] px-0.5 py-1 transition-colors"
              :class="
                draft.confidence === level
                  ? 'border-eb-accent bg-eb-accent text-eb-on-accent'
                  : 'border-eb-border bg-eb-surface text-eb-text hover:bg-eb-surface-2'
              "
              :aria-pressed="draft.confidence === level"
              @click="draft.confidence = level"
            >
              <span class="text-xl leading-none font-bold">{{ level }}</span>
              <span class="text-center text-[11px] leading-tight font-semibold">
                {{ t(`confidence.${level}`) }}
              </span>
            </button>
          </div>
          <small v-if="errors.confidence" class="text-eb-neg">{{
            message(errors.confidence)
          }}</small>
          <ValueIndex :odd="parsedOdd" :probability="probability" />
        </fieldset>

        <PunterFields
          v-model:is-punter="draft.isPunter"
          v-model:stake="draft.stake"
          v-model:bookmaker="draft.bookmaker"
          :bookmakers="bookmakers"
          :stake-error="errors.stake_units"
          :unit-value="settings.unitValue"
          :money-display="settings.moneyDisplay"
        />

        <div class="flex flex-col gap-1">
          <button
            v-if="!showNotes"
            type="button"
            class="flex min-h-11 items-center gap-1.5 self-start text-[15px] font-semibold text-eb-accent-text"
            @click="showNotes = true"
          >
            <AppIcon name="plus" class="size-4" stroke-width="2.5" />
            {{ t('logging.addNotes') }}
          </button>
          <template v-else>
            <label for="notes" class="text-[13px] font-semibold text-eb-muted">{{
              t('logging.notes')
            }}</label>
            <Textarea id="notes" v-model="draft.notes" rows="3" auto-resize class="w-full" />
          </template>
        </div>

        <Message v-if="error" severity="error">{{ message(error) }}</Message>
        <Button
          type="submit"
          :label="t('logging.submit')"
          :loading="saving"
          :disabled="loading"
          class="min-h-[52px] !rounded-[14px] !text-base !font-bold"
        />
      </template>
    </form>
  </div>
</template>
