-- How money is shown in the app: units (bare number) or euros (units × unit_value).
-- Display only; amounts stay stored in units. The Dashboard toggle starts from this value.
alter table public.user_settings
  add column money_display text not null default 'units'
    check (money_display in ('units', 'euros'));
