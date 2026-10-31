import type { ConfidenceLevel } from './confidence'
import { addDays, fromDayKey, startOfDay, toDayKey } from './days'
import type { Market } from './markets'
import { multipleOdd } from './settlement'
import { valueIndex } from './value'

/** A pending prediction the generator can pick as a leg. */
export interface Candidate {
  /** Prediction id. */
  id: string
  event_id: string
  kickoff_at: string
  league_id: string | null
  market: Market
  odd: number
  /** Stored on the prediction at logging time. */
  probability: number
  confidence: ConfidenceLevel
  is_punter: boolean
}

export const GENERATOR_MODES = [
  'confidence',
  'value',
  'highest_odds',
  'lowest_odds',
  'random',
  'target_odd',
] as const
export type GeneratorMode = (typeof GENERATOR_MODES)[number]

export interface GeneratorParams {
  mode: GeneratorMode
  /**
   * Legs to add: 2–10 without `fixed`, 1–6 with it. Required unless mode is `target_odd`, where it
   * fixes the number of legs to add when given.
   */
  legs?: number
  /** Legs already in the multiple: kept first, in order; their events are not picked again. */
  fixed?: Candidate[]
  /** Candidate ids to try not to pick; used only when too few others are left. */
  avoid?: string[]
  /** Required for `target_odd`. */
  targetOdd?: number
  /** Relative, ±; default 0.10. */
  tolerance?: number
  minConfidence?: ConfidenceLevel
  minOdd?: number
  maxOdd?: number
  leagueIds?: string[]
  markets?: Market[]
  /** Default `all`. */
  pool?: 'all' | 'non_punter'
  /** `random` only: same seed, same result. */
  seed?: number
}

export interface GeneratedMultiple {
  legs: Candidate[]
  /** Product of leg odds. */
  totalOdd: number
  /** Product of leg probabilities, assuming independence. */
  probability: number
  /** probability × totalOdd − 1. */
  ev: number
  /** `target_odd` only; true otherwise. */
  withinTolerance: boolean
}

export const MIN_LEGS = 2
export const MAX_LEGS = 10
export const MIN_ADDED_LEGS = 1
export const MAX_ADDED_LEGS = 6
export const DEFAULT_TOLERANCE = 0.1
export const BEAM_WIDTH = 50

/** Picks a multiple from the candidates; null when too few events survive the filters. */
export function generateMultiple(
  candidates: Candidate[],
  params: GeneratorParams,
): GeneratedMultiple | null {
  validate(params)
  const fixed = params.fixed ?? []
  const fixedEvents = new Set(fixed.map((leg) => leg.event_id))
  const pool = applyFilters(candidates, params).filter((c) => !fixedEvents.has(c.event_id))
  const needed = params.legs ?? (fixed.length ? MIN_ADDED_LEGS : MIN_LEGS)
  if (countEvents(pool) < needed) return null

  const avoid = new Set(params.avoid ?? [])
  const preferred = pool.filter((c) => !avoid.has(c.id))

  if (params.mode === 'target_odd') {
    return searchTargetOdd(countEvents(preferred) >= needed ? preferred : pool, params)
  }

  const ordered =
    params.mode === 'random'
      ? shuffle(sortByKickoff(pool), rngFor(params.seed))
      : rank(pool, params.mode)
  // Avoided candidates go last, keeping their order, so they only fill what the others cannot.
  const legs: Candidate[] = []
  const seen = new Set<string>()
  for (const candidate of [
    ...ordered.filter((c) => !avoid.has(c.id)),
    ...ordered.filter((c) => avoid.has(c.id)),
  ]) {
    if (seen.has(candidate.event_id)) continue
    seen.add(candidate.event_id)
    legs.push(candidate)
    if (legs.length === needed) break
  }
  return build([...fixed, ...legs], params)
}

export type DateWindow = 'today' | 'tomorrow' | 'next3' | { from: string; to: string }

/** Inclusive range of local `YYYY-MM-DD` days. */
export interface DayRange {
  from: string
  to: string
}

/** Last day a custom window can reach: today + 13, so at most 14 days. */
export const MAX_WINDOW_DAYS = 14

/**
 * Local-date range of a generator window. A custom range is clamped to today … today + 13; an
 * invalid day, `from` after `to`, or a range wholly outside that span throws `RangeError`.
 */
