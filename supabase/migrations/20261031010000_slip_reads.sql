-- Slip import (issue #53): the `read-slip` Edge Function counts each read here to cap them at 30 per
-- user per day. Only the time of the read is kept, never the image or what was read from it.
create table public.slip_reads (
  id bigint generated always as identity primary key,
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);

create index on public.slip_reads (user_id, created_at);

-- Owner-only, like every table, but reads cannot be changed or deleted: that would reset the limit.
alter table public.slip_reads enable row level security;

create policy "owner can read" on public.slip_reads for select to authenticated
  using (user_id = (select auth.uid()));

create policy "owner can insert" on public.slip_reads for insert to authenticated
  with check (user_id = (select auth.uid()));
