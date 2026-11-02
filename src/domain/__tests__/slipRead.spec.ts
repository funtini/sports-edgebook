import { describe, expect, it } from 'vitest'
import {
  base64Bytes,
  checkLeg,
  fixEventNameMarket,
  flagCatalogueIssues,
  parseSlipRead,
  slipReadJsonSchema,
  type SlipLeg,
} from '../slipRead'
// Sample answers in the shape the model gives them: plain JSON, and JSON in a code fence.
import SINGLE from './fixtures/slip-single.txt?raw'
import MULTIPLE from './fixtures/slip-multiple.txt?raw'

const leg: SlipLeg = {
  rawText: 'Benfica - Porto · 1X2: 1',
  homeTeam: 'Benfica',
  awayTeam: 'Porto',
  league: null,
  kickoffAt: '2026-11-01T20:30:00+00:00',
  timing: 'pre',
  market: 'result',
  betType: '1x2',
  period: 'FT',
  selection: 'home',
  line: null,
  odd: 2.05,
  status: 'pending',
  unsure: [],
}

describe('parseSlipRead', () => {
  it('reads a single', () => {
    const slip = parseSlipRead(SINGLE)
    expect(slip).toMatchObject({ kind: 'single', bookmaker: 'Betano', stake: 10, totalOdd: 1.85 })
    expect(slip?.legs).toHaveLength(1)
    expect(slip?.legs[0]).toMatchObject({
      homeTeam: 'SL Benfica',
      market: 'goals',
      betType: 'btts',
      selection: 'yes',
      unsure: [],
    })
  })

  it('reads a multiple in a code fence, keeping slip order and the unsure fields', () => {
    const slip = parseSlipRead(MULTIPLE)
    expect(slip?.kind).toBe('multiple')
    expect(slip?.status).toBe('won')
    expect(slip?.legs.map((l) => `${l.market} ${l.betType} ${l.period} ${l.selection}`)).toEqual([
      'corners 1x2 HT home',
      'goals total FT over',
      'result handicap FT home',
    ])
    expect(slip?.legs[1]?.unsure).toEqual(['league'])
    // No date on the slip: the date is unsure too.
    expect(slip?.legs[2]?.unsure).toEqual(['kickoffAt', 'betType', 'line'])
  })

  it('fails on text that is not JSON', () => {
    expect(parseSlipRead('I cannot read this image.')).toBeNull()
    expect(parseSlipRead(SINGLE.slice(0, 200))).toBeNull()
  })

  it('fails, never in part, when a field is missing or off the catalogue', () => {
    const slip = JSON.parse(SINGLE)
    const withoutOdd = { ...slip, legs: [{ ...slip.legs[0], odd: undefined }] }
    expect(parseSlipRead(JSON.stringify(withoutOdd))).toBeNull()
    const unknownMarket = { ...slip, legs: [{ ...slip.legs[0], market: 'shots' }] }
    expect(parseSlipRead(JSON.stringify(unknownMarket))).toBeNull()
    const unknownUnsure = { ...slip, legs: [{ ...slip.legs[0], unsure: ['colour'] }] }
    expect(parseSlipRead(JSON.stringify(unknownUnsure))).toBeNull()
  })

  it('fails when the legs do not fit the kind', () => {
    const single = JSON.parse(SINGLE)
    expect(parseSlipRead(JSON.stringify({ ...single, legs: [] }))).toBeNull()
    const twoLegs = { ...single, legs: [single.legs[0], single.legs[0]] }
    expect(parseSlipRead(JSON.stringify(twoLegs))).toBeNull()
    expect(parseSlipRead(JSON.stringify({ ...twoLegs, kind: 'multiple' }))?.legs).toHaveLength(2)
    expect(parseSlipRead(JSON.stringify({ ...single, kind: 'multiple' }))).toBeNull()
  })
})

describe('flagCatalogueIssues', () => {
  it('leaves a leg that follows the catalogue as it is', () => {
    expect(flagCatalogueIssues(leg)).toEqual(leg)
  })

  it('marks a type the market does not have', () => {
    expect(flagCatalogueIssues({ ...leg, market: 'goals' }).unsure).toEqual(['betType'])
  })

  it('marks a selection the type does not allow', () => {
    expect(flagCatalogueIssues({ ...leg, selection: 'over' }).unsure).toEqual(['selection'])
  })

  it('marks a missing, off-step, signed-total or unexpected line', () => {
    const total = { ...leg, market: 'goals', betType: 'total', selection: 'over' } as const
    expect(flagCatalogueIssues({ ...total, line: 2.5 }).unsure).toEqual([])
    expect(flagCatalogueIssues({ ...total, line: null }).unsure).toEqual(['line'])
    expect(flagCatalogueIssues({ ...total, line: 2.25 }).unsure).toEqual(['line'])
    expect(flagCatalogueIssues({ ...total, line: -2.5 }).unsure).toEqual(['line'])
    expect(flagCatalogueIssues({ ...leg, line: 1 }).unsure).toEqual(['line'])
  })

  it('marks an odd of 1 or less and a kickoff that is not a date', () => {
    expect(flagCatalogueIssues({ ...leg, odd: 1 }).unsure).toEqual(['odd'])
    expect(flagCatalogueIssues({ ...leg, kickoffAt: 'sábado' }).unsure).toEqual(['kickoffAt'])
  })

  it('keeps what the model was unsure about, once, in field order', () => {
    const unsure = flagCatalogueIssues({ ...leg, odd: 0.9, unsure: ['odd', 'homeTeam'] }).unsure
    expect(unsure).toEqual(['homeTeam', 'odd'])
  })

  it('does not judge fields the model left empty', () => {
    const blank = { ...leg, market: null, betType: null, selection: null }
    expect(flagCatalogueIssues(blank).unsure).toEqual([])
  })
})