export function windowRange(window: DateWindow, now: Date): DayRange {
  const today = startOfDay(now)
  if (window === 'today') return { from: toDayKey(today), to: toDayKey(today) }
  if (window === 'tomorrow') {
    const tomorrow = addDays(today, 1)
    return { from: toDayKey(tomorrow), to: toDayKey(tomorrow) }
  }
  if (window === 'next3') return { from: toDayKey(today), to: toDayKey(addDays(today, 2)) }

  const from = fromDayKey(window.from)
  const to = fromDayKey(window.to)
  if (!from || !to) throw new RangeError('from and to must be valid YYYY-MM-DD days')
  if (from > to) throw new RangeError('from must not be after to')
  const last = addDays(today, MAX_WINDOW_DAYS - 1)
  const clampedFrom = from < today ? today : from
  const clampedTo = to > last ? last : to
  if (clampedFrom > clampedTo) throw new RangeError('the range must overlap today … today + 13')
  return { from: toDayKey(clampedFrom), to: toDayKey(clampedTo) }
}

/**
 * Replaces one leg with the best remaining candidate under the same mode and filters, from an
 * event not already in the multiple (the replaced leg's event included). Null when none is left
 * or `legId` is not a leg of `current`.
 */
export function swapLeg(
  current: GeneratedMultiple,
  legId: string,
  candidates: Candidate[],
  params: GeneratorParams,
): GeneratedMultiple | null {
  validate(params)
  const index = current.legs.findIndex((leg) => leg.id === legId)
  if (index === -1) return null
  const usedEvents = new Set(current.legs.map((leg) => leg.event_id))
  const options = applyFilters(candidates, params).filter((c) => !usedEvents.has(c.event_id))
  if (options.length === 0) return null

  const withLeg = (replacement: Candidate) =>
    current.legs.map((leg, i) => (i === index ? replacement : leg))

  if (params.mode === 'target_odd') {
    const target = params.targetOdd as number
    const tolerance = params.tolerance ?? DEFAULT_TOLERANCE
    const results = sortByKickoff(options).map((c) => build(withLeg(c), params, target, tolerance))
    return pickTargetResult(results, target)
  }

  const replacement =
    params.mode === 'random'
      ? sortByKickoff(options)[Math.floor(rngFor(params.seed)() * options.length)]
      : rank(options, params.mode)[0]
  return build(withLeg(replacement as Candidate), params)
}

function countEvents(candidates: Candidate[]): number {
  return new Set(candidates.map((c) => c.event_id)).size
}

function validate(params: GeneratorParams): void {
  const { mode, legs, targetOdd, tolerance } = params
  const [min, max] = params.fixed?.length ? [MIN_ADDED_LEGS, MAX_ADDED_LEGS] : [MIN_LEGS, MAX_LEGS]
  if (legs !== undefined && (!Number.isInteger(legs) || legs < min || legs > max)) {
    throw new RangeError(`legs must be a whole number from ${min} to ${max}`)
  }
  if (mode === 'target_odd') {
    if (targetOdd === undefined || !(targetOdd > 1)) {
      throw new RangeError('targetOdd must be above 1')
    }
  } else if (legs === undefined) {
    throw new RangeError(`legs is required for mode ${mode}`)
  }
  if (tolerance !== undefined && !(tolerance >= 0)) {
    throw new RangeError('tolerance must be 0 or more')
  }
}

function applyFilters(candidates: Candidate[], params: GeneratorParams): Candidate[] {
  const { minConfidence, minOdd, maxOdd, leagueIds, markets, pool = 'all' } = params
  return candidates.filter(
    (c) =>
      (minConfidence === undefined || c.confidence >= minConfidence) &&
      (minOdd === undefined || c.odd >= minOdd) &&
      (maxOdd === undefined || c.odd <= maxOdd) &&
      (leagueIds === undefined || (c.league_id !== null && leagueIds.includes(c.league_id))) &&
      (markets === undefined || markets.includes(c.market)) &&
      (pool === 'all' || !c.is_punter),
  )
}

function byKickoff(a: Candidate, b: Candidate): number {
  return (
    Date.parse(a.kickoff_at) - Date.parse(b.kickoff_at) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  )
}

function sortByKickoff(candidates: Candidate[]): Candidate[] {
  return [...candidates].sort(byKickoff)
}

type RankedMode = Exclude<GeneratorMode, 'random' | 'target_odd'>

const ORDERINGS: Record<RankedMode, (a: Candidate, b: Candidate) => number> = {
  confidence: (a, b) => b.confidence - a.confidence || b.odd - a.odd,
  value: (a, b) => valueIndex(b.probability, b.odd) - valueIndex(a.probability, a.odd),
  highest_odds: (a, b) => b.odd - a.odd,
  lowest_odds: (a, b) => a.odd - b.odd,
}

function rank(candidates: Candidate[], mode: GeneratorMode): Candidate[] {
  const order = ORDERINGS[mode as RankedMode]
  return [...candidates].sort((a, b) => order(a, b) || byKickoff(a, b))
}

