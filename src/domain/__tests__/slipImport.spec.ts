import { describe, expect, it } from 'vitest'
import { DEFAULT_CONFIDENCE_ANCHORS } from '../confidence'
import {
  aliasesToSave,
  buildImportPlan,
  duplicateState,
  eventsOnLegDay,
  isSamePick,
  matchEvent,
  normaliseTeamName,
  slipChoiceFromRead,
  teamNamesMatch,
  type ContextEvent,
  type ContextPrediction,
  type ImportContext,
  type SlipChoice,
  type SlipLeg,
  type SlipRead,
} from '../slipImport'

const team = (id: string, name: string) => ({ id, name })
const sporting = team('t-sporting', 'Sporting')
const rioAve = team('t-rio-ave', 'Rio Ave FC')
const braga = team('t-braga', 'Braga')
const benfica = team('t-benfica', 'Benfica')
const porto = team('t-porto', 'FC Porto')
const manUtd = team('t-manutd', 'Manchester United')
const liverpool = team('t-liverpool', 'Liverpool')

/** Local time, so day boundaries follow the test machine's time zone like the browser's. */
const at = (y: number, m: number, d: number, h = 20) => new Date(y, m - 1, d, h).toISOString()

const event = (
  id: string,
  home: { id: string; name: string },
  away: { id: string; name: string },
  kickoff: string,
): ContextEvent => ({ id, kickoff_at: kickoff, home_team: home, away_team: away })

const leg = (overrides: Partial<SlipLeg> = {}): SlipLeg => ({
  rawText: 'Sporting CP – Rio Ave · Total de golos · Mais de 2.5',
  homeTeam: 'Sporting CP',
  awayTeam: 'Rio Ave',
  league: 'Liga Portugal',
  kickoffAt: at(2026, 11, 1),
  timing: 'pre',
  market: 'goals',
  betType: 'total',
  period: 'FT',
  selection: 'over',
  line: 2.5,
  odd: 1.8,
  status: 'pending',
  unsure: [],
  ...overrides,
})

const prediction = (overrides: Partial<ContextPrediction> = {}): ContextPrediction => ({
  id: 'p-1',
  event_id: 'e-sporting',
  market: 'goals',
  bet_type: 'total',
  period: 'FT',
  selection: 'over',
  line: 2.5,
  odd: 1.75,
  confidence: 4,
  is_punter: false,
  ...overrides,
})

const events = [
  event('e-sporting', sporting, rioAve, at(2026, 11, 1, 18)),
  event('e-braga', braga, benfica, at(2026, 11, 1, 20)),
  event('e-porto', porto, team('t-arouca', 'Arouca'), at(2026, 11, 2, 20)),
  event('e-manutd', manUtd, liverpool, at(2026, 11, 1, 16)),
]

const context = (overrides: Partial<ImportContext> = {}): ImportContext => ({
  events,
  teams: [sporting, rioAve, braga, benfica, porto, manUtd, liverpool],
  leagues: [{ id: 'l-liga', name: 'Liga Portugal' }],
  aliases: [],
  predictions: [],
  anchors: DEFAULT_CONFIDENCE_ANCHORS,
  now: new Date(2026, 9, 31, 12),
  ...overrides,
})

const slip: SlipChoice = { bookmaker: 'Betano', stakeUnits: 2, status: 'pending', totalOdd: null }

describe('normaliseTeamName', () => {
  it('lowers case, removes accents, punctuation, extra spaces and club affixes', () => {
    expect(normaliseTeamName('  S.C.  Braga ')).toBe('braga')
    expect(normaliseTeamName('Atlético Madrid')).toBe('atletico madrid')
    expect(normaliseTeamName('Vitória SC')).toBe('vitoria')
    expect(normaliseTeamName('Bayern München')).toBe('bayern munchen')
    expect(normaliseTeamName('Benfica SAD')).toBe('benfica')
    expect(normaliseTeamName('AFC Bournemouth')).toBe('bournemouth')
    expect(normaliseTeamName('A.F.C. Bournemouth')).toBe('bournemouth')
  })

  it('keeps a name made only of affixes', () => {
    expect(normaliseTeamName('A.C.')).toBe('ac')
  })
})

