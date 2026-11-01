/**
 * Slip import (phase 4): match what a bet slip says against the owner's events, teams and
 * predictions, and turn it into the plan the confirmation window shows and the rows saving writes.
 * Spec: docs/specs/slip-import.md#matching-events-and-teams.
 */

import { probabilityFor, type ConfidenceAnchors, type ConfidenceLevel } from './confidence'
import { addDays, startOfDay, toDayKey } from './days'
import { lineKind, isValidSelection, type BetType, type Market, type MatchPeriod } from './markets'
import { MIN_SAVED_LEGS } from './multipleDraft'
import type { BetStatus } from './settlement'
import type { SlipLeg, SlipLegField, SlipRead } from './slipRead'

export type { SlipLeg, SlipRead }

// ---------------------------------------------------------------------------------------------
// Team names

/** Club affixes dropped before comparing names ("SC Braga" → "braga"). */
export const CLUB_AFFIXES: ReadonlySet<string> = new Set([
  'ac',
  'afc',
  'as',
  'bk',
  'cd',
  'cf',
  'cp',
  'fc',
  'fk',
  'if',
  'sad',
  'sc',
  'sk',
  'sl',
  'ss',
  'ssc',
  'sv',
  'ud',
  'us',
])

function nameTokens(name: string): string[] {
  const words = name
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    // Initials keep together ("S.C." → "sc"); other punctuation splits words.
    .replace(/(?<![\p{L}\p{N}])(?:\p{L}\.){2,}/gu, (initials) => `${initials.replace(/\./g, '')} `)
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
  const kept = words.filter((word) => !CLUB_AFFIXES.has(word))
  // A name made only of affixes ("AC") keeps them, or it would match everything.
  return kept.length > 0 ? kept : words
}

/**
 * A team name as compared: lower case, accents, punctuation and extra spaces removed, club affixes
 * dropped. `"S.C. Braga "` → `"braga"`, `"Atlético Madrid"` → `"atletico madrid"`.
 */
export function normaliseTeamName(name: string): string {
  return nameTokens(name).join(' ')
}

/** Shortest word that may stand for a longer one ("Man" for "Manchester", "Utd" for "United"). */
const MIN_ABBREVIATION = 3
/** Longest word read as letters picked out of a longer one ("Utd", "Wed"). */
const MAX_CONTRACTION = 4

function isSubsequence(short: string, long: string): boolean {
  let i = 0
  for (const char of long) if (char === short[i]) i++
  return i === short.length
}

/**
 * Two words match when equal, or when the shorter abbreviates the longer: it is its start
 * ("inter" → "internazionale"), or, up to four letters, it starts with the same letter and its
 * letters appear in order in the longer ("utd" → "united").
 */
function wordsMatch(a: string, b: string): boolean {
  if (a === b) return true
  const [short, long] = a.length <= b.length ? [a, b] : [b, a]
  if (short.length < MIN_ABBREVIATION || /^\d+$/.test(short)) return false
  if (long.startsWith(short)) return true
  return short.length <= MAX_CONTRACTION && short[0] === long[0] && isSubsequence(short, long)
}

/** Whether `short` matches, word by word, a run of consecutive words of `long`. */
function containsWords(long: readonly string[], short: readonly string[]): boolean {
  for (let start = 0; start + short.length <= long.length; start++) {
    if (short.every((word, i) => wordsMatch(word, long[start + i]!))) return true
  }
  return false
}

/**
 * Whether a slip's team name and an app team's name are the same team, after normalising: equal,
 * one inside the other as whole words ("Braga" and "SC Braga"), abbreviated word by word
 * ("Man Utd" and "Manchester United"), or the slip name equal to one of the team's saved aliases.
 */
export function teamNamesMatch(
  slipName: string,
  appName: string,
  aliases: readonly string[] = [],
): boolean {
  const slip = nameTokens(slipName)
  const app = nameTokens(appName)
  if (slip.length === 0 || app.length === 0) return false
  const slipKey = slip.join(' ')
  if (aliases.some((alias) => normaliseTeamName(alias) === slipKey)) return true
  return slip.length <= app.length ? containsWords(app, slip) : containsWords(slip, app)
}

// ---------------------------------------------------------------------------------------------
// Context: the owner's rows, in the minimal shape the rules need.

export interface ContextTeam {
  id: string
  name: string
}

export interface ContextEvent {
  id: string
  kickoff_at: string
  home_team: ContextTeam
  away_team: ContextTeam
}

