import { describe, expect, it } from 'vitest'
import {
  base64Bytes,
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
