# UI

The approved design for every screen up to Phase 3 (Hoje, Registo, Evento, Definições, Múltiplas, Dashboard), on phone and desktop. Design canvas (owner only): [Edgebook design](https://claude.ai/artifact/FSQPYVsrXWufBYNVNXj1tD). This file is the reference; don't depend on opening the canvas.

All user-facing text goes through vue-i18n, PT-PT by default (see [Languages](#languages)). Mobile-first for logging screens, desktop-first for the dashboard. Touch targets ≥ 44px; no horizontal scroll at 390px.

**Layouts**: phone layout below 1024px; from 1024px (`lg`) Hoje, Registo, Evento, Múltiplas and Definições switch to the desktop layouts described under [Screens](#screens), in a centred column of at most 1200px (1100px for Registo and Definições) with 24px side padding. Between 640px and 1023px the phone layout is used with the header links instead of the tab bar.

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
3. **Confidence badge** and **value pill**, side by side:
   - Badge (`src/components/ConfidenceBadge.vue`, shared with Definições): 21px circle, 1.5px `text` border, the level number (11px bold) inside. No label on screen; the label is its tooltip and accessible name ("Confiança 4 de 5 · Alta").
   - Pill: fully rounded, 12px bold, text in the band colour on the band's soft fill (`purple-soft`, `pos-soft`, `surface-2` for neutral, `amber-soft`, `neg-soft`). Text is the row label with the index and no brackets: "Banger 1,42", "Favorável 1,20", "Neutro", "Valor reduzido 0,90", "Odd sem valor 0,77" (see [domain.md](domain.md#value-index)). Tooltip: "Índice de valor (probabilidade × odd)".
4. Ganho / Perdido / Nulo: 3 equal columns, 44px; the active one is filled (`pos` / `neg` / `muted`); tapping it again returns the row to pending.

Amounts follow the money display setting (units or euros, see [domain.md](domain.md#units-and-money)).

With `layout="line"` the row keeps this stacked layout below 1024px and becomes the one-line grid of Hoje desktop from `lg` (columns `1fr · 76px · 176px · 120px · 120px · 204px`, the outcome buttons 3 × ≥ 64px wide, 44px tall).

## Screens

### Hoje

- **Phone**: day switcher (‹ [calendar] Hoje · ter, 27 out ›, the middle opens a date picker), summary card, amber "pendentes de dias anteriores" banner, games grouped under a header (time chip, "Casa – Fora", league, chevron to the event) above a card of rows.
- **Desktop**, one column, top to bottom:
  1. Day switcher centred (date button at least 260px wide).
  2. **Resumo do dia** strip (one card): "Lucro punter" big on the left (34px, `pos` / `neg`) with "N de M liquidados" under it, a vertical rule, then five tiles on `surface-2`: **Apostado** (value in `info`), **Prognósticos**, **Ganhos** (`pos` when above 0), **Taxa de acerto**, **Em aberto** (`amber` when above 0). Tile backgrounds stay neutral; only the numbers carry colour.
  3. The amber pending banner, full width.
  4. "Prognósticos" title with the **Novo prognóstico** button on its right (primary, with a `N` key hint; pressing N anywhere on Hoje opens `/registo` unless focus is in a field).
  5. Games: header line as on phone (with "Ver jogo ›"), then a card whose rows are one grid line each: Prognóstico (market + selection) · Odd (76px column, right-aligned, 18px gap before the next column) · confidence badge + value pill · Apostado box · Resultado box · Ganho / Perdido / Nulo. No column header row.

### Evento

- **Phone**: "‹ Hoje", game card (league, date · time, teams with the score in the middle, Resultado inputs + "Guardar resultado"), "Prognósticos" list, dashed "+ Novo prognóstico", "Análise do jogo · Em breve" placeholder.
- **Desktop**: "‹ Hoje", then two columns: left (max 380px) the game card and the analysis placeholder; right the "Prognósticos" title with count, the dashed "+ Novo prognóstico" button on its right, and the rows in the same one-line grid as Hoje desktop.

### Registo

- **Phone**: the logging form restyled with the tokens; value-index card in the band's colours; stake in the info colour.
- **Desktop**: title "Novo prognóstico", two columns: left card with the game (or "Mesmo jogo" chip), Mercado / Tipo / Linha / Odd in one row of four, Aposta, Confiança (five buttons) and "Adicionar notas"; right column (max 380px) with the value-index card, the punter card and "Guardar prognóstico" with the hint "Enter para guardar · o jogo fica selecionado".

### Múltiplas

Two tabs: **Criar** and **Guardadas**. Behaviour of the generator itself: [multiples-generator.md](multiples-generator.md).

- **The multiple (slip)** starts empty: "Múltipla vazia · Adiciona prognósticos à mão, gera-os, ou as duas coisas." Header: title ("Múltipla · 5 prognósticos") and a summary line ("2 manuais · 3 gerados · 2 fixados · Melhor valor"); **Gerar outra (n)** on the right while there are unpinned legs.
- **Leg row**: time · game (and league on desktop), an origin chip (**Manual** in `info` colours, **Gerado** on `surface-2`), market + selection, odd, confidence badge + value pill, and three 44px icon buttons: **fixar** (padlock, `aria-pressed`; pinned = `accent-soft` fill, `accent` border, closed padlock), **trocar** and **remover**. A pinned row has a 3px `accent` left border. Legs added by the generator or by "Gerar outra" get an `accent-soft` background until the next change, so the eye lands on them.
- **Totals** (once there is a leg): Odd total, Probabilidade, Valor esperado (signed colour); "Fora da tolerância" amber note for Odd alvo; Valor apostado stepper (info colour), "Lucro se ganhar", "Limpar tudo", and **Guardar simulada** / **Apostar**, disabled with "Junta pelo menos 2 prognósticos para guardar." below 2 legs.
- **Adding by hand**: the predictions list of the generator's window (search field "Procurar jogo ou mercado"; rows with time · game, market · selection, value dot + label, odd and a 44px "+"). A prediction already in the multiple shows "Na múltipla"; another prediction of a game already used shows "Jogo já na múltipla"; both are dimmed. Hand-added legs come in pinned.
- **Gerador**: Jogos (2×2: Hoje, Amanhã, 3 dias, **Personalizado**, each with its prediction count; Personalizado shows "De" / "Até" date inputs, today to today + 13, at most 14 days, and "N prognósticos em D dias"), Modo (six cards in 2 columns), "Prognósticos a gerar" stepper (1–6) or, for Odd alvo, the target stepper and tolerance chips (±5 / 10 / 20%), Filtros, and the button "+ Acrescentar N prognósticos" (Odd alvo: "Completar até odd X"). Text: "Acrescenta prognósticos aos que já tens. "Gerar outra" usa estes jogos e este modo."
- **Phone layout**: the slip card holds two half-width buttons at its top, **Adicionar** and **Gerador**; each opens its panel inside the card under them (one at a time, the open one filled `accent`). The predictions list scrolls inside the panel (max 328px). Generating closes the Gerador panel.
- **Desktop layout**: two columns. Left (max 400px): the **Gerador** card, then the **Lista de prognósticos** card ("Prognósticos · hoje · entram já fixados", search, list scrolling at 394px ≈ 6 rows). Right: the slip. The Gerador card is collapsible and **starts minimized**: a header with the spark icon, "Gerador", a one-line summary ("Melhor valor · hoje · 3 prognósticos") and a 44px chevron button (`aria-expanded`); generating minimizes it again.
- **Guardadas**: filter chips Todas / Apostadas / Simuladas; cards with date · "N prognósticos", a chip with the origin and mode ("Manual", "Odd alvo", "Mista · Mais confiança"), a void note ("1 nula · odd 2,26"), total odd, the Apostado / result boxes as in the prediction row, and the legs with a status dot (✓ / ✕ / – / •). Phone: legs behind "Ver prognósticos"; desktop: a card grid (`auto-fill minmax(340px, 1fr)`) with legs always visible. Each card has **Reutilizar** (copy icon + text, 44px): opens Criar with those legs, all pinned, keeping each leg's origin, and an `info-soft` note "Cópia da múltipla de <data>. Vem toda fixada: desfixa o que queres gerar de novo." with a close button. Legs whose game has already started are left out and the note says how many.

### Definições

- **Phone**: one column of cards: the settings form (Mostrar valores em, Valor da unidade, Banca inicial, save), Aparência, Níveis de confiança, Conta.
- **Desktop**: two columns: the form on the left; Aparência, Níveis de confiança and Conta on the right (max 420px).
- **Mostrar valores em**: segmented Unidades | Euros, with "Tudo é registado em unidades. Em euros, cada valor é unidades × valor da unidade. O Dashboard tem o seu próprio botão para trocar."
- **Valor da unidade**: preset buttons 10 / 20 / 30 / 100 €, "Outro valor" field, "Exemplo: 1,8 unidades = 36 €".
- **Banca inicial**: in units, with its value in euros under it.
- **Save**: one full-width primary button, "Sem alterações" and dimmed until something changes, then "Guardar alterações"; after saving, a `pos-soft` "Definições guardadas." line.
- **Aparência**: Idioma (Português | English) and Tema (Claro | Escuro), segmented, applied at once and kept per device like the header toggles ("Também os trocas no cabeçalho, em qualquer ecrã.").
- **Níveis de confiança**: read-only table with the confidence badge + label, probability and fair odd; "A edição chega com a calibração (Fase 4)."
- **Conta**: email and "Terminar sessão" (outlined).
- The header gear is shown active (`accent-soft` / `accent-text`) on this screen; no tab is active on phone.

### Dashboard

Desktop-first; usable at 390px with no page-level horizontal scroll. Metrics and definitions: [metrics.md](metrics.md). No metric maths in the view: every number comes from `src/domain/metrics.ts`.

- **Top bar**: "Dashboard" and a subtitle with the period's dates and the number of settled bets ("1/10/2026 – 28/10/2026 · 32 apostas liquidadas"; Tudo: "Desde <data>"). Three segmented controls, on the right on desktop and stacked full width on phone: period **Semana / Mês / Ano / Tudo** (default Mês), scope **Punter / Todos / Múltiplas** (default Punter), **Unidades / €** (starts from `money_display`, not saved).
- **KPI cards** (grid `auto-fit minmax(220px, 1fr)`, 2 columns on phone): **Lucro** (+ "29,50 unidades apostadas"), **Yield** ("Lucro ÷ apostado"), **Taxa de acerto** ("18 de 30 · nulos excluídos"), **Edge** in percentage points ("+10,8 pp", "break-even 49,2%"). Percentages with one decimal; signed values in `pos` / `neg`; a metric with nothing to measure shows "—".
- **Lucro acumulado**: ECharts line chart (`src/components/ProfitChart.vue`), one point per day of the period. The singles line follows the scope (Punter, or Todos) in `accent`; Múltiplas in `info`; dashed zero line; y axis and tooltip in units or € per the toggle. Colours are read from the `--eb-*` tokens and read again when the theme switches.
- **Punter vs múltiplas**: beside the chart on desktop, under it on phone (two columns). For each: count, P/L, yield, hit rate, and "Menos de 30 apostas: lê com cautela." when n < 30.
- **Desempenho por segmento**: tabs Mercado, Liga, Equipa, Faixa de odd, Confiança, Índice de valor, Casa de apostas, Dia da semana (the tab row scrolls on phone). Table: Segmento, Apostas, Acerto, Odd média, Yield (diverging bar, `neg` left and `pos` right of the centre, ±20% fills its side, plus the number), Lucro. Rows with n < 30 are `muted` with an "amostra pequena" tag. Segment labels: seeded markets and confidence and value-band labels in the active language, odds bands as "1,80–2,19" / "5,00+", weekdays by name; everything else as stored. The table scrolls horizontally inside its card on phones. With scope Múltiplas the table is replaced by "Os segmentos contam só prognósticos simples: escolhe Punter ou Todos."
- **Empty state**: "Sem apostas liquidadas neste período." when the scope has no settled bet in the period.
- Calibration, CLV, drawdown and the calendar come in Phase 4.

Code: `src/views/DashboardView.vue`, `src/stores/bets.ts`, `src/domain/bets.ts`, `src/domain/periods.ts`.

### Login, 404

Cards on `surface` with the same type scale.

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