export interface ContextAlias {
  team_id: string
  alias: string
}

export interface ContextPrediction {
  id: string
  event_id: string
  market: Market
  bet_type: BetType
  period: MatchPeriod
  selection: string
  line: number | null
  odd: number
  confidence: number
  is_punter: boolean
}

export interface ContextLeague {
  id: string
  name: string
}

export interface ImportContext {
  events: readonly ContextEvent[]
  teams: readonly ContextTeam[]
  leagues: readonly ContextLeague[]
  aliases: readonly ContextAlias[]
  predictions: readonly ContextPrediction[]
  anchors: ConfidenceAnchors
  /** When the import happens; the window for a slip without a date is counted from it. */
  now: Date
}

function aliasesByTeam(aliases: readonly ContextAlias[]): Map<string, string[]> {
  const byTeam = new Map<string, string[]>()
  for (const { team_id, alias } of aliases) {
    byTeam.set(team_id, [...(byTeam.get(team_id) ?? []), alias])
  }
  return byTeam
}

// ---------------------------------------------------------------------------------------------
// Events

/** Days before and after today searched when the slip shows no date. */
export const UNDATED_WINDOW = { before: 1, after: 7 } as const

/**
 * Events on the leg's calendar day (browser time zone), or from yesterday to seven days ahead when
 * the slip has no date.
 */
export function eventsOnLegDay<E extends ContextEvent>(
  kickoffAt: string | null,
  events: readonly E[],
  now: Date,
): E[] {
  if (kickoffAt != null) {
    const day = toDayKey(new Date(kickoffAt))
    return events.filter((event) => toDayKey(new Date(event.kickoff_at)) === day)
  }
  const from = addDays(startOfDay(now), -UNDATED_WINDOW.before).getTime()
  const to = addDays(startOfDay(now), UNDATED_WINDOW.after + 1).getTime()
  return events.filter((event) => {
    const time = new Date(event.kickoff_at).getTime()
    return time >= from && time < to
  })
}

export type EventMatch =
  /** Both teams match one event (in either order). */
  | { kind: 'linked'; eventId: string }
  /** Only one team matches, or several events match: "Este evento já existe na app?". */
  | { kind: 'ask'; candidateIds: string[] }
  | { kind: 'none' }

/** Which app team each slip team is, when they line up straight or swapped. */
type Sides = { home: boolean; away: boolean }

function sideMatches(
  leg: Pick<SlipLeg, 'homeTeam' | 'awayTeam'>,
  event: ContextEvent,
  aliases: Map<string, string[]>,
): { straight: Sides; swapped: Sides } {
  const match = (slip: string, team: ContextTeam) =>
    teamNamesMatch(slip, team.name, aliases.get(team.id))
  return {
    straight: {
      home: match(leg.homeTeam, event.home_team),
      away: match(leg.awayTeam, event.away_team),
    },
    swapped: {
      home: match(leg.homeTeam, event.away_team),
      away: match(leg.awayTeam, event.home_team),
    },
  }
}

/**
 * The event a leg is, among the owner's events on its day: `linked` when both teams match one event
 * (home and away in either order), `ask` with the candidates (nearest kickoff first) when only one
 * team matches or several events match both, `none` otherwise. One matching team is enough to ask,
 * on purpose: slips write names in other languages or abbreviated.
 */
export function matchEvent(
  leg: Pick<SlipLeg, 'homeTeam' | 'awayTeam' | 'kickoffAt'>,
  context: Pick<ImportContext, 'events' | 'aliases' | 'now'>,
): EventMatch {
  const aliases = aliasesByTeam(context.aliases)
  const reference = leg.kickoffAt != null ? new Date(leg.kickoffAt) : context.now
  const nearestFirst = (a: ContextEvent, b: ContextEvent) =>
    Math.abs(new Date(a.kickoff_at).getTime() - reference.getTime()) -
    Math.abs(new Date(b.kickoff_at).getTime() - reference.getTime())

  const full: ContextEvent[] = []
  const partial: ContextEvent[] = []
  for (const event of eventsOnLegDay(leg.kickoffAt, context.events, context.now)) {
    const { straight, swapped } = sideMatches(leg, event, aliases)
    if ((straight.home && straight.away) || (swapped.home && swapped.away)) full.push(event)
    else if (straight.home || straight.away || swapped.home || swapped.away) partial.push(event)
  }
  if (full.length === 1) return { kind: 'linked', eventId: full[0]!.id }
  const candidates = (full.length > 1 ? full : partial).sort(nearestFirst)
  if (candidates.length === 0) return { kind: 'none' }
  return { kind: 'ask', candidateIds: candidates.map((event) => event.id) }
}

