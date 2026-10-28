import { describe, expect, it } from 'vitest'
import { DEFAULT_MARKETS, seedNameKey, storedMarketName } from '../markets'

const EN: Record<string, string> = {
  'markets.goals': 'Goals',
  'markets.over': 'Over',
  'markets.home': 'Home',
}
const translate = (key: string) => EN[key] ?? key

describe('seedNameKey', () => {
  it('maps every seeded name and category except 1X2', () => {
    const names = DEFAULT_MARKETS.flatMap((m) => [m.category, m.name]).filter((n) => n !== '1X2')
    expect(names.filter((name) => !seedNameKey(name)?.startsWith('markets.'))).toEqual([])
    expect(seedNameKey('Golos')).toBe('markets.goals')
  })

  it('leaves names the user typed alone', () => {
    expect(seedNameKey('Remates')).toBeNull()
    expect(seedNameKey('1X2')).toBeNull()
  })
})

describe('storedMarketName', () => {
  it('maps a translated seed label back to the stored PT-PT name', () => {
    expect(storedMarketName('Goals', translate)).toBe('Golos')
    expect(storedMarketName(' goals ', translate)).toBe('Golos')
    expect(storedMarketName('Over', translate)).toBe('Mais de')
  })

  it('normalises a PT-PT seed typed in another case', () => {
    expect(storedMarketName('golos', translate)).toBe('Golos')
  })

  it('returns anything else as typed', () => {
    expect(storedMarketName('Remates', translate)).toBe('Remates')
    expect(storedMarketName('1X2', translate)).toBe('1X2')
  })
})
