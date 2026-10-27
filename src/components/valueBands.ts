import { formatDecimal } from '@/domain/money'
import type { ValueBand } from '@/domain/value'

interface BandStyle {
  /** Label on a prediction row (Hoje, Evento). */
  row: string
  /** Shows the index next to the row label. */
  rowIndex: boolean
  /** Short label on the Registo pill. */
  pill: string
  /** Text colour (row label, big number). */
  text: string
  /** Dot and pill background. */
  fill: string
  /** Value-index card background and border. */
  card: string
}

export const VALUE_BAND_STYLES: Record<ValueBand, BandStyle> = {
  banger: {
    row: 'Banger',
    rowIndex: true,
    pill: 'Banger',
    text: 'text-eb-purple',
    fill: 'bg-eb-purple',
    card: 'bg-eb-purple-soft border-eb-purple',
  },
  favourable: {
    row: 'Favorável',
    rowIndex: true,
    pill: 'Favorável',
    text: 'text-eb-pos',
    fill: 'bg-eb-pos',
    card: 'bg-eb-pos-soft border-eb-pos',
  },
  neutral: {
    row: 'Neutro',
    rowIndex: false,
    pill: 'Neutro',
    text: 'text-eb-muted',
    fill: 'bg-eb-muted',
    card: 'bg-eb-surface border-eb-border',
  },
  reduced: {
    row: 'Valor reduzido',
    rowIndex: true,
    pill: 'Desfavorável',
    text: 'text-eb-amber',
    fill: 'bg-eb-amber',
    card: 'bg-eb-amber-soft border-eb-amber',
  },
  no_value: {
    row: 'Odd sem valor',
    rowIndex: true,
    pill: 'Sem valor',
    text: 'text-eb-neg',
    fill: 'bg-eb-neg',
    card: 'bg-eb-neg-soft border-eb-neg',
  },
}

/** `Favorável (1,20)`, or just `Neutro`. */
export function valueRowLabel(band: ValueBand, index: number): string {
  const style = VALUE_BAND_STYLES[band]
  return style.rowIndex ? `${style.row} (${formatDecimal(index)})` : style.row
}
