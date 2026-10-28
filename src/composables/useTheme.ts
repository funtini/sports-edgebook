import { readonly, ref } from 'vue'
import {
  DARK_CLASS,
  THEME_COLORS,
  THEME_STORAGE_KEY,
  initialTheme,
  isTheme,
  readStored,
  writeStored,
  type Theme,
} from '@/lib/preferences'

const DARK_QUERY = '(prefers-color-scheme: dark)'

/** Puts the theme on `<html>` (PrimeVue and Tailwind `dark:`) and on the browser chrome. */
export function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle(DARK_CLASS, theme === 'dark')
  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLORS[theme])
}

// One theme for the whole app. `index.html` already applied it before mount; this mirrors it.
const system = typeof matchMedia === 'function' ? matchMedia(DARK_QUERY) : null
/** Whether the user picked a theme on this device; until then the theme follows the system. */
let chosen = isTheme(readStored(THEME_STORAGE_KEY))
const theme = ref<Theme>(initialTheme(readStored(THEME_STORAGE_KEY), system?.matches ?? false))

// Follows a system light/dark switch live, without a reload, until the user picks a theme.
system?.addEventListener?.('change', (event) => {
  if (chosen) return
  theme.value = event.matches ? 'dark' : 'light'
  applyTheme(theme.value)
})

/** Light/dark theme: follows the system until the user picks one, which is remembered. */
export function useTheme() {
  function setTheme(next: Theme): void {
    chosen = true
    theme.value = next
    applyTheme(next)
    writeStored(THEME_STORAGE_KEY, next)
  }

  function toggleTheme(): void {
    setTheme(theme.value === 'dark' ? 'light' : 'dark')
  }

  return { theme: readonly(theme), setTheme, toggleTheme }
}
