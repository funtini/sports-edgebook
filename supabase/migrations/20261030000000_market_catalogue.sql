-- Fixed catalogue for what a prediction bets on (docs/specs/domain.md#markets): market (what is
-- counted), bet type, period, and a selection code; codes live in src/domain/markets.ts.
-- Existing predictions are converted from their free-text market (category + name) and selection;
-- anything that does not convert with certainty becomes type `other` with the original text kept.
-- `markets` and `predictions.market_id` stay, unused, until the conversion is checked.

alter table public.predictions
  add column market text,
  add column bet_type text,
  add column period text;

-- Side picked in a legacy selection or market name: `Casa`, `Home`, `V1`, `Handicap V2`...
create function pg_temp.side(t text) returns text language sql immutable as $$
  select case
    when t ~* '(^|\s)(casa|home|v1|w1|1)$' then 'home'
    when t ~* '(^|\s)(fora|away|v2|w2|2)$' then 'away'
    when t ~* '(^|\s)(empate|draw|x)$' then 'draw'
  end
$$;

create function pg_temp.period(t text) returns text language sql immutable as $$
  select case upper(trim(t)) when 'FT' then 'FT' when 'HT' then 'HT' when '2P' then '2P' end
$$;

-- Market of a legacy category; null for one the user typed.
create function pg_temp.market(category text) returns text language sql immutable as $$
  select case category
    when '1X2' then 'result'
    when 'Dupla hipótese' then 'result'
    when 'Handicap' then 'result'
    when 'Golos' then 'goals'
    when 'Ambas marcam' then 'goals'
    when 'Cantos' then 'corners'
    when 'Cartões' then 'cards'
  end
$$;

-- Handicap: `Handicap` market, or a selection like `Handicap Home` under 1X2 / Cantos.
update public.predictions p
set market = pg_temp.market(m.category),
    bet_type = 'handicap',
    selection = pg_temp.side(p.selection),
    period = coalesce(pg_temp.period(m.name), 'FT')
from public.markets m
where m.id = p.market_id
  and p.bet_type is null
  and pg_temp.market(m.category) in ('result', 'corners', 'cards')
  and (m.category = 'Handicap' or p.selection ~* '^\s*handicap')
  and pg_temp.side(p.selection) in ('home', 'away');

-- Winner: 1X2 (the side in the name or the selection; FT / HT in the other), and winner on
-- corners or cards.
update public.predictions p
set market = pg_temp.market(m.category),
    bet_type = '1x2',
    selection = coalesce(pg_temp.side(m.name), pg_temp.side(p.selection)),
    period = coalesce(pg_temp.period(m.name), pg_temp.period(p.selection), 'FT')
from public.markets m
where m.id = p.market_id
  and p.bet_type is null
  and m.category in ('1X2', 'Cantos', 'Cartões')
  and m.name not in ('Mais de', 'Menos de')
  and coalesce(pg_temp.side(m.name), pg_temp.side(p.selection)) is not null;

-- Totals: `Mais de` / `Menos de`; the line is stored without sign, the selection says the side.
update public.predictions p
set market = pg_temp.market(m.category),
    bet_type = 'total',
    selection = case m.name when 'Mais de' then 'over' else 'under' end,
    line = abs(p.line),
    period = coalesce(pg_temp.period(p.selection), 'FT')
from public.markets m
where m.id = p.market_id
  and p.bet_type is null
  and m.category in ('Golos', 'Cantos', 'Cartões')
  and m.name in ('Mais de', 'Menos de')
  and p.line is not null;

update public.predictions p
set market = 'result',
    bet_type = 'double_chance',
    selection = lower(replace(p.selection, ' ', '')),
    period = 'FT'
from public.markets m
where m.id = p.market_id
  and p.bet_type is null
  and m.category = 'Dupla hipótese'
  and upper(replace(p.selection, ' ', '')) in ('1X', 'X2', '12');

update public.predictions p
set market = 'goals',
    bet_type = 'btts',
    selection = case when p.selection ~* '^\s*(sim|yes)\s*$' then 'yes' else 'no' end,
    period = 'FT'
from public.markets m
where m.id = p.market_id
  and p.bet_type is null
  and m.category = 'Ambas marcam'
  and p.selection ~* '^\s*(sim|yes|não|nao|no)\s*$';

-- Everything else: type `other`, the original market and selection kept as its text.
update public.predictions p
set market = coalesce(pg_temp.market(m.category), 'result'),
    bet_type = 'other',
    selection = concat_ws(' · ', m.category, m.name, p.selection),
    period = coalesce(pg_temp.period(m.name), pg_temp.period(p.selection), 'FT')
from public.markets m
where m.id = p.market_id
  and p.bet_type is null;

alter table public.predictions
  alter column market set not null,
  alter column bet_type set not null,
  alter column period set not null,
  alter column market_id drop not null,
  add constraint predictions_market_check
    check (market in ('result', 'goals', 'corners', 'yellow_cards', 'cards')),
  add constraint predictions_bet_type_check check (
    bet_type in (
      '1x2', 'double_chance', 'handicap', 'result_total', 'total', 'team_total', 'btts', 'other'
    )
  ),
  add constraint predictions_period_check check (period in ('FT', 'HT', '2P'));