/**
 * Aliases to save once a leg is linked to `event`: the slip's spelling of each team that does not
 * already match its app team. Home and away line up the way more teams match (straight on a tie).
 */
export function aliasesToSave(
  leg: Pick<SlipLeg, 'homeTeam' | 'awayTeam'>,
  event: ContextEvent,
  aliases: readonly ContextAlias[],
): ContextAlias[] {
  const { straight, swapped } = sideMatches(leg, event, aliasesByTeam(aliases))
  const score = (sides: Sides) => Number(sides.home) + Number(sides.away)
  const isSwapped = score(swapped) > score(straight)
  const sides = isSwapped ? swapped : straight
  const homeTeam = isSwapped ? event.away_team : event.home_team
  const awayTeam = isSwapped ? event.home_team : event.away_team
  const result: ContextAlias[] = []
  if (!sides.home) result.push({ team_id: homeTeam.id, alias: leg.homeTeam.trim() })
  if (!sides.away) result.push({ team_id: awayTeam.id, alias: leg.awayTeam.trim() })
  return result
}

// ---------------------------------------------------------------------------------------------
// Duplicate predictions

/** Same market, bet type, period, selection and line; the odd and the timing may differ. */
export function isSamePick(
  leg: Pick<SlipLeg, 'market' | 'betType' | 'period' | 'selection' | 'line'>,
  prediction: Pick<ContextPrediction, 'market' | 'bet_type' | 'period' | 'selection' | 'line'>,
): boolean {
  const sameLine =
    leg.line == null || prediction.line == null
      ? leg.line == null && prediction.line == null
      : Math.abs(leg.line - prediction.line) < 1e-9
  return (
    leg.market === prediction.market &&
    leg.betType === prediction.bet_type &&
    leg.period === prediction.period &&
    leg.selection != null &&
    leg.selection.trim().toLowerCase() === prediction.selection.trim().toLowerCase() &&
    sameLine
  )
}

export type DuplicateState =
  | { kind: 'none' }
  /** Leg of a multiple over an existing prediction: the leg uses it, no new row. */
  | { kind: 'reuse'; predictionId: string }
  /** Single over a prediction that is not punter: it becomes the real bet. */
  | { kind: 'upgrade'; predictionId: string; oddChanged: boolean }
  /** Single over a punter prediction: the bet is already logged. */
  | { kind: 'already_logged'; predictionId: string }

/** How a leg linked to `eventId` relates to that event's predictions. */
export function duplicateState(
  leg: Pick<SlipLeg, 'market' | 'betType' | 'period' | 'selection' | 'line' | 'odd'>,
  kind: SlipRead['kind'],
  eventId: string | null,
  predictions: readonly ContextPrediction[],
): DuplicateState {
  if (eventId == null) return { kind: 'none' }
  const existing = predictions.filter((p) => p.event_id === eventId && isSamePick(leg, p))
  if (existing.length === 0) return { kind: 'none' }
  if (kind === 'multiple') return { kind: 'reuse', predictionId: existing[0]!.id }
  const punter = existing.find((p) => p.is_punter)
  if (punter) return { kind: 'already_logged', predictionId: punter.id }
  const prediction = existing[0]!
  return {
    kind: 'upgrade',
    predictionId: prediction.id,
    oddChanged: leg.odd != null && Math.abs(leg.odd - prediction.odd) > 1e-9,
  }
}

// ---------------------------------------------------------------------------------------------
// Import plan

/** What the owner chose for one leg in the confirmation window. */
export interface LegChoice {
  /**
   * The event the leg is: an existing event id ("Sim, é o mesmo jogo", or Trocar), `'new'` ("Não, é
   * outro jogo", or "+ Novo evento"), or undefined to keep what matching found.
   */
  event?: string | 'new'
  confidence: ConfidenceLevel | null
  /** "Tirar da múltipla" / "Tirar da importação". */
  removed?: boolean
  notes?: string | null
}

/** The Boletim card, as the owner left it. */
export interface SlipChoice {
  bookmaker: string | null
  stakeUnits: number | null
  status: BetStatus
  /** Null falls back to the product of the legs' odds. */
  totalOdd: number | null
}

