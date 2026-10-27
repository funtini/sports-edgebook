<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import AutoComplete, { type AutoCompleteCompleteEvent } from 'primevue/autocomplete'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Message from 'primevue/message'
import Textarea from 'primevue/textarea'
import { useToast } from 'primevue/usetoast'
import PunterFields from '@/components/PunterFields.vue'
import ValueIndex from '@/components/ValueIndex.vue'
import { CONFIDENCE_LABELS, CONFIDENCE_LEVELS, type ConfidenceLevel } from '@/domain/confidence'
import { parseDecimal } from '@/domain/decimal'
import { LocalEventSource, toSearchResult, type EventSearchResult } from '@/domain/eventSource'
import { predictionCreateSchema } from '@/domain/schemas'
import { useEventsStore } from '@/stores/events'
import { usePredictionsStore } from '@/stores/predictions'
import { useReferenceStore } from '@/stores/reference'
import { useSettingsStore } from '@/stores/settings'

/** Stands in for the game or market ids while validating; the real ones exist only after save. */
const PENDING_ID = '00000000-0000-4000-8000-000000000000'

const SUGGESTION_LIMIT = 10

const events = useEventsStore()
const predictions = usePredictionsStore()
const reference = useReferenceStore()
const settings = useSettingsStore()
const toast = useToast()
const eventSource = new LocalEventSource(events)

const loading = ref(true)
const saving = ref(false)
const error = ref<string | null>(null)
const errors = ref<Record<string, string>>({})
const bookmakers = ref<string[]>([])

// Game
const game = ref<EventSearchResult | null>(null)
const gameQuery = ref<string | EventSearchResult>('')
const gameResults = ref<EventSearchResult[]>([])
const newGame = ref(false)
const newDate = ref(today())
const newTime = ref('')
const newLeague = ref('')
const newHome = ref('')
const newAway = ref('')

// Prediction
const category = ref('')
const marketName = ref('')
const selection = ref('')
const line = ref('')
const odd = ref('')
const confidence = ref<ConfidenceLevel | null>(null)
const isPunter = ref(false)
const stake = ref('')
const bookmaker = ref('')
const notes = ref('')
const showNotes = ref(false)

const suggestions = ref<string[]>([])

const probability = computed(() =>
  confidence.value == null ? null : settings.confidenceAnchors[confidence.value],
)
const parsedOdd = computed(() => parseDecimal(odd.value))

const kickoffFormat = new Intl.DateTimeFormat('pt-PT', {
  weekday: 'short',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
})

function gameLabel(result: EventSearchResult): string {
  return `${result.homeTeam} – ${result.awayTeam}`
}

function gameDetails(result: EventSearchResult): string {
  const kickoff = kickoffFormat.format(new Date(result.kickoffAt))
  return result.leagueName ? `${kickoff} · ${result.leagueName}` : kickoff
}

