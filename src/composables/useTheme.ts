import { readonly, ref } from 'vue'
import {
  DARK_CLASS,
  THEME_COLORS,
  THEME_STORAGE_KEY,
  initialTheme,
  readStored,
  writeStored,
  type Theme,
} from '@/lib/preferences'

function prefersDark(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-color-scheme: dark)').matches
}

/** Puts the theme on `<html>` (PrimeVue and Tailwind `dark:`) and on the browser chrome. */
export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle(DARK_CLASS, theme === 'dark')
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme])
}

// One theme for the whole app. `index.html` already applied it before mount; this mirrors it.
const theme = ref<Theme>(initialTheme(readStored(THEME_STORAGE_KEY), prefersDark()))

/** Light/dark theme: follows the system until the user picks one, which is remembered. */
export function useTheme() {
  function setTheme(next: Theme): void {
    theme.value = next
    applyTheme(next)
    writeStored(THEME_STORAGE_KEY, next)
  }

  function toggleTheme(): void {
    setTheme(theme.value === 'dark' ? 'light' : 'dark')
  }

  return { theme: readonly(theme), setTheme, toggleTheme }
}