describe('teamNamesMatch', () => {
  it('matches equal names after normalising', () => {
    expect(teamNamesMatch('SC Braga', 'Braga')).toBe(true)
    expect(teamNamesMatch('Vitoria', 'Vitória SC')).toBe(true)
  })

  it('matches when one contains the other as whole words', () => {
    expect(teamNamesMatch('Sporting CP', 'Sporting')).toBe(true)
    expect(teamNamesMatch('Rio Ave', 'Rio Ave FC')).toBe(true)
    expect(teamNamesMatch('Sporting Braga', 'Braga')).toBe(true)
    expect(teamNamesMatch('Real', 'Real Madrid')).toBe(true)
  })

  it('does not match part of a word', () => {
    expect(teamNamesMatch('Arouca', 'Rio Ave')).toBe(false)
    expect(teamNamesMatch('Porto', 'Portimonense')).toBe(false)
    expect(teamNamesMatch('Benfica', 'Porto')).toBe(false)
  })

  it('matches abbreviations word by word', () => {
    expect(teamNamesMatch('Man Utd', 'Manchester United')).toBe(true)
    expect(teamNamesMatch('Man. United', 'Manchester United')).toBe(true)
    expect(teamNamesMatch('Inter', 'Internazionale')).toBe(true)
    expect(teamNamesMatch('Sheffield Wed', 'Sheffield Wednesday')).toBe(true)
    expect(teamNamesMatch('Man City', 'Manchester United')).toBe(false)
  })

  it('matches a saved alias', () => {
    expect(teamNamesMatch('Bayern Munich', 'Bayern München')).toBe(false)
    expect(teamNamesMatch('Bayern Munich', 'Bayern München', ['FC Bayern Munich'])).toBe(true)
    expect(teamNamesMatch('Rapid Viena', 'Rapid Wien', ['Rapid Viena'])).toBe(true)
  })
})

describe('eventsOnLegDay', () => {
  const now = new Date(2026, 9, 31, 12)

  it('keeps the events on the same calendar day', () => {
    expect(eventsOnLegDay(at(2026, 11, 1, 10), events, now).map((e) => e.id)).toEqual([
      'e-sporting',
      'e-braga',
      'e-manutd',
    ])
  })

  it('uses yesterday to seven days ahead when the slip has no date', () => {
    const window = [
      event('a', braga, benfica, at(2026, 10, 29, 23)),
      event('b', braga, benfica, at(2026, 10, 30, 0)),
      event('c', braga, benfica, at(2026, 11, 7, 23)),
      event('d', braga, benfica, at(2026, 11, 8, 0)),
    ]
    expect(eventsOnLegDay(null, window, now).map((e) => e.id)).toEqual(['b', 'c'])
  })
})

describe('matchEvent', () => {
  const ctx = context()

  it('links when both teams match one event', () => {
    expect(matchEvent(leg(), ctx)).toEqual({ kind: 'linked', eventId: 'e-sporting' })
  })

  it('links with home and away swapped', () => {
    expect(matchEvent(leg({ homeTeam: 'Rio Ave', awayTeam: 'Sporting CP' }), ctx)).toEqual({
      kind: 'linked',
      eventId: 'e-sporting',
    })
  })

  it('links through accents, affixes and abbreviations', () => {
    expect(matchEvent(leg({ homeTeam: 'S.C. Braga', awayTeam: 'SL Benfica' }), ctx)).toEqual({
      kind: 'linked',
      eventId: 'e-braga',
    })
    expect(matchEvent(leg({ homeTeam: 'Man Utd', awayTeam: 'Liverpool FC' }), ctx)).toEqual({
      kind: 'linked',
      eventId: 'e-manutd',
    })
  })

  it('asks when only one team matches a game that day', () => {
    expect(matchEvent(leg({ homeTeam: 'SC Braga', awayTeam: 'Lisbon Eagles' }), ctx)).toEqual({
      kind: 'ask',
      candidateIds: ['e-braga'],
    })
  })

  it('links through a saved alias', () => {
    const withAlias = context({ aliases: [{ team_id: 't-benfica', alias: 'Lisbon Eagles' }] })
    expect(matchEvent(leg({ homeTeam: 'SC Braga', awayTeam: 'Lisbon Eagles' }), withAlias)).toEqual(
      {
        kind: 'linked',
        eventId: 'e-braga',
      },
    )
  })

  it('lists several candidates nearest kickoff first', () => {
    // Sporting matches e-sporting (18:00) and Benfica matches e-braga (20:00); the slip says 21:00.
    const result = matchEvent(
      leg({ homeTeam: 'Benfica', awayTeam: 'Sporting', kickoffAt: at(2026, 11, 1, 21) }),
      ctx,
    )
    expect(result).toEqual({ kind: 'ask', candidateIds: ['e-braga', 'e-sporting'] })
  })

  it('asks between several events that match both teams', () => {
    const twice = context({
      events: [
        event('e-1', sporting, rioAve, at(2026, 11, 5)),
        event('e-2', rioAve, sporting, at(2026, 11, 1)),
      ],
    })
    expect(matchEvent(leg({ kickoffAt: null }), twice)).toEqual({
      kind: 'ask',
      candidateIds: ['e-2', 'e-1'],
    })
  })

  it('finds nothing on another day or with other teams', () => {
    expect(matchEvent(leg({ kickoffAt: at(2026, 11, 3) }), ctx)).toEqual({ kind: 'none' })
    expect(matchEvent(leg({ homeTeam: 'Gil Vicente', awayTeam: 'Estoril' }), ctx)).toEqual({
      kind: 'none',
    })
  })

  it('searches the undated window when the slip has no date', () => {
    expect(
      matchEvent(leg({ homeTeam: 'Porto', awayTeam: 'Arouca', kickoffAt: null }), ctx),
    ).toEqual({ kind: 'linked', eventId: 'e-porto' })
  })
})