function today(): string {
  const now = new Date()
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** Distinct names containing `query` (any case), in their original order. */
function matching(names: string[], query: string): string[] {
  const q = query.trim().toLowerCase()
  const seen = new Set<string>()
  const result: string[] = []
  for (const name of names) {
    const key = name.toLowerCase()
    if (seen.has(key) || !key.includes(q)) continue
    seen.add(key)
    result.push(name)
    if (result.length === SUGGESTION_LIMIT) break
  }
  return result
}

const completeLeague = (e: AutoCompleteCompleteEvent) =>
  (suggestions.value = matching(
    reference.leagues.map((l) => l.name),
    e.query,
  ))
const completeTeam = (e: AutoCompleteCompleteEvent) =>
  (suggestions.value = matching(
    reference.teams.map((t) => t.name),
    e.query,
  ))
const completeCategory = (e: AutoCompleteCompleteEvent) =>
  (suggestions.value = matching(
    reference.markets.map((m) => m.category),
    e.query,
  ))
const completeMarketName = (e: AutoCompleteCompleteEvent) => {
  const cat = category.value.trim().toLowerCase()
  const markets = cat
    ? reference.markets.filter((m) => m.category.toLowerCase() === cat)
    : reference.markets
  suggestions.value = matching(
    markets.map((m) => m.name),
    e.query,
  )
}

async function searchGames(e: AutoCompleteCompleteEvent) {
  try {
    gameResults.value = await eventSource.search(e.query)
  } catch (err) {
    gameResults.value = []
    error.value = message(err, 'Não foi possível procurar jogos.')
  }
}

function pickGame(result: EventSearchResult) {
  game.value = result
  gameQuery.value = ''
  delete errors.value.game
}

function startNewGame() {
  if (typeof gameQuery.value === 'string' && !newHome.value) newHome.value = gameQuery.value.trim()
  newGame.value = true
  delete errors.value.game
}

/** "Outro jogo": clears the game so the next prediction starts from search. */
function otherGame() {
  game.value = null
  clearNewGame()
}

function clearNewGame() {
  newGame.value = false
  newTime.value = ''
  newLeague.value = ''
  newHome.value = ''
  newAway.value = ''
}

/** Clears everything about the prediction but keeps the game. */
function resetPrediction() {
  category.value = ''
  marketName.value = ''
  selection.value = ''
  line.value = ''
  odd.value = ''
  confidence.value = null
  isPunter.value = false
  stake.value = ''
  bookmaker.value = ''
  notes.value = ''
  showNotes.value = false
  errors.value = {}
}

function message(e: unknown, fallback: string): string {
  if (e && typeof e === 'object' && 'issues' in e && Array.isArray(e.issues)) {
    return e.issues[0]?.message ?? fallback
  }
  if (e && typeof e === 'object' && 'message' in e && typeof e.message === 'string') {
    return e.message
  }
  return fallback
}

function validateGame(found: Record<string, string>): string | null {
  if (!newGame.value) {
    if (!game.value) found.game = 'Escolhe o jogo ou cria um novo'
    return null
  }
  const kickoff = new Date(`${newDate.value}T${newTime.value}`)
  if (!newDate.value || !newTime.value || Number.isNaN(kickoff.getTime())) {
    found.kickoff = 'Indica a data e a hora do jogo'
  }
  if (!newHome.value.trim()) found.home = 'Indica a equipa da casa'
  if (!newAway.value.trim()) found.away = 'Indica a equipa de fora'
  else if (newHome.value.trim().toLowerCase() === newAway.value.trim().toLowerCase()) {
    found.away = 'A equipa da casa e a de fora têm de ser diferentes'
  }
  return found.kickoff ? null : kickoff.toISOString()
}

async function save() {
  error.value = null
  const found: Record<string, string> = {}
  const kickoffAt = validateGame(found)
  if (!category.value.trim()) found.category = 'Indica a categoria do mercado'
  if (!marketName.value.trim()) found.marketName = 'Indica o mercado'

  const parsed = predictionCreateSchema.safeParse({
    event_id: PENDING_ID,
    market_id: PENDING_ID,
    selection: selection.value,
    line: parseDecimal(line.value),
    odd: parsedOdd.value ?? undefined,
    confidence: confidence.value ?? undefined,
    is_punter: isPunter.value,
    stake_units: isPunter.value ? parseDecimal(stake.value) : null,
    bookmaker: isPunter.value ? bookmaker.value.trim() || null : null,
    notes: notes.value.trim() || null,
  })
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      const field = String(issue.path[0])
      found[field] ??= issue.message
    }
  }
  errors.value = found
  if (!parsed.success || Object.keys(found).length > 0) return

  saving.value = true
  try {
    if (newGame.value) {
      const league = newLeague.value.trim() ? await reference.ensureLeague(newLeague.value) : null
      const leagueId = league?.id ?? null
      const home = await reference.ensureTeam(newHome.value, leagueId)
      const away = await reference.ensureTeam(newAway.value, leagueId)
      const event = await events.create({
        kickoff_at: kickoffAt!,
        league_id: leagueId,
        home_team_id: home.id,
        away_team_id: away.id,
      })
      // From here on the game exists: a failure below must not create it twice.
      game.value = toSearchResult(event)
      clearNewGame()
    }
    const eventId = game.value?.eventId
    if (!eventId) throw new Error('Este jogo ainda não está guardado.')
    const market = await reference.ensureMarket(category.value, marketName.value)
    await predictions.create({ ...parsed.data, event_id: eventId, market_id: market.id })

    const usedBookmaker = parsed.data.bookmaker
    if (usedBookmaker && !bookmakers.value.includes(usedBookmaker)) {
      bookmakers.value.push(usedBookmaker)
    }
    toast.add({ severity: 'success', summary: 'Prognóstico guardado', life: 2500 })
    resetPrediction()
  } catch (e) {
    error.value = message(e, 'Não foi possível guardar o prognóstico.')
  } finally {
    saving.value = false
  }
}

