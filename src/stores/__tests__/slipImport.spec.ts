import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { argsOf, fakeSupabase, has, type Query, type Responder } from './fakeSupabase'
import { contextWindow, useSlipImportStore } from '../slipImport'
import type { ImportRows } from '@/domain/slipImport'
import type { SlipLeg, SlipRead } from '@/domain/slipRead'
import { UserError } from '@/lib/errors'

type Invoke = (name: string, options: unknown) => Promise<{ data: unknown; error: unknown }>

const mocked = vi.hoisted(() => ({ client: null as unknown }))
vi.mock('@/lib/supabase', () => ({
  get supabase() {
    return mocked.client
  },
}))

const leg = (over: Partial<SlipLeg> = {}): SlipLeg => ({
  rawText: 'Benfica - Porto · Mais de 2,5',
  homeTeam: 'Benfica',
  awayTeam: 'Porto',
  league: 'Liga Portugal',
  kickoffAt: '2026-11-02T20:00:00Z',
  timing: 'pre',
  market: 'goals',
  betType: 'total',
  period: 'FT',
  selection: 'over',
  line: 2.5,
  odd: 1.9,
  status: null,
  unsure: [],
  ...over,
})

const single: SlipRead = {
  kind: 'single',
  bookmaker: 'Betano',
  stake: 10,
  totalOdd: 1.9,
  status: 'pending',
  legs: [leg()],
}

/** Inserts answer with ids `<table>-1`, `<table>-2`…; `fail` picks a query to fail. */
function setup(fail?: (q: Query) => boolean, invoke?: Mock<Invoke>) {
  const counts = new Map<string, number>()
  const respond: Responder = (q) => {
    if (fail?.(q)) return { error: { code: '42501', message: 'denied' } }
    if (has(q, 'insert') || has(q, 'upsert')) {
      const n = (counts.get(q.table) ?? 0) + 1
      counts.set(q.table, n)
      const row = { id: `${q.table}-${n}` }
      return { data: has(q, 'single') ? row : [row] }
    }
    if (has(q, 'select') && has(q, 'single'))
      return { data: { is_punter: false, stake_units: null, bookmaker: null, odd: 1.8 } }
    return { data: [] }
  }
  const fake = fakeSupabase(respond)
  Object.assign(fake.client, { functions: { invoke: invoke ?? vi.fn<Invoke>() } })
  mocked.client = fake.client
  return fake.queries
}

const writes = (queries: Query[]) =>
  queries
    .filter((q) => ['insert', 'upsert', 'update', 'delete'].some((m) => has(q, m)))
    .map(
      (q) =>
        `${q.ops.find(([m]) => ['insert', 'upsert', 'update', 'delete'].includes(m))![0]} ${q.table}`,
    )

const rows = (over: Partial<ImportRows> = {}): ImportRows => ({
  leagues: [{ key: 'league:0', name: 'Liga Portugal' }],
  teams: [
    { key: 'team:0', name: 'Benfica', league: { key: 'league:0' } },
    { key: 'team:1', name: 'Porto', league: { key: 'league:0' } },
  ],
  events: [
    {
      key: 'event:0',
      kickoffAt: '2026-11-02T20:00:00Z',
      league: { key: 'league:0' },
      home: { key: 'team:0' },
      away: { key: 'team:1' },
    },
  ],
  aliases: [{ team_id: 'old-team', alias: 'Sporting CP' }],
  predictions: [
    {
      key: 'prediction:0',
      legIndex: 0,
      event: { key: 'event:0' },
      market: 'goals',
      betType: 'total',
      period: 'FT',
      selection: 'over',
      line: 2.5,
      odd: 1.9,
      confidence: 4,
      probability: 0.75,
      isLive: false,
      isPunter: false,
      stakeUnits: null,
      bookmaker: null,
      status: 'pending',
      settledAt: null,
      notes: null,
    },
  ],
  upgrades: [],
  multiple: {
    origin: 'manual',
    isPlaced: true,
    stakeUnits: 0.5,
    totalOdd: 3.4567,
    status: 'pending',
    bookmaker: 'Betano',
    settledAt: null,
    legs: [
      { prediction: { key: 'prediction:0' }, oddAtSelection: 1.9, origin: 'manual' },
      { prediction: { id: 'existing-prediction' }, oddAtSelection: 1.8, origin: 'manual' },
    ],
  },
  ...over,
})

