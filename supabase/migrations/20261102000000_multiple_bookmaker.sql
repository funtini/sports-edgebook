-- Slip import (issue #55): a multiple imported from a bet slip keeps the bookmaker it was placed at.
-- Predictions already have `bookmaker`; existing multiples stay null.
alter table public.multiples
  add column bookmaker text;
