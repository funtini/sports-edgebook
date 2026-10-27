/**
 * Number typed on a phone keyboard: accepts `1,85` or `1.85`.
 * Blank input is `null`; anything else that is not a number is `NaN`, so validation can reject it.
 */
export function parseDecimal(text: string): number | null {
  const clean = text.trim().replace(',', '.')
  if (!clean) return null
  return /^[+-]?(\d+\.?\d*|\.\d+)$/.test(clean) ? Number(clean) : Number.NaN
}
