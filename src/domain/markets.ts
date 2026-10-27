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
