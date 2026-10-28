import type { ValueBand } from '@/domain/value'

/** Labels are translation keys: `valueBand.row.<band>` (Hoje, Evento) and `valueBand.pill.<band>` (Registo). */
interface BandStyle {
  /** Shows the index next to the row label. */
  rowIndex: boolean
  /** Text colour (row label, big number). */
  text: string
  /** Solid fill (bar marker, Registo pill). */
  fill: string
  /** Prediction row pill background (text in `text`). */
  soft: string
  /** Value-index card background and border. */
  card: string
}

export const VALUE_BAND_STYLES: Record<ValueBand, BandStyle> = {
  banger: {
    rowIndex: true,
    text: 'text-eb-purple',
    fill: 'bg-eb-purple',
    soft: 'bg-eb-purple-soft',
    card: 'bg-eb-purple-soft border-eb-purple',
  },
  favourable: {
    rowIndex: true,
    text: 'text-eb-pos',
    fill: 'bg-eb-pos',
    soft: 'bg-eb-pos-soft',
    card: 'bg-eb-pos-soft border-eb-pos',
  },
  neutral: {
    rowIndex: false,
    text: 'text-eb-muted',
    fill: 'bg-eb-muted',
    soft: 'bg-eb-surface-2',
    card: 'bg-eb-surface border-eb-border',
  },
  reduced: {
    rowIndex: true,
    text: 'text-eb-amber',
    fill: 'bg-eb-amber',
    soft: 'bg-eb-amber-soft',
    card: 'bg-eb-amber-soft border-eb-amber',
  },
  no_value: {
    rowIndex: true,
    text: 'text-eb-neg',
    fill: 'bg-eb-neg',
    soft: 'bg-eb-neg-soft',
    card: 'bg-eb-neg-soft border-eb-neg',
  },
}

/** `Favorável 1,20`, or just `Neutro`: `label` is the translated row label. */
export function valueRowLabel(band: ValueBand, label: string, index: string): string {
  return VALUE_BAND_STYLES[band].rowIndex ? `${label} ${index}` : label
}