describe('aliasesToSave', () => {
  const braga2 = events[1]!

  it("saves the slip's spelling of the team that did not match", () => {
    expect(aliasesToSave({ homeTeam: 'SC Braga', awayTeam: 'Lisbon Eagles' }, braga2, [])).toEqual([
      { team_id: 't-benfica', alias: 'Lisbon Eagles' },
    ])
  })

  it('lines up swapped teams', () => {
    expect(aliasesToSave({ homeTeam: 'Lisbon Eagles', awayTeam: 'Braga' }, braga2, [])).toEqual([
      { team_id: 't-benfica', alias: 'Lisbon Eagles' },
    ])
  })

  it('saves nothing when both already match', () => {
    expect(aliasesToSave({ homeTeam: 'SC Braga', awayTeam: 'SL Benfica' }, braga2, [])).toEqual([])
  })
})

describe('isSamePick', () => {
  it('ignores odd and timing but not line, selection or period', () => {
    expect(isSamePick(leg({ odd: 2.1, timing: 'live' }), prediction())).toBe(true)
    expect(isSamePick(leg({ line: 3.5 }), prediction())).toBe(false)
    expect(isSamePick(leg({ selection: 'under' }), prediction())).toBe(false)
    expect(isSamePick(leg({ period: 'HT' }), prediction())).toBe(false)
    expect(isSamePick(leg({ betType: 'team_total' }), prediction())).toBe(false)
  })

  it('treats two missing lines as equal', () => {
    const btts = { market: 'goals', bet_type: 'btts', selection: 'yes', line: null } as const
    expect(
      isSamePick(leg({ betType: 'btts', selection: 'yes', line: null }), prediction(btts)),
    ).toBe(true)
  })
})

describe('duplicateState', () => {
  it('reuses the prediction on a leg of a multiple', () => {
    expect(duplicateState(leg(), 'multiple', 'e-sporting', [prediction()])).toEqual({
      kind: 'reuse',
      predictionId: 'p-1',
    })
  })

  it('upgrades a non-punter prediction on a single', () => {
    expect(duplicateState(leg(), 'single', 'e-sporting', [prediction()])).toEqual({
      kind: 'upgrade',
      predictionId: 'p-1',
      oddChanged: true,
    })
    expect(duplicateState(leg({ odd: 1.75 }), 'single', 'e-sporting', [prediction()])).toEqual({
      kind: 'upgrade',
      predictionId: 'p-1',
      oddChanged: false,
    })
  })

  it('says a punter prediction is already logged on a single', () => {
    expect(
      duplicateState(leg(), 'single', 'e-sporting', [prediction({ is_punter: true })]),
    ).toEqual({ kind: 'already_logged', predictionId: 'p-1' })
  })

  it('finds none on another event, or on a new one', () => {
    expect(duplicateState(leg(), 'single', 'e-braga', [prediction()])).toEqual({ kind: 'none' })
    expect(duplicateState(leg(), 'single', null, [prediction()])).toEqual({ kind: 'none' })
  })
})

