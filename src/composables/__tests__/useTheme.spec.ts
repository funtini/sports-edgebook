import { afterEach, describe, expect, it } from 'vitest'
import { DARK_CLASS, THEME_COLORS, THEME_STORAGE_KEY } from '@/lib/preferences'
import { useTheme } from '../useTheme'

describe('useTheme', () => {
  afterEach(() => {
    localStorage.clear()
    document.documentElement.className = ''
  })

  it('toggles the class and theme-color on <html> and remembers the choice', () => {
    document.head.innerHTML = '<meta name="theme-color" content="">'
    const meta = document.querySelector('meta[name="theme-color"]')
    const { theme, setTheme, toggleTheme } = useTheme()

    setTheme('light')
    toggleTheme()
    expect(theme.value).toBe('dark')
    expect(document.documentElement.classList.contains(DARK_CLASS)).toBe(true)
    expect(meta?.getAttribute('content')).toBe(THEME_COLORS.dark)
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark')

    toggleTheme()
    expect(theme.value).toBe('light')
    expect(document.documentElement.classList.contains(DARK_CLASS)).toBe(false)
    expect(meta?.getAttribute('content')).toBe(THEME_COLORS.light)
    expect(localStorage.getItem(THEME_STORAGE_KEY)).toBe('light')
  })
})
