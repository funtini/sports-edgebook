import { describe, expect, it } from 'vitest'
import en from '../en'
import ptPT from '../pt-PT'
import { DEFAULT_MARKETS, seedNameKey } from '@/domain/markets'

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

describe('seeded market names', () => {
  it('have a key whose PT-PT text is the stored name', () => {
    const names = new Set(DEFAULT_MARKETS.flatMap((m) => [m.category, m.name]))
    names.delete('1X2')
    for (const name of names) {
      const key = seedNameKey(name)
      expect(key).not.toBeNull()
      const [, slug] = key!.split('.') as [string, keyof typeof ptPT.markets]
      expect(ptPT.markets[slug]).toBe(name)
    }
  })
})
