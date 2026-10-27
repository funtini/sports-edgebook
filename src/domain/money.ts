/** Default `user_settings.unit_value`; also the fallback before settings load. */
export const DEFAULT_UNIT_VALUE = 10

/** Quick picks offered for the unit value (€). */
export const UNIT_VALUE_PRESETS = [10, 20, 30, 100] as const

const plain = new Intl.NumberFormat('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const signed = new Intl.NumberFormat('pt-PT', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
  signDisplay: 'exceptZero',
})

/** `1.8` → `1,80`: odds and other two-decimal numbers. */
export function formatDecimal(value: number): string {
  return plain.format(value)
}

interface FormatOptions {
  /** Prefix positive amounts with `+` (profit). Off for balances such as the bankroll. */
  signed?: boolean
}

function format(value: number, options: FormatOptions): string {
  return (options.signed ? signed : plain).format(value)
}

/** `1.8` → `+1,80 u` (signed) or `1,80 u`. */
export function formatUnits(units: number, options: FormatOptions = {}): string {
  return `${format(units, options)} u`
}

/** `36` → `+36,00 €` (signed) or `36,00 €`. */
export function formatEuros(amount: number, options: FormatOptions = {}): string {
  return `${format(amount, options)} €`
}

/** Units and their euro value side by side: `formatMoney(1.8, 20)` → `+1,80 u · +36,00 €`. */
export function formatMoney(
  units: number,
  unitValue: number,
  options: FormatOptions = { signed: true },
): string {
  return `${formatUnits(units, options)} · ${formatEuros(units * unitValue, options)}`
}
