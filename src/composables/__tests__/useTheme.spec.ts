import { afterEach, describe, expect, it, vi } from 'vitest'
import { DARK_CLASS, THEME_COLORS, THEME_STORAGE_KEY } from '@/lib/preferences'

/** A fresh `useTheme` module with a fake system preference that the test can switch. */
async function load(stored: string | null, systemDark: boolean) {
  vi.resetModules()
  localStorage.clear()
  if (stored) localStorage.setItem(THEME_STORAGE_KEY, stored)
  const listeners: ((event: { matches: boolean }) => void)[] = []
  vi.stubGlobal('matchMedia', () => ({
    matches: systemDark,
    addEventListener: (_: string, listener: (event: { matches: boolean }) => void) =>
      listeners.push(listener),
  }))
  const module = await import('../useTheme')
  const switchSystem = (dark: boolean) =>
    listeners.forEach((listener) => listener({ matches: dark }))
  return { ...module.useTheme(), switchSystem }
}

const isDark = () => document.documentElement.classList.contains(DARK_CLASS)

describe('useTheme', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
    localStorage.clear()
    document.documentElement.className = ''
  })

  it('toggles the class and theme-color on <html> and remembers the choice', async () => {
    document.head.innerHTML = '<meta name="theme-color" content="">'
    const meta = document.querySelector('meta[name="theme-color"]')
    const { theme, toggleTheme } = await load(null, false)

    toggleTheme()
    expect(theme.value).toBe('dark')
    expect(isDark()).toBe(true)
    expect(meta?.getAttribute('content')).toBe(THEME_COLORS.dark)
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')

    toggleTheme()
    expect(theme.value).toBe('light')
    expect(isDark()).toBe(false)
    expect(meta?.getAttribute('content')).toBe(THEME_COLORS.light)
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
  })

  it('follows a system switch live while the user has not picked a theme', async () => {
    const { theme, switchSystem } = await load(null, false)
    switchSystem(true)
    expect(theme.value).toBe('dark')
    expect(isDark()).toBe(true)
    switchSystem(false)
    expect(theme.value).toBe('light')
  })

  it('keeps the user choice when the system switches', async () => {
    const { theme, setTheme, switchSystem } = await load(null, false)
    setTheme('light')
    switchSystem(true)
    expect(theme.value).toBe('light')
  })

  it('keeps a choice stored in an earlier visit', async () => {
    const { theme, switchSystem } = await load('dark', false)
    switchSystem(false)
    expect(theme.value).toBe('dark')
  })
})