describe('slipReadJsonSchema', () => {
  /** Every object node in a JSON Schema. */
  function objects(node: unknown): Record<string, unknown>[] {
    if (!node || typeof node !== 'object') return []
    const children = Object.values(node).flatMap(objects)
    const self = (node as Record<string, unknown>).type === 'object' ? [node] : []
    return [...(self as Record<string, unknown>[]), ...children]
  }

  it('closes every object and requires every field, as structured outputs need', () => {
    const schema = slipReadJsonSchema()
    expect(schema.$schema).toBeUndefined()
    const nodes = objects(schema)
    expect(nodes.length).toBe(2)
    for (const node of nodes) {
      expect(node.additionalProperties).toBe(false)
      expect(node.required).toEqual(Object.keys(node.properties as object))
    }
  })

  it('uses no keyword structured outputs reject', () => {
    const text = JSON.stringify(slipReadJsonSchema())
    for (const keyword of ['minimum', 'maximum', 'minLength', 'maxLength', 'minItems', 'pattern']) {
      expect(text).not.toContain(`"${keyword}"`)
    }
  })
})

describe('base64Bytes', () => {
  it('counts the bytes behind the padding', () => {
    expect(base64Bytes(btoa('a'))).toBe(1)
    expect(base64Bytes(btoa('ab'))).toBe(2)
    expect(base64Bytes(btoa('abc'))).toBe(3)
    expect(base64Bytes(btoa('abcd'))).toBe(4)
  })
})

describe('fixEventNameMarket', () => {
  // The slip from the report: "Cantos Marítimo - Cantos Santa Clara 1.ª parte", "Total 2 acima de (1.5)".
  const cantos: SlipLeg = {
    ...leg,
    rawText:
      'Cantos Marítimo - Cantos Santa Clara 1.ª parte · Total 2: Total individual 2 acima de (1.5)',
    homeTeam: 'Cantos Marítimo',
    awayTeam: 'Cantos Santa Clara 1.ª parte',
    market: 'goals',
    betType: 'team_total',
    period: 'FT',
    selection: 'away_over',
    line: 1.5,
  }

  it('takes the market words off the teams and sets corners and the first half', () => {
    expect(fixEventNameMarket(cantos)).toMatchObject({
      homeTeam: 'Marítimo',
      awayTeam: 'Santa Clara',
      market: 'corners',
      period: 'HT',
      unsure: ['market', 'period'],
    })
  })

  it('sets the market from the slip’s words when the model already cleaned the names', () => {
    const cleaned = {
      ...cantos,
      homeTeam: 'Marítimo',
      awayTeam: 'Santa Clara',
      period: 'HT' as const,
    }
    expect(fixEventNameMarket(cleaned)).toMatchObject({
      homeTeam: 'Marítimo',
      awayTeam: 'Santa Clara',
      market: 'corners',
      unsure: ['market'],
    })
  })

  it('knows cards and yellow cards in English and Portuguese, and the second half', () => {
    expect(
      fixEventNameMarket({
        ...leg,
        homeTeam: 'Cartões amarelos Benfica',
        awayTeam: 'Cartões amarelos Porto 2.ª parte',
      }),
    ).toMatchObject({
      homeTeam: 'Benfica',
      awayTeam: 'Porto',
      market: 'yellow_cards',
      period: '2P',
    })
    expect(
      fixEventNameMarket({
        ...leg,
        homeTeam: 'Corners Chelsea',
        awayTeam: 'Corners Manchester United 1st half',
      }),
    ).toMatchObject({
      homeTeam: 'Chelsea',
      awayTeam: 'Manchester United',
      market: 'corners',
      period: 'HT',
    })
  })

  it('flags a type the new market does not have', () => {
    const btts = { ...cantos, betType: 'btts' as const, selection: 'yes', line: null }
    expect(fixEventNameMarket(btts).unsure).toContain('betType')
  })

  it('leaves an ordinary leg as it is', () => {
    expect(fixEventNameMarket(leg)).toEqual(leg)
    expect(
      fixEventNameMarket({ ...leg, homeTeam: 'Sporting CP', awayTeam: 'Rio Ave' }),
    ).toMatchObject({
      homeTeam: 'Sporting CP',
      awayTeam: 'Rio Ave',
      market: 'result',
      period: 'FT',
    })
  })

  it('runs before the catalogue check in checkLeg', () => {
    expect(checkLeg(cantos)).toMatchObject({
      market: 'corners',
      period: 'HT',
      unsure: ['market', 'period'],
    })
  })
})
