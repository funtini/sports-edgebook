export interface MarketDefinition {
  category: string
  name: string
}

/** Markets seeded for a new user on first settings load. */
export const DEFAULT_MARKETS: readonly MarketDefinition[] = [
  { category: '1X2', name: 'Casa' },
  { category: '1X2', name: 'Empate' },
  { category: '1X2', name: 'Fora' },
  { category: 'Dupla hipótese', name: 'Dupla hipótese' },
  { category: 'Golos', name: 'Mais de' },
  { category: 'Golos', name: 'Menos de' },
  { category: 'Ambas marcam', name: 'Ambas marcam' },
  { category: 'Cantos', name: 'Mais de' },
  { category: 'Cantos', name: 'Menos de' },
  { category: 'Cartões', name: 'Mais de' },
  { category: 'Cartões', name: 'Menos de' },
  { category: 'Handicap', name: 'Handicap' },
]

/** Translation key (`markets.*`) of each seeded name, so seeds display in the active language. */
const SEED_NAME_KEYS: Record<string, string> = {
  Casa: 'home',
  Empate: 'draw',
  Fora: 'away',
  'Dupla hipótese': 'doubleChance',
  Golos: 'goals',
  'Mais de': 'over',
  'Menos de': 'under',
  'Ambas marcam': 'btts',
  Cantos: 'corners',
  Cartões: 'cards',
  Handicap: 'handicap',
}

/**
 * `markets.*` key for a seeded market name or category, or null for a name the user typed
 * (shown as is). Stored names never change; this is for display only.
 */
export function seedNameKey(name: string): string | null {
  const key = SEED_NAME_KEYS[name]
  return key ? `markets.${key}` : null
}
