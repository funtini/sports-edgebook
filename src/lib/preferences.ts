/**
 * Language and theme preferences: per device, kept in `localStorage`. The theme part is mirrored
 * by the inline script in `index.html`, which applies it before the app loads (no flash); keep the
 * storage key and colours in sync with it (a test checks).
 */

export const LOCALES = ['pt-PT', 'en'] as const
export type AppLocale = (typeof LOCALES)[number]
export const DEFAULT_LOCALE: AppLocale = 'pt-PT'

/** Locale handed to `Intl` and PrimeVue: EN uses British dates (27/10/2026) and the euro. */
export const INTL_LOCALES: Record<AppLocale, string> = { 'pt-PT': 'pt-PT', en: 'en-GB' }

export const THEMES = ['light', 'dark'] as const
export type Theme = (typeof THEMES)[number]

/** Class PrimeVue (`darkModeSelector`) and Tailwind's `dark:` variant key off, on `<html>`. */
export const DARK_CLASS = 'app-dark'

/** `<meta name="theme-color">` per theme: the header surface, so the browser chrome blends in. */
export const THEME_COLORS: Record<Theme, string> = { light: '#ffffff', dark: '#151920' }

export const LOCALE_STORAGE_KEY = 'edgebook.locale'
export const THEME_STORAGE_KEY = 'edgebook.theme'

/** `localStorage` can throw (private mode, blocked storage); a failed read is "no choice yet". */
export function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}

export function writeStored(key: string, value: string): void {
  try {
    localStorage.setItem(key, value)
  } catch {
    // Not persisted; the choice still applies until reload.
  }
}

export function isLocale(value: unknown): value is AppLocale {
  return (LOCALES as readonly unknown[]).includes(value)
}

export function isTheme(value: unknown): value is Theme {
  return (THEMES as readonly unknown[]).includes(value)
}

/** The stored choice wins; otherwise an English browser starts in EN and everyone else in PT-PT. */
export function initialLocale(
  stored: string | null,
  browserLanguage: string | undefined,
): AppLocale {
  if (isLocale(stored)) return stored
  return browserLanguage?.toLowerCase().startsWith('en') ? 'en' : DEFAULT_LOCALE
}

/** The stored choice wins; otherwise follow the system's `prefers-color-scheme`. */
export function initialTheme(stored: string | null, prefersDark: boolean): Theme {
  if (isTheme(stored)) return stored
  return prefersDark ? 'dark' : 'light'
}
