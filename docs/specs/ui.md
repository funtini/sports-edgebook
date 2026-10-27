# UI

The approved design for the Phase 1 screens. Design canvas (owner only): [Edgebook design](https://claude.ai/artifact/FSQPYVsrXWufBYNVNXj1tD). This file is the reference; don't depend on opening the canvas.

All user-facing text is PT-PT. Mobile-first for logging screens, desktop-first for the dashboard. Touch targets ≥ 44px; no horizontal scroll at 390px.

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

- **Header** (all sizes, 64px, sticky): logo mark + "Edgebook" on the left (links to Hoje); on the right the settings gear (`/definicoes`). The right side leaves room for the language and theme buttons (#20).
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
