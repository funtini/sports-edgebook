# Slip import (image)

Phase 4. The owner uploads a screenshot or photo of a bet slip from a bookmaker (a single or a multiple), the app reads it, and a confirmation window shows every prediction and field so the owner can fix whatever was misread before anything is saved. Design canvas (owner only): [Edgebook design](https://claude.ai/artifact/FSQPYVsrXWufBYNVNXj1tD), row "Importar aposta por imagem".

## Flow

1. **Entry**, on Registo (`/registo`), in the search state (before an event is picked):
   - Phone: a dashed tile "Importar de uma imagem" under Recentes.
   - Desktop: an "Importar aposta" button next to the "Novo prognóstico" title.
   - Both open `/registo/importar`.
2. **Enviar**: one image per import (PNG, JPEG or WebP; the camera on phone). The image is shrunk in the browser to at most 1600px on its long side and re-encoded as JPEG before upload.
3. **A ler**: the image goes to the `read-slip` Edge Function (below). The screen shows the image and a progress state; on failure it says so and offers "Tentar outra vez" and "Escolher outra imagem".
4. **Confirmar aposta**: the confirmation window (below). Nothing is written to the database before the owner presses the save button.
5. **Saved**: back to Hoje with a toast ("3 prognósticos e a múltipla registados").

The image is never stored, neither in Supabase Storage nor in the database. It lives only in the browser for the length of the import.

## Reading: `read-slip` Edge Function

- A Supabase Edge Function at `supabase/functions/read-slip/`. It calls the Claude API (a vision-capable model, chosen in the function's config) with the image and returns structured JSON. The function and the stores are the only places that leave the browser.
- **The Anthropic API key lives only in Supabase secrets** (`ANTHROPIC_API_KEY`, set with `supabase secrets set`). It never appears in the repo, in `.env`, or in the frontend bundle. The frontend calls the function with the user's session (`supabase.functions.invoke`), and the function rejects calls without a valid JWT.
- Limits: images over 5 MB are rejected; at most 30 reads per user per day (counted in the function), to cap cost.
  - A read is counted in `slip_reads` (only `user_id` and the time) before the model is called, so failed reads count too. The day is the UTC day.
  - The owner can read and insert `slip_reads` rows but not change or delete them.
- Deploying the function is a manual step for the owner (`supabase functions deploy read-slip --use-api`, because it imports `src/domain/`); CI only type-checks and tests it. Setup steps: `supabase/functions/read-slip/README.md`.
- The model and its effort are set in `supabase/functions/read-slip/config.ts`. The answer is constrained with structured output (JSON Schema from the Zod schema) and validated again after.
- The prompt maps what it reads onto the [market catalogue](domain.md#markets) and returns, for each field, whether it is sure.
- After validation, fields that break the catalogue's rules are added to `unsure`: a type the market does not have, a selection the type does not allow, a missing or off-step line, an odd of 1 or less, and a kickoff that is missing or not a date.

Request: `{ image, mediaType: 'image/jpeg', timeZone? }`, the image as base64 and the browser's IANA time zone, so dates on the slip are read in it (UTC when missing or unknown).

Errors answer `{ error }` with a code the UI translates: `invalid_request` (400), `image_too_large` (413), `daily_limit` (429), `read_failed` (502, no answer or one that fails validation), `unavailable` (503, Claude API or database error). A call without a valid session gets 401.

Response shape (`src/domain/slipRead.ts`, validated with Zod on both sides; anything that fails validation is treated as a failed read):

```ts
interface SlipRead {
  kind: 'single' | 'multiple'
  bookmaker: string | null
  stake: number | null          // in currency, as printed on the slip
  totalOdd: number | null
  status: 'pending' | 'won' | 'lost' | 'void' | null
  legs: SlipLeg[]
}

interface SlipLeg {
  rawText: string               // the slip's own words for the leg, shown as "Na casa:"
  homeTeam: string
  awayTeam: string
  league: string | null
  kickoffAt: string | null      // ISO; null when the slip shows no date
  timing: 'pre' | 'live' | null
  market: Market | null         // catalogue keys
  betType: BetType | null
  period: MatchPeriod | null
  selection: string | null      // catalogue selection code as stored (`over`, `home_under`…)
  line: number | null
  odd: number | null
  status: 'pending' | 'won' | 'lost' | 'void' | null
  unsure: (keyof SlipLeg)[]     // fields the model is not sure about
}
```

## Matching events and teams

Pure functions in `src/domain/slipImport.ts`, with tests.

- **Team names are normalised** before comparing: lower case, accents removed, punctuation and extra spaces removed, and common club affixes dropped (`fc`, `sc`, `cf`, `cd`, `sl`, `ac`, `afc`, `sad`, and similar).
- **Two team names match** when, after normalising:
  - they are equal;
  - one contains the other as whole words ("Braga" and "SC Braga");
  - or the slip name is a saved alias of the app team (`team_aliases`, same normalisation).
- **Same day** means the same calendar date of `kickoff_at` in the browser's time zone. When the slip has no date, the candidates are games from yesterday to seven days ahead, and the date becomes an unsure field.
- **Event match**, for each leg, against the owner's events on the same day:
  - **Both teams match one event** (home and away in either order): the leg is linked to that event. Note "Ligado a um evento que já tens".
  - **Only one team matches** an event on that day: the leg asks **"Este evento já existe na app?"** and shows the slip's game next to the app's ("Na casa: Sporting CP – Rio Ave", "Na app: Sporting – Rio Ave FC"), with "Sim, é o mesmo jogo" and "Não, é outro jogo". Yes links the leg and, on save, stores the slip's spelling of the other team as an alias of the app team, so the next import links it on its own. No makes a new event. Matching on one team is on purpose: slips write names in other languages or abbreviated, and requiring both names would miss real duplicates.
  - **No match**: a new event, with "Novo evento" on the card. New teams and leagues are created on save, reusing existing teams by the same name rule.
  - Several candidate events: the question lists them, nearest kickoff first, plus "Não, é outro jogo".

## Duplicate predictions

Once a leg is linked to an existing event, it is compared with that event's predictions. A **duplicate** has the same market, bet type, period, selection and line (the odd and the timing may differ).

- **Leg of a multiple**: the leg reuses the existing prediction (no new row). `multiple_legs.odd_at_selection` takes the slip's odd. Note: "Já tens este prognóstico · a perna usa o que existe".
- **Single, existing prediction not punter**: the existing prediction becomes the real bet: `is_punter = true`, `stake_units` and `bookmaker` from the slip, and `odd` from the slip when it differs (both shown). Its confidence and `probability` stay as they are. The save button reads "Marcar como aposta real".
- **Single, existing prediction already punter**: the bet is already logged. The card says "Esta aposta já está registada" and the save button is disabled for that card; "Tirar da importação" removes it.
- The confidence of a reused prediction comes from the existing row and is shown read-only.

## Confirmation window

- **Desktop**: a modal over a scrim. The image is on the left, at full height, and scrolls on its own. The cards are on the right.
- **Phone**: a full-screen sheet. A "Ver imagem" toggle at the top shows the image.

### Boletim card

- **Casa de apostas**: chips with the bookmakers already used, plus the one read. Free text is also allowed.
- **Valor apostado**: a € stepper, with the units shown next to it (converted with `unit_value`). Stored in units.
- **Estado**: chips "Em aberto", "Ganha", "Perdida", "Nula".
- **Odd total** and **Retorno possível** (stake × odd total).
- An "Aposta real · Punter" tile (always on for an import).
- For a multiple, a note says that the stake belongs to the multiple and that the legs have no stake of their own.

### Prediction cards

One card per leg, in slip order:

- **Header**: game, kickoff, league.
- **"Na casa:"**: the slip's original text (`rawText`).
- **Event state**: one of
  - the question (amber, `amber-soft`);
  - the linked note;
  - the new-event note.
- **Duplicate notice**, when one applies.
- **Campos a confirmar**: a quick amber block with only the fields the reading was unsure about (for example Tipo and Linha), each with its normal control, and an "Está certo" button that clears the block.
- **Confiança**: always visible and required (five buttons, as on Registo). It is never read from the slip, because only the owner knows it.
- **"Editar campos"** opens the full Registo field set for that leg:
  - Evento, with "Trocar". Trocar opens a search over the owner's events, with the candidates for that day first and "+ Novo evento «Sporting CP – Rio Ave»" at the end.
  - Momento (Pré-jogo or Live), Mercado, Tipo, Período, Seleção, Linha, Odd, Confiança, notes.
  - "Tirar da múltipla" (or "Tirar da importação" on a single).
  - "Concluído" closes it.

### Footer

- A line saying what is still missing ("Falta responder a 1 pergunta e escolher 2 confianças").
- "Cancelar" and the save button: "Registar 3 prognósticos e a múltipla", or "Registar prognóstico" for a single.
- Saving is disabled until every event question is answered, every leg has a confidence, and every required field is filled.

## Saving

- One store action writes everything, in this order:
  1. leagues and teams;
  2. events;
  3. aliases;
  4. predictions;
  5. the multiple and its legs.
- If a step fails, the rows written before it are deleted and the window stays open with the error.
- **New predictions**:
  - `probability` comes from the confidence anchors at save time, as in Registo.
  - On a single, `is_punter = true`, with `stake_units` and `bookmaker` from the slip.
  - In a multiple, legs are not punter and have no stake.
  - `status` comes from the leg (pending when unknown). `settled_at` is set when the status is not pending.
- **The multiple**:
  - `origin = 'manual'` and every leg's `origin = 'manual'`.
  - `is_placed = true`, with `stake_units` from the slip.
  - `total_odd` from the slip, because boosts can make it differ from the product of the legs.
  - `status` from the Boletim card.
  - `bookmaker` from the slip.
- **Migration** for this phase: `multiples.bookmaker text` (nullable). Predictions already have `bookmaker`.
