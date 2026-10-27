export type ValueBand = 'banger' | 'favourable' | 'neutral' | 'reduced' | 'no_value'

/** Best to worst; the order the bands are listed in. */
export const VALUE_BANDS: readonly ValueBand[] = [
  'banger',
  'favourable',
  'neutral',
  'reduced',
  'no_value',
]

/** Odd that pays exactly break-even for a given probability. */
export function fairOdd(probability: number): number {
  if (probability <= 0 || probability > 1) throw new RangeError('probability must be in (0, 1]')
  return 1 / probability
}

/** p × odd: above 1 means the odd pays more than your read of the event justifies. */
export function valueIndex(probability: number, odd: number): number {
  return probability * odd
}

/** Band of a value index, judged on the index rounded to 2 decimals (as it is shown). */
export function valueBand(index: number): ValueBand {
  const shown = Math.round(index * 100) / 100
  if (shown > 1.35) return 'banger'
  if (shown >= 1.06) return 'favourable'
  if (shown >= 0.95) return 'neutral'
  if (shown >= 0.85) return 'reduced'
  return 'no_value'
}