beforeEach(() => {
  setActivePinia(createPinia())
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('slip import store: read', () => {
  it('sends the JPEG and the time zone to read-slip and flags catalogue issues', async () => {
    const invoke = vi.fn<Invoke>().mockResolvedValue({
      data: { ...single, legs: [leg({ odd: 1, unsure: [] })] },
      error: null,
    })
    setup(undefined, invoke)
    const read = await useSlipImportStore().read('AAAA')

    expect(invoke).toHaveBeenCalledWith('read-slip', {
      body: expect.objectContaining({ image: 'AAAA', mediaType: 'image/jpeg' }),
    })
    expect(read.legs[0]!.unsure).toContain('odd')
  })

  it('turns the function’s error code into its message', async () => {
    const context = { json: () => Promise.resolve({ error: 'daily_limit' }) }
    setup(undefined, vi.fn<Invoke>().mockResolvedValue({ data: null, error: { context } }))
    await expect(useSlipImportStore().read('AAAA')).rejects.toEqual(
      new UserError('slipImport.errors.daily_limit'),
    )
  })

  it('treats an answer that fails validation as a failed read', async () => {
    setup(
      undefined,
      vi.fn<Invoke>().mockResolvedValue({ data: { kind: 'single', legs: [] }, error: null }),
    )
    await expect(useSlipImportStore().read('AAAA')).rejects.toEqual(
      new UserError('slipImport.errors.read_failed'),
    )
  })

  it('is unavailable when the call itself fails', async () => {
    setup(undefined, vi.fn<Invoke>().mockRejectedValue(new TypeError('fetch failed')))
    await expect(useSlipImportStore().read('AAAA')).rejects.toEqual(
      new UserError('slipImport.errors.unavailable'),
    )
  })
})

describe('slip import store: save', () => {
  it('writes leagues, teams, events, aliases, predictions, then the multiple and its legs', async () => {
    const queries = setup()
    const saved = await useSlipImportStore().save(rows())

    expect(writes(queries)).toEqual([
      'insert leagues',
      'insert teams',
      'insert teams',
      'insert events',
      'upsert team_aliases',
      'insert predictions',
      'insert multiples',
      'insert multiple_legs',
    ])
    const insert = (table: string) =>
      queries
        .filter((q) => q.table === table && has(q, 'insert'))
        .map((q) => argsOf(q, 'insert')![0])
    expect(insert('teams')[1]).toEqual({ name: 'Porto', league_id: 'leagues-1' })
    expect(insert('events')[0]).toEqual({
      kickoff_at: '2026-11-02T20:00:00Z',
      league_id: 'leagues-1',
      home_team_id: 'teams-1',
      away_team_id: 'teams-2',
    })
    expect(insert('predictions')[0]).toMatchObject({
      event_id: 'events-1',
      probability: 0.75,
      is_punter: false,
      stake_units: null,
    })
    expect(insert('multiples')[0]).toEqual({
      origin: 'manual',
      generator_mode: null,
      generator_params: null,
      total_odd: 3.457,
      stake_units: 0.5,
      is_placed: true,
      status: 'pending',
      settled_at: null,
      bookmaker: 'Betano',
    })
    expect(insert('multiple_legs')[0]).toEqual([
      {
        multiple_id: 'multiples-1',
        prediction_id: 'predictions-1',
        odd_at_selection: 1.9,
        origin: 'manual',
      },
      {
        multiple_id: 'multiples-1',
        prediction_id: 'existing-prediction',
        odd_at_selection: 1.8,
        origin: 'manual',
      },
    ])
    const alias = queries.find((q) => q.table === 'team_aliases')!
    expect(argsOf(alias, 'upsert')).toEqual([
      { team_id: 'old-team', alias: 'Sporting CP' },
      { onConflict: 'user_id,alias', ignoreDuplicates: true },
    ])
    expect(saved).toEqual({ predictions: 2, multiple: true, upgraded: false })
  })

  it('deletes what it wrote, newest first, when a step fails', async () => {
    const queries = setup((q) => q.table === 'multiple_legs')
    await expect(useSlipImportStore().save(rows())).rejects.toBeTruthy()

    const deletes = queries
      .filter((q) => has(q, 'delete'))
      .map((q) => `${q.table} ${String(argsOf(q, 'eq')![1])}`)
    expect(deletes).toEqual([
      'multiples multiples-1',
      'predictions predictions-1',
      'team_aliases team_aliases-1',
      'events events-1',
      'teams teams-2',
      'teams teams-1',
      'leagues leagues-1',
    ])
  })

  it('makes an existing prediction the real bet, and puts it back when a later step fails', async () => {
    const upgrade = {
      id: 'p1',
      legIndex: 0,
      isPunter: true as const,
      stakeUnits: 1,
      bookmaker: 'Betano',
      odd: 1.95,
    }
    const ok = setup()
    const saved = await useSlipImportStore().save(
      rows({
        leagues: [],
        teams: [],
        events: [],
        aliases: [],
        predictions: [],
        multiple: null,
        upgrades: [upgrade],
      }),
    )
    const update = ok.find((q) => has(q, 'update'))!
    expect(argsOf(update, 'update')).toEqual([
      { is_punter: true, stake_units: 1, bookmaker: 'Betano', odd: 1.95 },
    ])
    expect(saved).toEqual({ predictions: 1, multiple: false, upgraded: true })

    const failing = setup((q) => q.table === 'multiples')
    await expect(
      useSlipImportStore().save(
        rows({
          leagues: [],
          teams: [],
          events: [],
          aliases: [],
          predictions: [],
          upgrades: [upgrade],
        }),
      ),
    ).rejects.toBeTruthy()
    const restore = failing.filter((q) => has(q, 'update')).pop()!
    expect(argsOf(restore, 'update')).toEqual([
      { is_punter: false, stake_units: null, bookmaker: null, odd: 1.8 },
    ])
  })
})

describe('contextWindow', () => {
  it('covers the legs’ local days', () => {
    const read = {
      ...single,
      legs: [
        leg({ kickoffAt: new Date(2026, 10, 3, 20).toISOString() }),
        leg({ kickoffAt: new Date(2026, 10, 1, 15).toISOString() }),
      ],
    }
    expect(contextWindow(read, new Date(2026, 10, 2))).toEqual({
      from: new Date(2026, 10, 1),
      to: new Date(2026, 10, 4),
    })
  })

  it('widens to yesterday through seven days ahead for a leg without a date', () => {
    const read = { ...single, legs: [leg({ kickoffAt: null })] }
    expect(contextWindow(read, new Date(2026, 10, 2, 12))).toEqual({
      from: new Date(2026, 10, 1),
      to: new Date(2026, 10, 10),
    })
  })
})