/** The Boletim card as read, with the stake converted to units. */
export function slipChoiceFromRead(read: SlipRead, unitValue: number): SlipChoice {
  return {
    bookmaker: read.bookmaker?.trim() || null,
    stakeUnits: read.stake != null && unitValue > 0 ? read.stake / unitValue : null,
    status: read.status ?? 'pending',
    totalOdd: read.totalOdd,
  }
}

/** Fields a leg needs before it can be saved. */
export type RequiredField =
  'kickoffAt' | 'market' | 'betType' | 'period' | 'selection' | 'line' | 'odd'

/** Why a leg cannot be saved yet. */
export type LegMissing =
  | { kind: 'question' }
  | { kind: 'confidence' }
  | { kind: 'field'; field: RequiredField }
  | { kind: 'already_logged' }

export type EventState =
  | { kind: 'question'; candidateIds: string[] }
  | { kind: 'linked'; eventId: string }
  | { kind: 'new' }

export interface LegPlan {
  /** Position on the slip. */
  index: number
  leg: SlipLeg
  /** What matching found, before any answer. */
  match: EventMatch
  /** The card's event state, after the owner's answer. */
  event: EventState
  duplicate: DuplicateState
  /** "Campos a confirmar": the reader's unsure fields, plus the date when the slip has none. */
  unsure: SlipLegField[]
  /** The confidence that will be saved: the existing row's on a reused prediction, else chosen. */
  confidence: ConfidenceLevel | null
  /** Confidence comes from an existing prediction and is shown read-only. */
  confidenceLocked: boolean
  missing: LegMissing[]
}

/** A row saved earlier in the same import, by its key in the plan, or an existing row's id. */
export type Ref = { id: string } | { key: string }

export interface NewLeague {
  key: string
  name: string
}

export interface NewTeam {
  key: string
  name: string
  league: Ref | null
}

export interface NewEvent {
  key: string
  kickoffAt: string
  league: Ref | null
  home: Ref
  away: Ref
}

export interface NewPrediction {
  key: string
  legIndex: number
  event: Ref
  market: Market
  betType: BetType
  period: MatchPeriod
  selection: string
  line: number | null
  odd: number
  confidence: ConfidenceLevel
  /** From the anchors at save time. */
  probability: number
  isLive: boolean
  isPunter: boolean
  stakeUnits: number | null
  bookmaker: string | null
  status: BetStatus
  settledAt: string | null
  notes: string | null
}

/** An existing prediction that becomes the real bet (single over a non-punter prediction). */
export interface PredictionUpgrade {
  id: string
  legIndex: number
  isPunter: true
  stakeUnits: number | null
  bookmaker: string | null
  /** The slip's odd when it differs; null keeps the stored one. */
  odd: number | null
}

export interface NewMultiple {
  origin: 'manual'
  isPlaced: true
  stakeUnits: number | null
  totalOdd: number
  status: BetStatus
  bookmaker: string | null
  settledAt: string | null
  legs: { prediction: Ref; oddAtSelection: number; origin: 'manual' }[]
}

/** Everything saving writes, in the order it is written. */
export interface ImportRows {
  leagues: NewLeague[]
  teams: NewTeam[]
  events: NewEvent[]
  aliases: ContextAlias[]
  predictions: NewPrediction[]
  upgrades: PredictionUpgrade[]
  multiple: NewMultiple | null
}

export interface ImportPlan {
  legs: LegPlan[]
  /** Footer counts: "Falta responder a 1 pergunta e escolher 2 confianças". */
  missing: { questions: number; confidences: number; fields: number; alreadyLogged: number }
  /** A multiple left with fewer than two legs. */
  tooFewLegs: boolean
  canSave: boolean
  /** The rows saving writes; complete only when `canSave`. */
  rows: ImportRows
}

function eventState(match: EventMatch, choice: LegChoice | undefined): EventState {
  if (choice?.event === 'new') return { kind: 'new' }
  if (choice?.event != null) return { kind: 'linked', eventId: choice.event }
  if (match.kind === 'linked') return { kind: 'linked', eventId: match.eventId }
  if (match.kind === 'ask') return { kind: 'question', candidateIds: match.candidateIds }
  return { kind: 'new' }
}

function missingFields(leg: SlipLeg, isNewEvent: boolean): RequiredField[] {
  const missing: RequiredField[] = []
  if (isNewEvent && leg.kickoffAt == null) missing.push('kickoffAt')
  if (leg.market == null) missing.push('market')
  if (leg.betType == null) missing.push('betType')
  if (leg.period == null) missing.push('period')
  if (
    leg.selection == null ||
    (leg.betType != null && !isValidSelection(leg.betType, leg.selection))
  )
    missing.push('selection')
  if (leg.betType != null && lineKind(leg.betType) != null && leg.line == null) missing.push('line')
  if (leg.odd == null || !(leg.odd > 1)) missing.push('odd')
  return missing
}

