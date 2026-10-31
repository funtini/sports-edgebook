import { describe, expect, it } from 'vitest'
import {
  BET_TYPES_BY_MARKET,
  fromStoredPick,
  isValidSelection,
  lineKind,
  pickSummary,
  stepLine,
  toStoredPick,
} from '../markets'

const PT: Record<string, string> = {
  'catalogue.market.result': 'Resultado',
  'catalogue.market.goals': 'Golos',
  'catalogue.betType.1x2': '1X2',
  'catalogue.betType.total': 'Total',
  'catalogue.betType.handicap': 'Handicap',
  'catalogue.betType.result_total': 'Resultado + Total',
  'catalogue.betType.other': 'Outro',
  'catalogue.pick.home': 'V1',
  'catalogue.pick.x2': 'X2',
}
const translate = (key: string) => PT[key] ?? key
const formatLine = (line: number) => String(line).replace('.', ',')

describe('BET_TYPES_BY_MARKET', () => {
  it('keeps who wins in Resultado and how many goals in Golos', () => {
    expect(BET_TYPES_BY_MARKET.result).toEqual([
      '1x2',
      'double_chance',
      'handicap',
      'result_total',
      'other',
    ])
    expect(BET_TYPES_BY_MARKET.goals).toEqual(['total', 'team_total', 'btts', 'other'])
    expect(BET_TYPES_BY_MARKET.corners).toContain('1x2')
    expect(BET_TYPES_BY_MARKET.corners).toContain('total')
  })
})

describe('lineKind', () => {
  it('has a line only for totals and handicaps', () => {
    expect(lineKind('total')).toBe('total')
    expect(lineKind('team_total')).toBe('total')
    expect(lineKind('result_total')).toBe('total')
    expect(lineKind('handicap')).toBe('handicap')
    expect(lineKind('1x2')).toBeNull()
    expect(lineKind('other')).toBeNull()
  })
})

describe('stepLine', () => {
  it('starts a blank line at 2.5 for totals and ±0.5 for handicaps', () => {
    expect(stepLine('total', null, 1)).toBe(2.5)
    expect(stepLine('total', null, -1)).toBe(2.5)
    expect(stepLine('handicap', null, 1)).toBe(0.5)
    expect(stepLine('handicap', null, -1)).toBe(-0.5)
  })

  it('steps the size of a total and keeps its side, never below 0.5', () => {
    expect(stepLine('total', 2.5, 1)).toBe(3.5)
    expect(stepLine('total', 2.5, -1)).toBe(1.5)
    expect(stepLine('total', -2.5, 1)).toBe(-3.5)
    expect(stepLine('total', -1.5, -1)).toBe(-0.5)
    expect(stepLine('total', 0.5, -1)).toBeNull()
    expect(stepLine('total', -1, -1)).toBeNull()
  })

  it('steps the signed value of a handicap', () => {
    expect(stepLine('handicap', -1.5, 1)).toBe(-0.5)
    expect(stepLine('handicap', -0.5, 1)).toBe(0.5)
    expect(stepLine('handicap', 0.5, -1)).toBe(-0.5)
  })

  it('leaves a line that is not a number alone', () => {
    expect(stepLine('total', Number.NaN, 1)).toBeNull()
  })
})

describe('toStoredPick / fromStoredPick', () => {
  it("turns a total's sign into over / under and back", () => {
    expect(toStoredPick('total', '', 2.5)).toEqual({ selection: 'over', line: 2.5 })
    expect(toStoredPick('total', '', -2.5)).toEqual({ selection: 'under', line: 2.5 })
    expect(toStoredPick('result_total', 'x2', -4.5)).toEqual({ selection: 'x2_under', line: 4.5 })
    expect(fromStoredPick('result_total', { selection: 'x2_under', line: 4.5 })).toEqual({
      pick: 'x2',
      line: -4.5,
    })
    expect(fromStoredPick('total', { selection: 'over', line: 2.5 })).toEqual({
      pick: '',
      line: 2.5,
    })
  })

  it('keeps the side and the signed line of a handicap', () => {
    expect(toStoredPick('handicap', 'home', -1.5)).toEqual({ selection: 'home', line: -1.5 })
  })
})

describe('isValidSelection', () => {
  it('checks the side against the type', () => {
    expect(isValidSelection('1x2', 'draw')).toBe(true)
    expect(isValidSelection('handicap', 'draw')).toBe(false)
    expect(isValidSelection('team_total', 'home_over')).toBe(true)
    expect(isValidSelection('team_total', 'home')).toBe(false)
    expect(isValidSelection('other', 'Benfica marca primeiro')).toBe(true)
  })
})

describe('pickSummary', () => {
  const summary = (bet: Parameters<typeof pickSummary>[0]) =>
    pickSummary(bet, translate, formatLine)

  it('reads Mercado - Tipo - Período - Seleção', () => {
    expect(
      summary({ market: 'result', bet_type: '1x2', period: 'HT', selection: 'home', line: null }),
    ).toBe('Resultado - 1X2 - HT - V1')
    expect(
      summary({ market: 'goals', bet_type: 'total', period: 'FT', selection: 'over', line: 2.5 }),
    ).toBe('Golos - Total - FT - +2,5')
    expect(
      summary({
        market: 'result',
        bet_type: 'handicap',
        period: 'FT',
        selection: 'home',
        line: -1.5,
      }),
    ).toBe('Resultado - Handicap - FT - V1 −1,5')
    expect(
      summary({
        market: 'result',
        bet_type: 'result_total',
        period: 'FT',
        selection: 'x2_under',
        line: 4.5,
      }),
    ).toBe('Resultado - Resultado + Total - FT - X2 −4,5')
  })

  it('shows the typed selection of type Outro as it is', () => {
    expect(
      summary({
        market: 'result',
        bet_type: 'other',
        period: 'FT',
        selection: 'Benfica',
        line: null,
      }),
    ).toBe('Resultado - Outro - FT - Benfica')
  })
})
