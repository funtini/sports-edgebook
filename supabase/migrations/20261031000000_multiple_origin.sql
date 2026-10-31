-- Múltiplas screen (issue #25): a multiple can mix legs added by hand and by the generator, and each
-- leg keeps where it came from. Existing multiples keep their origin; existing legs become `manual`.
alter table public.multiples
  drop constraint multiples_origin_check,
  add constraint multiples_origin_check check (origin in ('manual', 'generated', 'mixed'));

alter table public.multiple_legs
  add column origin text not null default 'manual' check (origin in ('manual', 'generated'));