describe('slipChoiceFromRead', () => {
  it('converts the stake to units', () => {
    const read: SlipRead = {
      kind: 'single',
      bookmaker: ' Betano ',
      stake: 25,
      totalOdd: 1.8,
      status: null,
      legs: [],
    }
    expect(slipChoiceFromRead(read, 10)).toEqual({
      bookmaker: 'Betano',
      stakeUnits: 2.5,
      status: 'pending',
      totalOdd: 1.8,
    })
  })
})

describe('buildImportPlan', () => {
  const single = (l: SlipLeg = leg()): SlipRead => ({
    kind: 'single',
    bookmaker: 'Betano',
    stake: 20,
    totalOdd: l.odd,
    status: 'pending',
    legs: [l],
  })

  it('saves a single on a linked event as a punter prediction', () => {
    const plan = buildImportPlan(single(), slip, [{ confidence: 3 }], context())
    expect(plan.canSave).toBe(true)
    expect(plan.legs[0]!.event).toEqual({ kind: 'linked', eventId: 'e-sporting' })
    expect(plan.rows.events).toEqual([])
    expect(plan.rows.predictions).toEqual([
      expect.objectContaining({
        event: { id: 'e-sporting' },
        selection: 'over',
        line: 2.5,
        confidence: 3,
        probability: DEFAULT_CONFIDENCE_ANCHORS[3],
        isPunter: true,
        stakeUnits: 2,
        bookmaker: 'Betano',
        status: 'pending',
        settledAt: null,
      }),
    ])
    expect(plan.rows.multiple).toBeNull()
  })

  it('waits for the answer to the event question, then saves the alias', () => {
    const read = single(leg({ homeTeam: 'SC Braga', awayTeam: 'Lisbon Eagles' }))
    const unanswered = buildImportPlan(read, slip, [{ confidence: 3 }], context())
    expect(unanswered.legs[0]!.event).toEqual({ kind: 'question', candidateIds: ['e-braga'] })
    expect(unanswered.missing.questions).toBe(1)
    expect(unanswered.canSave).toBe(false)

    const yes = buildImportPlan(read, slip, [{ confidence: 3, event: 'e-braga' }], context())
    expect(yes.canSave).toBe(true)
    expect(yes.rows.aliases).toEqual([{ team_id: 't-benfica', alias: 'Lisbon Eagles' }])
    expect(yes.rows.predictions[0]!.event).toEqual({ id: 'e-braga' })
  })

  it('makes a new event, reusing existing teams by the name rule', () => {
    const read = single(leg({ homeTeam: 'SC Braga', awayTeam: 'Lisbon Eagles' }))
    const no = buildImportPlan(read, slip, [{ confidence: 3, event: 'new' }], context())
    expect(no.canSave).toBe(true)
    expect(no.rows.aliases).toEqual([])
    expect(no.rows.teams).toEqual([
      { key: 'team:0', name: 'Lisbon Eagles', league: { id: 'l-liga' } },
    ])
    expect(no.rows.events).toEqual([
      {
        key: 'event:0',
        kickoffAt: read.legs[0]!.kickoffAt,
        league: { id: 'l-liga' },
        home: { id: 't-braga' },
        away: { key: 'team:0' },
      },
    ])
    expect(no.rows.predictions[0]!.event).toEqual({ key: 'event:0' })
  })

  it('creates new leagues and teams once per import', () => {
    const read: SlipRead = {
      kind: 'multiple',
      bookmaker: null,
      stake: 10,
      totalOdd: null,
      status: 'pending',
      legs: [
        leg({ homeTeam: 'Ajax', awayTeam: 'PSV', league: 'Eredivisie' }),
        leg({ homeTeam: 'Ajax', awayTeam: 'PSV', league: 'Eredivisie', selection: 'under' }),
      ],
    }
    const plan = buildImportPlan(read, slip, [{ confidence: 2 }, { confidence: 3 }], context())
    expect(plan.canSave).toBe(true)
    expect(plan.rows.leagues).toEqual([{ key: 'league:0', name: 'Eredivisie' }])
    expect(plan.rows.teams.map((t) => t.name)).toEqual(['Ajax', 'PSV'])
    expect(plan.rows.events).toHaveLength(1)
    expect(plan.rows.predictions.map((p) => p.event)).toEqual([
      { key: 'event:0' },
      { key: 'event:0' },
    ])
  })

  it('builds the multiple, reusing an existing prediction as a leg', () => {
    const read: SlipRead = {
      kind: 'multiple',
      bookmaker: 'Betano',
      stake: 20,
      totalOdd: 4.1,
      status: 'pending',
      legs: [leg({ odd: 1.9 }), leg({ homeTeam: 'Braga', awayTeam: 'Benfica', odd: 2.1 })],
    }
    const ctx = context({ predictions: [prediction()] })
    const plan = buildImportPlan(read, slip, [{ confidence: null }, { confidence: 4 }], ctx)
    expect(plan.legs[0]!.duplicate).toEqual({ kind: 'reuse', predictionId: 'p-1' })
    expect(plan.legs[0]!.confidence).toBe(4)
    expect(plan.legs[0]!.confidenceLocked).toBe(true)
    expect(plan.canSave).toBe(true)
    expect(plan.rows.predictions).toHaveLength(1)
    expect(plan.rows.predictions[0]).toMatchObject({ isPunter: false, stakeUnits: null })
    expect(plan.rows.multiple).toEqual({
      origin: 'manual',
      isPlaced: true,
      stakeUnits: 2,
      totalOdd: 3.99,
      status: 'pending',
      bookmaker: 'Betano',
      settledAt: null,
      legs: [
        { prediction: { id: 'p-1' }, oddAtSelection: 1.9, origin: 'manual' },
        { prediction: { key: 'prediction:0' }, oddAtSelection: 2.1, origin: 'manual' },
      ],
    })
  })

  it("uses the slip's total odd over the product of the legs", () => {
    const read: SlipRead = {
      kind: 'multiple',
      bookmaker: null,
      stake: 10,
      totalOdd: 4.5,
      status: 'won',
      legs: [leg({ odd: 2, status: 'won' }), leg({ selection: 'under', odd: 2, status: 'won' })],
    }
    const choice = { ...slipChoiceFromRead(read, 10) }
    const plan = buildImportPlan(read, choice, [{ confidence: 1 }, { confidence: 1 }], context())
    expect(plan.rows.multiple).toMatchObject({ totalOdd: 4.5, status: 'won' })
    expect(plan.rows.multiple!.settledAt).toBe(context().now.toISOString())
    expect(plan.rows.predictions[0]!.settledAt).toBe(context().now.toISOString())
  })

  it('turns a single over a non-punter prediction into the real bet', () => {
    const ctx = context({ predictions: [prediction()] })
    const plan = buildImportPlan(single(), slip, [{ confidence: null }], ctx)
    expect(plan.canSave).toBe(true)
    expect(plan.rows.predictions).toEqual([])
    expect(plan.rows.upgrades).toEqual([
      { id: 'p-1', legIndex: 0, isPunter: true, stakeUnits: 2, bookmaker: 'Betano', odd: 1.8 },
    ])
  })

  it('blocks a single that is already logged', () => {
    const ctx = context({ predictions: [prediction({ is_punter: true })] })
    const plan = buildImportPlan(single(), slip, [{ confidence: 3 }], ctx)
    expect(plan.legs[0]!.missing).toEqual([{ kind: 'already_logged' }])
    expect(plan.missing.alreadyLogged).toBe(1)
    expect(plan.canSave).toBe(false)
  })

  it('counts missing confidences and fields, and adds the date to the unsure fields', () => {
    const read = single(
      leg({ homeTeam: 'Ajax', awayTeam: 'PSV', kickoffAt: null, line: null, unsure: ['line'] }),
    )
    const plan = buildImportPlan(read, slip, [undefined], context())
    expect(plan.legs[0]!.unsure).toEqual(['line', 'kickoffAt'])
    expect(plan.legs[0]!.missing).toEqual([
      { kind: 'confidence' },
      { kind: 'field', field: 'kickoffAt' },
      { kind: 'field', field: 'line' },
    ])
    expect(plan.missing).toEqual({ questions: 0, confidences: 1, fields: 2, alreadyLogged: 0 })
    expect(plan.canSave).toBe(false)
  })

  it('leaves out removed legs and flags a multiple left with one leg', () => {
    const read: SlipRead = {
      kind: 'multiple',
      bookmaker: null,
      stake: 10,
      totalOdd: null,
      status: 'pending',
      legs: [leg(), leg({ selection: 'under' })],
    }
    const plan = buildImportPlan(
      read,
      slip,
      [{ confidence: 3 }, { confidence: 3, removed: true }],
      context(),
    )
    expect(plan.legs.map((l) => l.index)).toEqual([0])
    expect(plan.tooFewLegs).toBe(true)
    expect(plan.canSave).toBe(false)
    expect(plan.rows.multiple).toBeNull()
  })
})
