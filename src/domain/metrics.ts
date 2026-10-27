import type { BetStatus } from './settlement'

/** won ÷ (won + lost); voids and pending excluded. Null when nothing counts yet. */
export function hitRate(statuses: BetStatus[]): number | null {
  const won = statuses.filter((s) => s === 'won').length
  const lost = statuses.filter((s) => s === 'lost').length
  return won + lost === 0 ? null : won / (won + lost)
}
