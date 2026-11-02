import { describe, expect, it } from 'vitest'
import {
  fitWithin,
  fromLocalInput,
  joinSelection,
  selectionOverUnder,
  selectionSide,
  toLocalInput,
  withBetType,
  withMarket,
} from '../slipLegEdit'
import type { SlipLeg } from '../slipRead'

const leg = (over: Partial<SlipLeg> = {}): SlipLeg => ({
  rawText: 'Benfica - Porto · Mais de 2,5',
  homeTeam: 'Benfica',
  awayTeam: 'Porto',
  league: null,
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

describe('fitWithin', () => {
  it('shrinks the long side to the limit and keeps the shape', () => {
    expect(fitWithin(3200, 1800)).toEqual({ width: 1600, height: 900 })
    expect(fitWithin(1080, 2400)).toEqual({ width: 720, height: 1600 })
  })

  it('leaves small images as they are', () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 })
  })
})

describe('selection parts', () => {
  it('splits a stored selection into side and over / under', () => {
    expect(selectionSide('team_total', 'home_under')).toBe('home')
    expect(selectionOverUnder('home_under')).toBe('under')
    expect(selectionSide('total', 'over')).toBe('')
    expect(selectionOverUnder('over')).toBe('over')
    expect(selectionSide('1x2', 'draw')).toBe('draw')
    expect(selectionSide('1x2', null)).toBe('')
  })

  it('joins side and over / under back into the stored code', () => {
    expect(joinSelection('team_total', 'away', 'over')).toBe('away_over')
    expect(joinSelection('total', '', 'under')).toBe('under')
    expect(joinSelection('1x2', 'home', 'over')).toBe('home')
    expect(joinSelection('other', '  Benfica marca  ', 'over')).toBe('Benfica marca')
    expect(joinSelection('result_total', '', 'over')).toBeNull()
  })
})

describe('withMarket / withBetType', () => {
  it('falls back to the market’s first type, clearing the selection and a line it cannot have', () => {
    const next = withMarket(leg(), 'result')
    expect(next).toMatchObject({ market: 'result', betType: '1x2', selection: null, line: null })
  })

  it('keeps a type the new market offers', () => {
    expect(withMarket(leg(), 'corners')).toMatchObject({ betType: 'total', selection: 'over' })
  })

  it('keeps the line when the new type has one', () => {
    expect(withBetType(leg(), 'team_total')).toMatchObject({ selection: null, line: 2.5 })
    expect(withBetType(leg(), 'btts')).toMatchObject({ selection: null, line: null })
  })
})

describe('datetime-local values', () => {
  it('goes to the local input and back', () => {
    const iso = new Date(2026, 10, 2, 20, 45).toISOString()
    expect(toLocalInput(iso)).toBe('2026-11-02T20:45')
    expect(fromLocalInput('2026-11-02T20:45')).toBe(iso)
  })

  it('treats blank or broken values as missing', () => {
    expect(toLocalInput(null)).toBe('')
    expect(toLocalInput('soon')).toBe('')
    expect(fromLocalInput('')).toBeNull()
    expect(fromLocalInput('nope')).toBeNull()
  })
})
