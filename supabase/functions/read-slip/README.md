# read-slip

Supabase Edge Function that reads one bet slip image with the Claude API and returns a `SlipRead`
(`src/domain/slipRead.ts`). Spec: [docs/specs/slip-import.md](../../../docs/specs/slip-import.md#reading-read-slip-edge-function).

## Files

- `index.ts`: the Deno entry. Checks the user's JWT (`@supabase/server`, `auth: 'user'`), counts
  reads in `slip_reads`, and calls the Claude API.
- `handler.ts`: the request rules (body, 5 MB limit, 30 reads a day, output validation), with its
  outside effects injected so Vitest can test it (`__tests__/`).
- `prompt.ts`: what the model is told, mapped to the market catalogue.
- `config.ts`: the model and its effort. Change the model here and deploy again.
- `../../../src/domain/slipRead.ts`: the Zod schema shared with the frontend.

## Request and response

```ts
const { data, error } = await supabase.functions.invoke('read-slip', {
  body: { image: base64Jpeg, mediaType: 'image/jpeg', timeZone: 'Europe/Lisbon' },
})
```

- `200`: a `SlipRead`. Validate it again with `slipReadSchema` in the browser.
- `400 invalid_request`, `413 image_too_large`, `429 daily_limit`, `502 read_failed` (the model's
  answer did not pass validation, or it gave none), `503 unavailable` (Claude API or database
  error, or the key is missing). The body is `{ "error": "<code>" }`.
- `401` without a valid session.

The image is never stored or logged; only the time of each read is kept, in `slip_reads`.

## Setup (owner, once)

You need the [Supabase CLI](https://supabase.com/docs/guides/cli) and your project ref (Project
Settings → General, or the `xxxx` in `https://xxxx.supabase.co`).

1. Log in and apply the migration that creates `slip_reads`:

   ```sh
   npx supabase login
   npx supabase link --project-ref <project-ref>
   npx supabase db push
   ```

2. Create an API key at [platform.claude.com](https://platform.claude.com/settings/keys) and store
   it as a function secret. Type it at the prompt so it never lands in a file or the shell history:

   ```sh
   read -rs ANTHROPIC_API_KEY && npx supabase secrets set ANTHROPIC_API_KEY="$ANTHROPIC_API_KEY"; unset ANTHROPIC_API_KEY
   npx supabase secrets list   # shows the name and a digest, never the value
   ```

   The key lives only in Supabase secrets. Never put it in `.env`, a `VITE_` variable or the repo.

3. Deploy. The function imports `src/domain/`, which is outside `supabase/`, so deploy through the
   API bundler:

   ```sh
   npx supabase functions deploy read-slip --use-api
   ```

   JWT verification stays on (the default), and the function checks the user again itself.

Deploy again after changing anything here or in `src/domain/slipRead.ts` or `src/domain/markets.ts`.
To rotate the key, run step 2 again with the new key; no redeploy is needed.

## Checks

CI type-checks the function with Deno (`npm run type-check:functions`) and runs its tests with the
rest (`npm test`). The tests use recorded answers and never call the API.
