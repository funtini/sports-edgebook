import { describe, expect, it } from 'vitest'
import en from '../en'
import ptPT from '../pt-PT'
import { BET_TYPES, MARKETS, PICKS } from '@/domain/markets'

/** Every leaf key path, e.g. `app.nav.today`. */
function keys(messages: object, prefix = ''): string[] {
  return Object.entries(messages).flatMap(([key, value]) =>
    typeof value === 'object' && value !== null
      ? keys(value, `${prefix}${key}.`)
      : [`${prefix}${key}`],
  )
}

function leaves(messages: object): unknown[] {
  return Object.values(messages).flatMap((value) =>
    typeof value === 'object' && value !== null ? leaves(value) : [value],
  )
}

describe('locale messages', () => {
  it('en has exactly the same keys as pt-PT', () => {
    expect(keys(en).sort()).toEqual(keys(ptPT).sort())
  })

  it.each([
    ['pt-PT', ptPT],
    ['en', en],
  ])('%s has no empty messages', (_, messages) => {
    for (const value of leaves(messages)) {
      expect(typeof value).toBe('string')
      expect(value).not.toBe('')
    }
  })
})

describe('market catalogue', () => {
  it('has a label for every market, bet type and side', () => {
    expect(Object.keys(ptPT.catalogue.market).sort()).toEqual([...MARKETS].sort())
    expect(Object.keys(ptPT.catalogue.betType).sort()).toEqual([...BET_TYPES].sort())
    const picks = new Set(Object.values(PICKS).flat())
    expect(Object.keys(ptPT.catalogue.pick).sort()).toEqual([...picks].sort())
  })
})