/** mulberry32: small, fast, good enough to shuffle a list of picks. */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function rngFor(seed: number | undefined): () => number {
  return seed === undefined ? Math.random : mulberry32(seed)
}

function shuffle<T>(items: T[], random: () => number): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[result[i], result[j]] = [result[j] as T, result[i] as T]
  }
  return result
}

function build(
  legs: Candidate[],
  params: GeneratorParams,
  target?: number,
  tolerance = DEFAULT_TOLERANCE,
): GeneratedMultiple {
  const totalOdd = multipleOdd(legs.map((leg) => ({ odd: leg.odd, status: 'pending' as const })))
  const probability = legs.reduce((total, leg) => total * leg.probability, 1)
  return {
    legs,
    totalOdd,
    probability,
    ev: valueIndex(probability, totalOdd) - 1,
    withinTolerance:
      params.mode !== 'target_odd' || Math.abs(totalOdd / (target as number) - 1) <= tolerance,
  }
}

function distance(totalOdd: number, target: number): number {
  return Math.abs(Math.log(totalOdd) - Math.log(target))
}

/** Within tolerance: highest EV (then closest). Otherwise: closest (then highest EV). First wins ties. */
function pickTargetResult(results: GeneratedMultiple[], target: number): GeneratedMultiple | null {
  const within = results.filter((r) => r.withinTolerance)
  const [primary, secondary] = within.length
    ? [(r: GeneratedMultiple) => -r.ev, (r: GeneratedMultiple) => distance(r.totalOdd, target)]
    : [(r: GeneratedMultiple) => distance(r.totalOdd, target), (r: GeneratedMultiple) => -r.ev]
  let best: GeneratedMultiple | null = null
  for (const result of within.length ? within : results) {
    if (
      best === null ||
      primary(result) < primary(best) ||
      (primary(result) === primary(best) && secondary(result) < secondary(best))
    ) {
      best = result
    }
  }
  return best
}

interface BeamState {
  /** Indexes into the sorted pool, ascending, so each combination is reached once. */
  picks: number[]
  events: Set<string>
  logOdd: number
}

/**
 * Beam search in log space: grows combinations one leg at a time, keeping the BEAM_WIDTH states
 * whose sum of log(odd) is closest to where it should be at that depth (log(target) when the
 * number of legs is free, or its share of it when `legs` is fixed). With `fixed` legs it searches
 * the legs to add towards log(target) − log(fixed odd), and judges the whole multiple.
 */
function searchTargetOdd(pool: Candidate[], params: GeneratorParams): GeneratedMultiple | null {
  const target = params.targetOdd as number
  const tolerance = params.tolerance ?? DEFAULT_TOLERANCE
  const fixed = params.fixed ?? []
  const logTarget = Math.log(target) - fixed.reduce((total, leg) => total + Math.log(leg.odd), 0)
  const sorted = sortByKickoff(pool)
  const logs = sorted.map((c) => Math.log(c.odd))
  const minDepth = params.legs ?? (fixed.length ? MIN_ADDED_LEGS : MIN_LEGS)
  const maxDepth = params.legs ?? (fixed.length ? MAX_ADDED_LEGS : MAX_LEGS)
  const toResult = (state: BeamState) =>
    build([...fixed, ...state.picks.map((i) => sorted[i] as Candidate)], params, target, tolerance)

  const goal = (depth: number) => (params.legs ? (logTarget * depth) / params.legs : logTarget)
  const prune = (states: BeamState[], depth: number) =>
    states
      .map((state, order) => ({ state, order, gap: Math.abs(state.logOdd - goal(depth)) }))
      .sort((a, b) => a.gap - b.gap || a.order - b.order)
      .slice(0, BEAM_WIDTH)
      .map(({ state }) => state)

  let beam = prune(
    sorted.map((c, i) => ({
      picks: [i],
      events: new Set([c.event_id]),
      logOdd: logs[i] as number,
    })),
    1,
  )
  const results: GeneratedMultiple[] = minDepth === 1 ? beam.map(toResult) : []
  for (let depth = 2; depth <= maxDepth && beam.length; depth++) {
    const next: BeamState[] = []
    for (const state of beam) {
      for (let i = (state.picks[state.picks.length - 1] as number) + 1; i < sorted.length; i++) {
        const candidate = sorted[i] as Candidate
        if (state.events.has(candidate.event_id)) continue
        next.push({
          picks: [...state.picks, i],
          events: new Set([...state.events, candidate.event_id]),
          logOdd: state.logOdd + (logs[i] as number),
        })
      }
    }
    beam = prune(next, depth)
    if (depth >= minDepth) {
      results.push(...beam.map(toResult))
    }
  }
  return pickTargetResult(results, target)
}
