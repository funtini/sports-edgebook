-- Whether a prediction was logged with the game already under way (live) or before kickoff.
-- Existing predictions were all logged before kickoff.
alter table public.predictions
  add column is_live boolean not null default false;
