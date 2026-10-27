/** Unicode minus, which some keyboards and copied odds use instead of `-`. */
const MINUS = /^\s*[−-]/

/**
 * Number typed on a phone keyboard: accepts `1,85` or `1.85`, and `-` or `−` for negatives.
 * Blank input is `null`; anything else that is not a number is `NaN`, so validation can reject it.
 */
export function parseDecimal(text: string): number | null {
  const clean = text.trim().replace('−', '-').replace(',', '.')
  if (!clean) return null
  return /^[+-]?(\d+\.?\d*|\.\d+)$/.test(clean) ? Number(clean) : Number.NaN
}

/**
 * Flips the sign of a number as typed (`2,5` ↔ `-2,5`): the iOS decimal keypad has no minus key,
 * and handicap lines are often negative.
 */
export function toggleSign(text: string): string {
  const clean = text.trim()
  return MINUS.test(clean) ? clean.replace(MINUS, '') : `-${clean}`
}
