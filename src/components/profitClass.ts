/** Text colour for a profit in units: green above zero, red below, neutral at zero. */
export function profitClass(units: number): string {
  if (units > 0) return 'text-green-700'
  if (units < 0) return 'text-red-700'
  return 'text-surface-600'
}
