import { DEFAULT_LOCALE, numberFormat } from './intl'

/** Default `user_settings.unit_value`; also the fallback before settings load. */
export const DEFAULT_UNIT_VALUE = 10

/** Quick picks offered for the unit value (€). */
export const UNIT_VALUE_PRESETS = [10, 20, 30, 100] as const

/** How money is shown (`user_settings.money_display`); it is always stored in units. */
export const MONEY_DISPLAYS = ['units', 'euros'] as const
export type MoneyDisplay = (typeof MONEY_DISPLAYS)[number]
export const DEFAULT_MONEY_DISPLAY: MoneyDisplay = 'units'

interface FormatOptions {
  /** Prefix positive amounts with `+` (profit). Off for amounts such as a stake or the bankroll. */
  signed?: boolean
}

/** Two decimals, optionally signed, optionally in euros. */
function formatter(locale: string, euros: boolean, signed: boolean): Intl.NumberFormat {
  return numberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    signDisplay: signed ? 'exceptZero' : 'auto',
    ...(euros && { style: 'currency', currency: 'EUR' }),
  })
}

/** `1.8` → `1,80` (PT) or `1.80` (EN): odds and other two-decimal numbers. */
export function formatDecimal(value: number, locale: string = DEFAULT_LOCALE): string {
  return formatter(locale, false, false).format(value)
}

/** `36` → `+36,00 €` (PT) or `+€36.00` (EN) when signed. */
export function formatEuros(
  amount: number,
  options: FormatOptions = {},
  locale: string = DEFAULT_LOCALE,
): string {
  return formatter(locale, true, !!options.signed).format(amount)
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
  locale: string = DEFAULT_LOCALE,
): string {
  return display === 'euros'
    ? formatEuros(units * unitValue, options, locale)
    : formatter(locale, false, !!options.signed).format(units)
}
