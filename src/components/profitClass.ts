/** Text colour for a profit in units: positive above zero, negative below, plain at zero. */
export function profitClass(units: number): string {
  if (units > 0) return 'text-eb-pos'
  if (units < 0) return 'text-eb-neg'
  return 'text-eb-text'
}
