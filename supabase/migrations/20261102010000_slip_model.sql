-- Slip reading model, chosen in Definições: `economy` (Haiku), `balanced` (Sonnet) or `best` (Opus).
-- The Edge Function maps each one to a Claude model in its `config.ts`.
alter table public.user_settings
  add column slip_model text not null default 'economy'
    check (slip_model in ('economy', 'balanced', 'best'));

-- What each read used, so its real cost can be checked: the Claude model id and its tokens.
-- Still never the image or what was read from it.
alter table public.slip_reads
  add column model text,
  add column input_tokens integer check (input_tokens >= 0),
  add column output_tokens integer check (output_tokens >= 0);

-- The function fills the tokens in after the read. Only those two columns can change, so a read's
-- time (which the daily limit counts) still cannot be moved or deleted.
revoke update on public.slip_reads from anon, authenticated;
grant update (input_tokens, output_tokens) on public.slip_reads to authenticated;

create policy "owner can record usage" on public.slip_reads for update to authenticated
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));
