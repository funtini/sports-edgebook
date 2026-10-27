# UI

The approved design for the Phase 1 screens. Design canvas (owner only): [Edgebook design](https://claude.ai/artifact/FSQPYVsrXWufBYNVNXj1tD). This file is the reference; don't depend on opening the canvas.

All user-facing text goes through vue-i18n, PT-PT by default (see [Languages](#languages)). Mobile-first for logging screens, desktop-first for the dashboard. Touch targets ≥ 44px; no horizontal scroll at 390px.

## Design tokens

CSS variables in `src/assets/main.css`: light on `:root`, dark under `.app-dark` (the class PrimeVue already uses for its dark scheme). Tailwind exposes them as `eb-*` colours (`bg-eb-surface`, `text-eb-muted`, `border-eb-border`, `bg-eb-pos-soft`...). Views use only these, never fixed palette shades (`bg-surface-0`, `text-green-700`), so setting `class="app-dark"` on `<html>` renders every screen in dark with no `dark:` variants.

| Token | Light | Dark | Use |
| --- | --- | --- | --- |
| `bg` | #f5f6f8 | #0d1015 | page |
| `surface` | #ffffff | #151920 | cards, header, tab bar |
| `surface-2` | #eef0f3 | #1e232c | chips, neutral boxes |
| `border` | #e1e4e9 | #2a313c | |
| `text` | #12151a | #e9ecf0 | |
| `muted` | #5a6370 | #9aa4b1 | secondary text, neutral |
| `accent` / `on-accent` | #047857 / #ffffff | #34d399 / #06281c | primary buttons, active nav |
| `accent-soft` / `accent-text` | #e3f4ec / #065f46 | #123326 / #6ee7b7 | "Mesmo jogo" chip, active links |
| `pos` / `pos-soft` | #047857 / #e6f4ed | #34d399 / #10261d | profit, Ganho, Favorável |
| `neg` / `neg-soft` | #c0262d / #fcebec | #f87171 / #2a1416 | loss, Perdido, Sem valor |
| `info` / `info-soft` | #1d4fb8 / #e8f0fd | #8fbcff / #16243b | amount staked |
| `purple` / `purple-soft` | #6d28d9 / #f1ebfd | #c4b5fd / #221a38 | Banger |
| `amber` / `amber-soft` | #9a5800 / #fbf0dc | #f0b44c / #2b2111 | Valor reduzido, pending banner |
| `on-fill` | #ffffff | #0d1015 | text on a filled pos / neg / muted button or pill |

PrimeVue components follow the same tokens through the preset in `src/theme.ts` (Aura with emerald primary; form fields, overlays and text mapped to the `--eb-*` variables).

Type: Inter 400/500/600/700, `tabular-nums` on numbers. Radius: 16px cards, 10–12px buttons and inputs, pills fully rounded. Icons: stroke SVGs in `src/components/AppIcon.vue`.

## Header and navigation

- **Header** (all sizes, 64px, sticky): logo mark + "Edgebook" on the left (links to Hoje); on the right, three 44px buttons: language (flag of the active language), theme (moon in light, sun in dark) and the settings gear (`/definicoes`). Language and theme also show before sign-in; the gear only after. Fits on one line at 390px.
- **Phone (< 640px)**: bottom tab bar with Hoje, Registo, Múltiplas, Dashboard (icon + 11px label, active in `accent-text`). The header holds no nav links.
- **Desktop (≥ 640px)**: the same links in the header; the tab bar is hidden.

Code: `src/App.vue`.

## Prediction row

Shared by Hoje and Evento (`src/components/PredictionRow.vue`). Top to bottom:

1. Market (12px, muted) and selection with its line (15px semibold) on the left; odd (18px bold) on the right.
2. Two half-width boxes:
   - **Apostado** + amount in the info colours (`info-soft` / `info`), pending rows included. Non-punter rows: "Sem aposta" + "—" on `surface-2` / `muted`.
   - Result: pending "Por resolver" + "—" (`surface-2` / `muted`); won "Lucro" (`pos-soft` / `pos`); lost "Prejuízo" (`neg-soft` / `neg`); void "Nulo" (`surface-2` / `muted`). Non-punter results use the same colours plus a small muted "virtual" tag (1 virtual unit).
3. Confidence chip ("3 · Boa") and the value label: dot + text in the band colour ("Favorável (1,20)", see [domain.md](domain.md#value-index)).
4. Ganho / Perdido / Nulo: 3 equal columns, 44px; the active one is filled (`pos` / `neg` / `muted`); tapping it again returns the row to pending.

Amounts follow the money display setting (units or euros, see [domain.md](domain.md#units-and-money)).

## Screens

- **Hoje**: day switcher (‹ [calendar] Hoje · ter, 27 out ›, the middle opens a date picker), summary card, amber "pendentes de dias anteriores" banner, games grouped under a header (time chip, "Casa – Fora", league, chevron to the event) above a card of rows.
- **Evento**: "‹ Hoje", game card (league, date · time, teams with the score in the middle, Resultado inputs + "Guardar resultado"), "Prognósticos" list, dashed "+ Registar prognóstico", "Análise do jogo · Em breve" placeholder.
- **Registo**: the logging form restyled with the tokens; value-index card in the band's colours; stake in the info colour.
- **Definições**, **Login**, **404**: cards on `surface` with the same type scale.

## Languages

- **PT-PT** is the default and the source of truth; **EN** is the second language. The first visit starts in EN when `navigator.language` starts with `en`, otherwise PT-PT. The header toggle switches live (no reload); the choice is kept per device in `localStorage` (`edgebook.locale`) and set on `<html lang>`.
- **Strings**: every UI string is a key in `src/locales/pt-PT.ts`; `src/locales/en.ts` is typed from it and a test checks both have the same keys. Group keys by screen or component (`today.*`, `event.*`, `logging.*`, `settings.*`, `predictionRow.*`...), shared ones under `common.*`. Components use `useLocale()` (`src/composables/useLocale.ts`) for `t`, the `Intl` locale and the helpers below.
- **Errors**: Zod issue messages in `src/domain/schemas.ts`, `UserError` messages and `userMessage` fallbacks are keys (`validation.*`, `errors.*`, `<screen>.loadFailed`...). Views keep the key and show it with `message()`, which translates keys and shows any other text (e.g. a Supabase auth error) as is.
- **Numbers and dates** follow the language: `src/domain` formatters take the locale as a parameter (default `pt-PT`); EN uses `en-GB` for `Intl` (27/10/2026, `+€36.20`). PrimeVue day/month names and button labels follow too (`src/i18n/primevue.ts`).
- **User data is never translated**: league, team and market names typed by the user, selections, bookmakers and notes show as stored. Two display-only exceptions with stored values unchanged: confidence labels (`confidence.1`–`5`) and the seeded market names and categories (`markets.*`, mapped in `seedNameKey`). On Registo the market autocomplete shows seeded names in the active language, and what is typed or picked is mapped back to the stored PT-PT name before saving (`storedMarketName`), so typing "Goals" in EN uses the seeded "Golos" instead of creating a duplicate.

## Theme

- Light and dark. Default follows `prefers-color-scheme`, live (an OS switch applies without a reload); the header toggle's choice is kept per device in `localStorage` (`edgebook.theme`) and wins from then on.
- The theme button uses the `moon` / `sun` stroke icons in `AppIcon.vue` rather than `pi pi-moon` / `pi pi-sun`: primeicons is not installed and every other icon is an inline SVG there.
- The class `app-dark` on `<html>` switches the `--eb-*` tokens, PrimeVue's dark scheme and Tailwind's `dark:` variant (`@custom-variant dark` in `main.css`; views shouldn't need it).
- An inline script in `index.html` applies the theme before the app loads, so there is no flash of the wrong one; `src/lib/preferences.ts` mirrors it and a test runs the script to keep them in sync.
- `<meta name="theme-color">` follows the theme with the header surface: `#ffffff` light, `#151920` dark.
- Contrast: every text/background token pair the screens use (body, muted, badges and boxes on soft fills, pills and buttons on solid fills, P/L) is at least 4.5:1 (WCAG AA) in both themes; `src/__tests__/contrast.spec.ts` checks it from `main.css`.