function isConfidenceLevel(value: number): value is ConfidenceLevel {
  return Number.isInteger(value) && value >= 1 && value <= 5
}

/** Saving's rows, for the legs that can be saved. */
class RowsBuilder {
  readonly rows: ImportRows = {
    leagues: [],
    teams: [],
    events: [],
    aliases: [],
    predictions: [],
    upgrades: [],
    multiple: null,
  }
  private readonly aliases: Map<string, string[]>

  constructor(private readonly context: ImportContext) {
    this.aliases = aliasesByTeam(context.aliases)
  }

  league(name: string | null): Ref | null {
    const trimmed = name?.trim()
    if (!trimmed) return null
    const key = trimmed.toLowerCase()
    const existing = this.context.leagues.find((l) => l.name.trim().toLowerCase() === key)
    if (existing) return { id: existing.id }
    const created = this.rows.leagues.find((l) => l.name.toLowerCase() === key)
    if (created) return { key: created.key }
    const league = { key: `league:${this.rows.leagues.length}`, name: trimmed }
    this.rows.leagues.push(league)
    return { key: league.key }
  }

  /**
   * An existing team by the same name rule (equal after normalising, then a saved alias, then the
   * loose match when only one team fits), or a new one, created once per import.
   */
  team(name: string, league: Ref | null): Ref {
    const normal = normaliseTeamName(name)
    const { teams } = this.context
    const equal = teams.find((t) => normaliseTeamName(t.name) === normal)
    if (equal) return { id: equal.id }
    const byAlias = teams.find((t) =>
      (this.aliases.get(t.id) ?? []).some((alias) => normaliseTeamName(alias) === normal),
    )
    if (byAlias) return { id: byAlias.id }
    const loose = teams.filter((t) => teamNamesMatch(name, t.name))
    if (loose.length === 1) return { id: loose[0]!.id }
    const created = this.rows.teams.find((t) => normaliseTeamName(t.name) === normal)
    if (created) return { key: created.key }
    const team = { key: `team:${this.rows.teams.length}`, name: name.trim(), league }
    this.rows.teams.push(team)
    return { key: team.key }
  }

  /** A new event, created once per import for the same teams and day. */
  event(leg: SlipLeg): Ref {
    const league = this.league(leg.league)
    const home = this.team(leg.homeTeam, league)
    const away = this.team(leg.awayTeam, league)
    const kickoffAt = leg.kickoffAt!
    const day = toDayKey(new Date(kickoffAt))
    const same = (a: Ref, b: Ref) => JSON.stringify(a) === JSON.stringify(b)
    const created = this.rows.events.find(
      (e) => same(e.home, home) && same(e.away, away) && toDayKey(new Date(e.kickoffAt)) === day,
    )
    if (created) return { key: created.key }
    const event = { key: `event:${this.rows.events.length}`, kickoffAt, league, home, away }
    this.rows.events.push(event)
    return { key: event.key }
  }

  alias(alias: ContextAlias) {
    const normal = normaliseTeamName(alias.alias)
    const known = [
      ...(this.aliases.get(alias.team_id) ?? []),
      ...this.rows.aliases.filter((a) => a.team_id === alias.team_id).map((a) => a.alias),
    ]
    if (known.some((a) => normaliseTeamName(a) === normal)) return
    this.rows.aliases.push(alias)
  }
}

/**
 * The confirmation window's plan for a slip: per leg, the event state, the duplicate state, the
 * unsure fields and what is missing; and the rows to create or update on save. `slip` is the Boletim
 * card; `choices` holds each leg's answers, by position. `read` may carry the owner's edits.
 */