onMounted(async () => {
  try {
    // Settings first: a new user's first load seeds the default markets.
    await settings.ensureLoaded()
    const [, used] = await Promise.all([reference.load(), predictions.listBookmakers()])
    bookmakers.value = used
  } catch (e) {
    error.value = message(e, 'Não foi possível carregar os dados.')
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
      <!-- Game -->
      <fieldset class="m-0 flex min-w-0 flex-col gap-3 border-0 p-0" :disabled="loading">
        <legend class="mb-1 p-0 text-lg font-semibold">Jogo</legend>

        <div
          v-if="game"
          class="flex items-center justify-between gap-3 rounded-lg border border-primary-200 bg-primary-50 px-4 py-3"
        >
          <div class="flex min-w-0 flex-col">
            <span class="truncate font-medium">{{ gameLabel(game) }}</span>
            <span class="text-sm text-surface-600">{{ gameDetails(game) }}</span>
          </div>
          <Button
            type="button"
            label="Outro jogo"
            severity="secondary"
            outlined
            class="min-h-11 shrink-0"
            @click="otherGame"
          />
        </div>

        <template v-else-if="!newGame">
          <label for="game" class="sr-only">Procurar jogo</label>
          <AutoComplete
            v-model="gameQuery"
            input-id="game"
            :suggestions="gameResults"
            :option-label="gameLabel"
            placeholder="Procurar equipa (ex.: Benfica)"
            input-class="min-h-11 w-full"
            :invalid="!!errors.game"
            fluid
            @complete="searchGames"
            @option-select="pickGame($event.value)"
          >
            <template #option="{ option }">
              <div class="flex flex-col">
                <span class="font-medium">{{ gameLabel(option) }}</span>
                <span class="text-sm text-surface-500">{{ gameDetails(option) }}</span>
              </div>
            </template>
            <template #empty>
              <span class="text-sm text-surface-500">Nenhum jogo encontrado.</span>
            </template>
          </AutoComplete>
          <small v-if="errors.game" class="text-red-600">{{ errors.game }}</small>
          <Button
            type="button"
            label="Novo jogo"
            text
            class="min-h-11 self-start"
            @click="startNewGame"
          />
        </template>

        <div v-else class="flex flex-col gap-3">
          <div class="grid grid-cols-2 gap-3">
            <div class="flex min-w-0 flex-col gap-1">
              <label for="new-date" class="text-sm font-medium">Data</label>
              <InputText
                id="new-date"
                v-model="newDate"
                type="date"
                class="min-h-11 w-full"
                :invalid="!!errors.kickoff"
              />
            </div>
            <div class="flex min-w-0 flex-col gap-1">
              <label for="new-time" class="text-sm font-medium">Hora</label>
              <InputText
                id="new-time"
                v-model="newTime"
                type="time"
                class="min-h-11 w-full"
                :invalid="!!errors.kickoff"
              />
            </div>
            <small v-if="errors.kickoff" class="col-span-2 text-red-600">
              {{ errors.kickoff }}
            </small>
          </div>
          <div class="flex flex-col gap-1">
            <label for="new-league" class="text-sm font-medium">Liga (opcional)</label>
            <AutoComplete
              v-model="newLeague"
              input-id="new-league"
              :suggestions="suggestions"
              input-class="min-h-11 w-full"
              fluid
              @complete="completeLeague"
            />
          </div>
          <div class="flex flex-col gap-1">
            <label for="new-home" class="text-sm font-medium">Equipa da casa</label>
            <AutoComplete
              v-model="newHome"
              input-id="new-home"
              :suggestions="suggestions"
              input-class="min-h-11 w-full"
              :invalid="!!errors.home"
              fluid
              @complete="completeTeam"
            />
            <small v-if="errors.home" class="text-red-600">{{ errors.home }}</small>
          </div>
          <div class="flex flex-col gap-1">
            <label for="new-away" class="text-sm font-medium">Equipa de fora</label>
            <AutoComplete
              v-model="newAway"
              input-id="new-away"
              :suggestions="suggestions"
              input-class="min-h-11 w-full"
              :invalid="!!errors.away"
              fluid
              @complete="completeTeam"
            />
            <small v-if="errors.away" class="text-red-600">{{ errors.away }}</small>
          </div>
          <Button
            type="button"
            label="Procurar jogo existente"
            text
            class="min-h-11 self-start"
            @click="otherGame"
          />
        </div>
      </fieldset>

      <!-- Market and selection -->
      <fieldset class="m-0 flex min-w-0 flex-col gap-3 border-0 p-0" :disabled="loading">
        <legend class="mb-1 p-0 text-lg font-semibold">Aposta</legend>
        <div class="grid grid-cols-2 gap-3">
          <div class="flex min-w-0 flex-col gap-1">
            <label for="category" class="text-sm font-medium">Mercado</label>
            <AutoComplete
              v-model="category"
              input-id="category"
              :suggestions="suggestions"
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
              v-model="marketName"
              input-id="market-name"
              :suggestions="suggestions"
              input-class="min-h-11 w-full"
              :invalid="!!errors.marketName"
              dropdown
              fluid
              @complete="completeMarketName"
            />
            <small v-if="errors.marketName" class="text-red-600">{{ errors.marketName }}</small>
          </div>
        </div>

        <div class="grid grid-cols-[minmax(0,1fr)_6rem] gap-3">
          <div class="flex min-w-0 flex-col gap-1">
            <label for="selection" class="text-sm font-medium">Aposta</label>
            <InputText
              id="selection"
              v-model="selection"
              autocomplete="off"
              class="min-h-11 w-full"
              :invalid="!!errors.selection"
            />
          </div>
          <div class="flex min-w-0 flex-col gap-1">
            <label for="line" class="text-sm font-medium">Linha</label>
            <InputText
              id="line"
              v-model="line"
              inputmode="decimal"
              placeholder="2,5"
              autocomplete="off"
              class="min-h-11 w-full"
              :invalid="!!errors.line"
            />
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
            v-model="odd"
            inputmode="decimal"
            placeholder="1,85"
            autocomplete="off"
            class="min-h-11 w-full text-lg"
            :invalid="!!errors.odd"
          />
          <small v-if="errors.odd" class="text-red-600">{{ errors.odd }}</small>
        </div>
      </fieldset>

      <!-- Confidence and value -->
      <fieldset class="m-0 flex min-w-0 flex-col gap-3 border-0 p-0" :disabled="loading">
        <legend class="mb-1 p-0 text-lg font-semibold">Confiança</legend>
        <div class="grid grid-cols-5 gap-2">
          <button
            v-for="level in CONFIDENCE_LEVELS"
            :key="level"
            type="button"
            class="flex min-h-16 min-w-0 flex-col items-center justify-center gap-0.5 rounded-lg border px-1 py-2 transition-colors"
            :class="
              confidence === level
                ? 'border-primary bg-primary text-primary-contrast'
                : 'border-surface-300 bg-surface-0 text-surface-700 hover:bg-surface-100'
            "
            :aria-pressed="confidence === level"
            @click="confidence = level"
          >
            <span class="text-xl font-semibold">{{ level }}</span>
            <span class="text-center text-xs leading-tight">{{ CONFIDENCE_LABELS[level] }}</span>
          </button>
        </div>
        <small v-if="errors.confidence" class="text-red-600">{{ errors.confidence }}</small>
        <ValueIndex :odd="parsedOdd" :probability="probability" />
      </fieldset>

      <PunterFields
        v-model:is-punter="isPunter"
        v-model:stake="stake"
        v-model:bookmaker="bookmaker"
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
          <Textarea id="notes" v-model="notes" rows="3" auto-resize class="w-full" />
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
