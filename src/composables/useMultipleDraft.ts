import { computed, reactive, ref } from 'vue'
import { defineStore } from 'pinia'
import type { ConfidenceLevel } from '@/domain/confidence'
import { addDays, startOfDay, toDayKey } from '@/domain/days'
import {
  DEFAULT_TOLERANCE,
  generateMultiple,
  MAX_ADDED_LEGS,
  MAX_LEGS,
  MIN_ADDED_LEGS,
  MIN_LEGS,
  swapLeg,
  windowRange,
  type Candidate,
  type DateWindow,
  type DayRange,
  type GeneratorMode,
  type GeneratorParams,
} from '@/domain/generator'
import type { Market } from '@/domain/markets'
import { slipTotals, toCandidate, type LegOrigin } from '@/domain/multipleDraft'
import type { PredictionWithRelations } from '@/types/db'

export interface DraftLeg {
  prediction: PredictionWithRelations
  origin: LegOrigin
  pinned: boolean
  /** Prediction ids Trocar has shown in this slot, the first leg included; unset before a swap. */
  swapSeen?: string[]
}

export type WindowChoice = 'today' | 'tomorrow' | 'next3' | 'custom'

/** What the Gerador panel holds; kept with the slip. */
export interface GeneratorSettings {
  window: WindowChoice
  /** `YYYY-MM-DD` days of Personalizado. */
  custom: DayRange
  mode: GeneratorMode
  /** Prognósticos a gerar (not used by Odd alvo). */
  count: number
  targetOdd: number
  tolerance: number
  minConfidence: ConfidenceLevel | null
  minOdd: number | null
  maxOdd: number | null
  leagueIds: string[]
  markets: Market[]
  nonPunterOnly: boolean
}

/** The last generation, saved with the multiple when any leg is generated. */
export interface Generation {
  mode: GeneratorMode
  /** `GeneratorParams` without the legs (the multiple has them) plus the window, as JSON. */
  params: Record<string, unknown>
}

export const TOLERANCES = [0.05, 0.1, 0.2] as const

function defaultSettings(now = new Date()): GeneratorSettings {
  const today = toDayKey(startOfDay(now))
  return {
    window: 'today',
    custom: { from: today, to: toDayKey(addDays(startOfDay(now), 2)) },
    mode: 'value',
    count: 3,
    targetOdd: 5,
    tolerance: DEFAULT_TOLERANCE,
    minConfidence: null,
    minOdd: null,
    maxOdd: null,
    leagueIds: [],
    markets: [],
    nonPunterOnly: false,
  }
}

/** A random 32-bit seed, saved with the params so a random multiple can be reproduced. */
const newSeed = () => Math.floor(Math.random() * 2 ** 32)

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/**
 * The multiple being built on Múltiplas (docs/specs/ui.md): ordered legs, each with its origin
 * and pin, and the Gerador's settings. A Pinia store so it survives leaving the screen for the
 * rest of the session. Generating and swapping take the window's pending predictions.
 */