export function buildImportPlan(
  read: SlipRead,
  slip: SlipChoice,
  choices: readonly (LegChoice | undefined)[],
  context: ImportContext,
): ImportPlan {
  const builder = new RowsBuilder(context)
  const eventsById = new Map(context.events.map((e) => [e.id, e]))
  const predictionsById = new Map(context.predictions.map((p) => [p.id, p]))
  const settledAt = (status: BetStatus) => (status === 'pending' ? null : context.now.toISOString())
  const multipleLegs: NewMultiple['legs'] = []
  const legs: LegPlan[] = []

  read.legs.forEach((leg, index) => {
    const choice = choices[index]
    if (choice?.removed) return
    const match = matchEvent(leg, context)
    const event = eventState(match, choice)
    const linkedId = event.kind === 'linked' ? event.eventId : null
    const duplicate = duplicateState(leg, read.kind, linkedId, context.predictions)
    const existing =
      duplicate.kind === 'none' ? undefined : predictionsById.get(duplicate.predictionId)
    const confidenceLocked = existing != null && isConfidenceLevel(existing.confidence)
    const confidence =
      confidenceLocked && existing && isConfidenceLevel(existing.confidence)
        ? existing.confidence
        : (choice?.confidence ?? null)

    const unsure = [...new Set(leg.unsure)]
    if (leg.kickoffAt == null && !unsure.includes('kickoffAt')) unsure.push('kickoffAt')

    const missing: LegMissing[] = []
    if (event.kind === 'question') missing.push({ kind: 'question' })
    if (confidence == null) missing.push({ kind: 'confidence' })
    for (const field of missingFields(leg, event.kind === 'new'))
      missing.push({ kind: 'field', field })
    if (duplicate.kind === 'already_logged') missing.push({ kind: 'already_logged' })

    legs.push({
      index,
      leg,
      match,
      event,
      duplicate,
      unsure,
      confidence,
      confidenceLocked,
      missing,
    })
    if (missing.length > 0 || confidence == null) return

    // Rows for a leg that is ready.
    let eventRef: Ref
    if (event.kind === 'linked') {
      eventRef = { id: event.eventId }
      const appEvent = eventsById.get(event.eventId)
      if (appEvent) {
        for (const alias of aliasesToSave(leg, appEvent, context.aliases)) builder.alias(alias)
      }
    } else {
      eventRef = builder.event(leg)
    }

    const odd = leg.odd!
    if (duplicate.kind === 'reuse') {
      multipleLegs.push({
        prediction: { id: duplicate.predictionId },
        oddAtSelection: odd,
        origin: 'manual',
      })
      return
    }
    if (duplicate.kind === 'upgrade') {
      builder.rows.upgrades.push({
        id: duplicate.predictionId,
        legIndex: index,
        isPunter: true,
        stakeUnits: slip.stakeUnits,
        bookmaker: slip.bookmaker,
        odd: duplicate.oddChanged ? odd : null,
      })
      return
    }

    const single = read.kind === 'single'
    const status = leg.status ?? (single ? slip.status : 'pending')
    const prediction: NewPrediction = {
      key: `prediction:${builder.rows.predictions.length}`,
      legIndex: index,
      event: eventRef,
      market: leg.market!,
      betType: leg.betType!,
      period: leg.period!,
      selection: leg.selection!,
      line: leg.line,
      odd,
      confidence,
      probability: probabilityFor(confidence, context.anchors),
      isLive: leg.timing === 'live',
      isPunter: single,
      stakeUnits: single ? slip.stakeUnits : null,
      bookmaker: single ? slip.bookmaker : null,
      status,
      settledAt: settledAt(status),
      notes: choice?.notes?.trim() || null,
    }
    builder.rows.predictions.push(prediction)
    if (!single)
      multipleLegs.push({
        prediction: { key: prediction.key },
        oddAtSelection: odd,
        origin: 'manual',
      })
  })

  const count = (kind: LegMissing['kind']) =>
    legs.reduce((n, leg) => n + leg.missing.filter((m) => m.kind === kind).length, 0)
  const missing = {
    questions: count('question'),
    confidences: count('confidence'),
    fields: count('field'),
    alreadyLogged: count('already_logged'),
  }
  const tooFewLegs = read.kind === 'multiple' && legs.length < MIN_SAVED_LEGS
  const canSave = legs.length > 0 && !tooFewLegs && legs.every((leg) => leg.missing.length === 0)

  if (read.kind === 'multiple' && canSave) {
    const productOdd = legs.reduce((total, leg) => total * leg.leg.odd!, 1)
    builder.rows.multiple = {
      origin: 'manual',
      isPlaced: true,
      stakeUnits: slip.stakeUnits,
      totalOdd: slip.totalOdd ?? Math.round(productOdd * 100) / 100,
      status: slip.status,
      bookmaker: slip.bookmaker,
      settledAt: settledAt(slip.status),
      legs: multipleLegs,
    }
  }

  return { legs, missing, tooFewLegs, canSave, rows: builder.rows }
}
