/** Default `user_settings.unit_value`; also the fallback before settings load. */
export const DEFAULT_UNIT_VALUE = 10

/** Quick picks offered for the unit value (€). */
export const UNIT_VALUE_PRESETS = [10, 20, 30, 100] as const

/** How money is shown (`user_settings.money_display`); it is always stored in units. */
export const MONEY_DISPLAYS = ['units', 'euros'] as const
export type MoneyDisplay = (typeof MONEY_DISPLAYS)[number]
export const DEFAULT_MONEY_DISPLAY: MoneyDisplay = 'units'

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
  /** Prefix positive amounts with `+` (profit). Off for amounts such as a stake or the bankroll. */
  signed?: boolean
}

function format(value: number, options: FormatOptions): string {
  return (options.signed ? signed : plain).format(value)
}

/** `36` → `+36,00 €` (signed) or `36,00 €`. */
export function formatEuros(amount: number, options: FormatOptions = {}): string {
  return `${format(amount, options)} €`
}

/**
 * One amount in the chosen display: units as a bare number (`+1,80`), euros as units × unit
 * value (`+36,00 €`). Signed by default (profit).
 */
export function formatMoney(
  units: number,
  unitValue: number,
  display: MoneyDisplay,
  options: FormatOptions = { signed: true },
): string {
  return display === 'euros' ? formatEuros(units * unitValue, options) : format(units, options)
}