export const useMultipleDraft = defineStore('multipleDraft', () => {
  const legs = ref<DraftLeg[]>([])
  /** Prediction ids the generator just added; highlighted until the next change. */
  const fresh = ref(new Set<string>())
  const settings = reactive(defaultSettings())
  const lastGeneration = ref<Generation | null>(null)
  /** Valor apostado for Apostar, in units. */
  const stakeUnits = ref(1)

  const candidates = computed(() => legs.value.map((leg) => toCandidate(leg.prediction)))
  const totals = computed(() => slipTotals(legs.value.map((leg) => leg.prediction)))
  const unpinned = computed(() => legs.value.filter((leg) => !leg.pinned))
  const usedEvents = computed(() => new Set(legs.value.map((leg) => leg.prediction.event_id)))
  const hasGenerated = computed(() => legs.value.some((leg) => leg.origin === 'generated'))

  /** Smallest Prognósticos a gerar: the generator needs 2 legs to start a multiple, 1 to add. */
  const minCount = computed(() => (legs.value.length ? MIN_ADDED_LEGS : MIN_LEGS))

  /** Local days of the chosen window; throws `RangeError` for an invalid Personalizado. */
  function range(now = new Date()): DayRange {
    const window: DateWindow = settings.window === 'custom' ? settings.custom : settings.window
    return windowRange(window, now)
  }

  function changed() {
    fresh.value = new Set()
  }

  function has(predictionId: string) {
    return legs.value.some((leg) => leg.prediction.id === predictionId)
  }

  /** Adds a prediction by hand: pinned, at the end. Ignored if it or its game is already in. */
  function add(prediction: PredictionWithRelations) {
    if (has(prediction.id) || usedEvents.value.has(prediction.event_id)) return
    changed()
    legs.value = [...legs.value, { prediction, origin: 'manual', pinned: true }]
  }

  function remove(predictionId: string) {
    changed()
    legs.value = legs.value.filter((leg) => leg.prediction.id !== predictionId)
  }

  function togglePin(predictionId: string) {
    changed()
    legs.value = legs.value.map((leg) =>
      leg.prediction.id === predictionId ? { ...leg, pinned: !leg.pinned } : leg,
    )
  }

  function clear() {
    changed()
    legs.value = []
    lastGeneration.value = null
  }

  /**
   * Reutilizar: replaces the slip with these legs, all pinned, each keeping its origin; the
   * saved multiple's generation (if any) comes with them so saving keeps its mode.
   */
  function reuse(
    reused: readonly { prediction: PredictionWithRelations; origin: LegOrigin }[],
    generation: Generation | null,
  ) {
    changed()
    legs.value = reused.map(({ prediction, origin }) => ({ prediction, origin, pinned: true }))
    lastGeneration.value = legs.value.some((leg) => leg.origin === 'generated') ? generation : null
  }

  /** Filters and mode from the settings; `legs`, `fixed` and `avoid` are added per action. */
  function baseParams(): GeneratorParams {
    return {
      mode: settings.mode,
      ...(settings.mode === 'target_odd' && {
        targetOdd: settings.targetOdd,
        tolerance: settings.tolerance,
      }),
      ...((settings.mode === 'random' || settings.mode === 'target_odd') && { seed: newSeed() }),
      ...(settings.minConfidence != null && { minConfidence: settings.minConfidence }),
      ...(settings.minOdd != null && { minOdd: settings.minOdd }),
      ...(settings.maxOdd != null && { maxOdd: settings.maxOdd }),
      ...(settings.leagueIds.length && { leagueIds: [...settings.leagueIds] }),
      ...(settings.markets.length && { markets: [...settings.markets] }),
      pool: settings.nonPunterOnly ? 'non_punter' : 'all',
    }
  }

  function remember(params: GeneratorParams) {
    const { fixed: _fixed, avoid: _avoid, ...rest } = params
    let window: DayRange | null = null
    try {
      window = range()
    } catch {
      // An invalid Personalizado never gets this far; the window is informative only.
    }
    lastGeneration.value = {
      mode: params.mode,
      params: JSON.parse(JSON.stringify({ ...rest, window })),
    }
  }

  /** `fixed` legs kept as they are, then the generated ones: unpinned and highlighted. */
  function apply(kept: DraftLeg[], result: Candidate[], pool: PredictionWithRelations[]) {
    const byId = new Map(pool.map((p) => [p.id, p]))
    const added = result
      .slice(kept.length)
      .map((c) => byId.get(c.id))
      .filter((p): p is PredictionWithRelations => !!p)
    legs.value = [
      ...kept,
      ...added.map((prediction) => ({ prediction, origin: 'generated' as const, pinned: false })),
    ]
    fresh.value = new Set(added.map((p) => p.id))
  }

  /**
   * Appends generated legs to the slip (every current leg is `fixed`). False when too few
   * predictions pass the filters.
   */
  function generate(pool: PredictionWithRelations[]): boolean {
    const fixed = candidates.value
    const params: GeneratorParams = {
      ...baseParams(),
      fixed,
      ...(settings.mode !== 'target_odd' && {
        legs: clamp(settings.count, minCount.value, fixed.length ? MAX_ADDED_LEGS : MAX_LEGS),
      }),
    }
    const result = generateMultiple(pool.map(toCandidate), params)
    if (!result) return false
    apply(legs.value, result.legs, pool)
    remember(params)
    return true
  }

  /**
   * Gerar outra: replaces the unpinned legs with the current mode and filters, trying not to pick
   * them again (pinned legs are `fixed`, the replaced ones `avoid`). False when nothing fits.
   */
  function regenerate(pool: PredictionWithRelations[]): boolean {
    const kept = legs.value.filter((leg) => leg.pinned)
    const replaced = unpinned.value
    if (!replaced.length) return false
    const fixed = kept.map((leg) => toCandidate(leg.prediction))
    const params: GeneratorParams = {
      ...baseParams(),
      fixed,
      avoid: replaced.map((leg) => leg.prediction.id),
      ...(settings.mode !== 'target_odd' && {
        legs: fixed.length
          ? clamp(replaced.length, MIN_ADDED_LEGS, MAX_ADDED_LEGS)
          : clamp(replaced.length, MIN_LEGS, MAX_LEGS),
      }),
    }
    const result = generateMultiple(pool.map(toCandidate), params)
    if (!result) return false
    apply(kept, result.legs, pool)
    remember(params)
    return true
  }

  /**
   * Trocar: the leg is replaced in place by the generator's next pick from another game, under
   * the current mode and filters, never one this slot has already shown until every prediction
   * of the window has been; the new leg is generated and unpinned. False when none is left.
   */
  function swap(predictionId: string, pool: PredictionWithRelations[]): boolean {
    const index = legs.value.findIndex((leg) => leg.prediction.id === predictionId)
    const leg = legs.value[index]
    if (!leg) return false
    const current = { ...slipTotals(legs.value.map((l) => l.prediction)), withinTolerance: true }
    // `swapLeg` reads `legs` only to validate it; 2 is valid in every mode.
    const params: GeneratorParams = { ...baseParams(), legs: MIN_LEGS }
    const seen = leg.swapSeen ?? [predictionId]
    const result = swapLeg(
      { ...current, legs: candidates.value },
      predictionId,
      pool.map(toCandidate),
      params,
      seen,
    )
    const prediction = result && pool.find((p) => p.id === result.replacement.id)
    if (!result || !prediction) return false
    changed()
    const swapSeen = result.restarted ? [predictionId, prediction.id] : [...seen, prediction.id]
    legs.value = legs.value.map((l, i) =>
      i === index ? { prediction, origin: 'generated', pinned: false, swapSeen } : l,
    )
    remember({ ...params, legs: undefined })
    return true
  }

  return {
    legs,
    fresh,
    settings,
    lastGeneration,
    stakeUnits,
    totals,
    unpinned,
    usedEvents,
    hasGenerated,
    minCount,
    range,
    has,
    add,
    remove,
    togglePin,
    clear,
    reuse,
    generate,
    regenerate,
    swap,
  }
})
