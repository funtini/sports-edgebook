import { definePreset } from '@primeuix/themes'
import Aura from '@primeuix/themes/aura'

/** PrimeVue colours follow the design tokens in `assets/main.css`, so light and dark match. */
const scheme = (accent: string, accentHover: string, onAccent: string) => ({
  primary: {
    color: accent,
    contrastColor: onAccent,
    hoverColor: accentHover,
    activeColor: accentHover,
  },
  highlight: {
    background: 'var(--eb-accent-soft)',
    focusBackground: 'var(--eb-accent-soft)',
    color: 'var(--eb-accent-text)',
    focusColor: 'var(--eb-accent-text)',
  },
  formField: {
    background: 'var(--eb-surface)',
    borderColor: 'var(--eb-border)',
    hoverBorderColor: 'var(--eb-muted)',
    color: 'var(--eb-text)',
    placeholderColor: 'var(--eb-muted)',
    iconColor: 'var(--eb-muted)',
    invalidBorderColor: 'var(--eb-neg)',
  },
  text: { color: 'var(--eb-text)', mutedColor: 'var(--eb-muted)' },
  content: {
    background: 'var(--eb-surface)',
    hoverBackground: 'var(--eb-surface-2)',
    borderColor: 'var(--eb-border)',
  },
  overlay: {
    select: { background: 'var(--eb-surface)', borderColor: 'var(--eb-border)' },
    popover: { background: 'var(--eb-surface)', borderColor: 'var(--eb-border)' },
  },
  list: { option: { focusBackground: 'var(--eb-surface-2)' } },
})

export const EdgebookPreset = definePreset(Aura, {
  semantic: {
    primary: {
      50: '{emerald.50}',
      100: '{emerald.100}',
      200: '{emerald.200}',
      300: '{emerald.300}',
      400: '{emerald.400}',
      500: '{emerald.500}',
      600: '{emerald.600}',
      700: '{emerald.700}',
      800: '{emerald.800}',
      900: '{emerald.900}',
      950: '{emerald.950}',
    },
    formField: { borderRadius: '10px' },
    colorScheme: {
      light: scheme('{emerald.700}', '{emerald.800}', '#ffffff'),
      dark: scheme('{emerald.400}', '{emerald.300}', '#06281c'),
    },
  },
})
