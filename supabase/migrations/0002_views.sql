-- Derived views. Balances are NEVER stored (spec §0, §5).

create view resident_balances as
with latest as (
  select distinct on (resident_id) resident_id, reading_kwh, taken_at
  from readings where status = 'accepted'
  order by resident_id, taken_at desc
),
rc as (
  select paid_by as resident_id, sum(kwh_credited) as kwh, count(*) as n
  from recharges where status = 'approved' group by paid_by
),
adj as (
  select resident_id, sum(kwh_delta) as kwh from adjustments group by resident_id
)
select
  r.id as resident_id, r.full_name, r.house_label,
  r.opening_reading,
  coalesce(l.reading_kwh, r.opening_reading)                         as latest_reading,
  l.taken_at                                                         as last_reading_at,
  (coalesce(l.reading_kwh, r.opening_reading) - r.opening_reading)
      + r.consumed_offset_kwh                                        as consumed_kwh,
  coalesce(rc.kwh, 0)                                                as recharged_kwh,
  coalesce(rc.n, 0)                                                  as recharge_count,
  coalesce(adj.kwh, 0) + r.opening_balance_kwh                       as other_credit_kwh,
  (r.opening_balance_kwh + coalesce(rc.kwh,0) + coalesce(adj.kwh,0))
    - ((coalesce(l.reading_kwh, r.opening_reading) - r.opening_reading) + r.consumed_offset_kwh)
                                                                     as balance_kwh
from residents r
left join latest l on l.resident_id = r.id
left join rc  on rc.resident_id  = r.id
left join adj on adj.resident_id = r.id
where r.is_active;

create view reading_intervals as
select resident_id,
       lag(taken_at)     over w as from_time,
       taken_at                 as to_time,
       lag(reading_kwh)  over w as from_reading,
       reading_kwh              as to_reading,
       reading_kwh - lag(reading_kwh) over w as used_kwh
from readings
where status = 'accepted'
window w as (partition by resident_id order by taken_at);
