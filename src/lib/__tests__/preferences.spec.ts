import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  DARK_CLASS,
  THEME_COLORS,
  THEME_STORAGE_KEY,
  initialLocale,
  initialTheme,
  readStored,
  writeStored,
} from '../preferences'

describe('initialLocale', () => {
  it('keeps a stored choice', () => {
    expect(initialLocale('en', 'pt-PT')).toBe('en')
    expect(initialLocale('pt-PT', 'en-US')).toBe('pt-PT')
  })

  it('starts English browsers in EN and everyone else in PT-PT', () => {
    expect(initialLocale(null, 'en-GB')).toBe('en')
    expect(initialLocale(null, 'EN')).toBe('en')
    expect(initialLocale(null, 'pt-BR')).toBe('pt-PT')
    expect(initialLocale(null, 'fr')).toBe('pt-PT')
    expect(initialLocale(null, undefined)).toBe('pt-PT')
  })

  it('ignores an unknown stored value', () => {
    expect(initialLocale('de', 'fr')).toBe('pt-PT')
  })
})

describe('initialTheme', () => {
  it('keeps a stored choice over the system preference', () => {
    expect(initialTheme('light', true)).toBe('light')
    expect(initialTheme('dark', false)).toBe('dark')
  })

  it('follows the system preference otherwise', () => {
    expect(initialTheme(null, true)).toBe('dark')
    expect(initialTheme('sepia', false)).toBe('light')
  })
})

describe('storage', () => {
  afterEach(() => {
    vi.restoreAllMocks()
    localStorage.clear()
  })

  it('reads back what it wrote', () => {
    writeStored('k', 'v')
    expect(readStored('k')).toBe('v')
  })

  it('treats a throwing localStorage as no choice', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('blocked')
    })
    expect(() => writeStored('k', 'v')).not.toThrow()
    expect(readStored('k')).toBeNull()
  })
})

describe('index.html theme script', () => {
  const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8')
  const script = /<script>([\s\S]*?)<\/script>/.exec(html)?.[1] ?? ''

  function run(stored: string | null, prefersDark: boolean) {
    document.documentElement.className = ''
    document.head.innerHTML = '<meta name="theme-color" content="">'
    localStorage.clear()
    if (stored) localStorage.setItem(THEME_STORAGE_KEY, stored)
    vi.stubGlobal('matchMedia', () => ({ matches: prefersDark }))
    new Function(script)()
    vi.unstubAllGlobals()
    return {
      dark: document.documentElement.classList.contains(DARK_CLASS),
      color: document.querySelector('meta[name="theme-color"]')?.getAttribute('content'),
    }
  }

  it('applies the stored theme before the app loads', () => {
    expect(run('dark', false)).toEqual({ dark: true, color: THEME_COLORS.dark })
    expect(run('light', true)).toEqual({ dark: false, color: THEME_COLORS.light })
  })

  it('follows the system preference when nothing is stored', () => {
    expect(run(null, true)).toEqual({ dark: true, color: THEME_COLORS.dark })
    expect(run(null, false)).toEqual({ dark: false, color: THEME_COLORS.light })
  })
})
