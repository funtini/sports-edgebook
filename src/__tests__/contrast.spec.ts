import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

// WCAG AA contrast (4.5:1, normal text) of the token pairs the screens use, in both themes.
const css = readFileSync(resolve(process.cwd(), 'src/assets/main.css'), 'utf8')

function tokens(selector: string): Record<string, string> {
  const start = css.indexOf(`${selector} {`)
  const block = css.slice(start, css.indexOf('}', start))
  return Object.fromEntries(
    [...block.matchAll(/--eb-([\w-]+):\s*(#[0-9a-f]{6})/g)].map((m) => [m[1], m[2]]),
  )
}

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }) as [number, number, number]
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number]
  return (hi + 0.05) / (lo + 0.05)
}

/**
 * [text, background]: body text, badges and boxes (soft fills), pills and buttons (solid fills), P/L.
 * The prediction row value pills are the band colour on its soft fill (neutral: muted on surface-2).
 */
const PAIRS = [
  ['text', 'bg'],
  ['text', 'surface'],
  ['muted', 'surface'],
  ['muted', 'surface-2'],
  ['pos', 'pos-soft'],
  ['neg', 'neg-soft'],
  ['info', 'info-soft'],
  ['purple', 'purple-soft'],
  ['amber', 'amber-soft'],
  ['accent-text', 'accent-soft'],
  ['on-accent', 'accent'],
  ['on-fill', 'pos'],
  ['on-fill', 'neg'],
  ['on-fill', 'muted'],
  ['on-fill', 'purple'],
  ['on-fill', 'amber'],
  ['pos', 'surface'],
  ['neg', 'surface'],
  ['purple', 'surface'],
  ['amber', 'surface'],
] as const

describe.each([
  ['light', ':root'],
  ['dark', '.app-dark'],
])('%s theme contrast', (_, selector) => {
  const theme = tokens(selector)

  it.each(PAIRS)('%s on %s is at least 4.5:1', (text, background) => {
    expect(contrast(theme[text]!, theme[background]!)).toBeGreaterThanOrEqual(4.5)
  })
})
