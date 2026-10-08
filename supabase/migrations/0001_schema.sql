-- Shared Prepaid Meter Tracker — core schema
-- Money and energy use numeric, never floats (spec §0).

create extension if not exists "pgcrypto";

create type user_role       as enum ('admin', 'resident');
create type reading_status  as enum ('accepted', 'flagged', 'rejected');
create type recharge_status as enum ('pending', 'approved', 'rejected');

create table residents (
  id                   uuid primary key default gen_random_uuid(),
  auth_user_id         uuid unique references auth.users(id),
  full_name            text not null,
  house_label          text not null,               -- e.g. "House C"
  phone_e164           text unique,                 -- for the future WhatsApp bot
  role                 user_role not null default 'resident',
  meter_serial         text,
  opening_reading      numeric(12,2) not null,      -- sub-meter kWh when onboarded
  opening_balance_kwh  numeric(12,3) not null default 0,  -- carry-over from the old manual system
  consumed_offset_kwh  numeric(12,3) not null default 0,  -- used when a sub-meter is replaced
  is_active            boolean not null default true,
  created_at           timestamptz not null default now()
);

create table price_history (
  id              uuid primary key default gen_random_uuid(),
  price_per_kwh   numeric(10,2) not null check (price_per_kwh > 0),
  effective_from  timestamptz not null,
  set_by          uuid references residents(id),
  created_at      timestamptz not null default now()
);

create table readings (
  id            uuid primary key default gen_random_uuid(),
  resident_id   uuid not null references residents(id),
  reading_kwh   numeric(12,2) not null,
  taken_at      timestamptz not null default now(),
  photo_path    text,                               -- private storage path
  status        reading_status not null default 'accepted',
  flag_reason   text,
  source        text not null default 'web',        -- 'web' | 'whatsapp' | 'opening' | 'admin'
  submitted_by  uuid references residents(id),
  created_at    timestamptz not null default now()
);
create index on readings (resident_id, taken_at desc);

create table recharges (
  id                      uuid primary key default gen_random_uuid(),
  paid_by                 uuid not null references residents(id),
  amount_naira            numeric(12,2) not null check (amount_naira > 0),
  price_per_kwh_applied   numeric(10,2) not null,
  kwh_credited            numeric(12,3) not null,
  token_units_kwh         numeric(12,3),            -- optional: units shown on the token
  receipt_path            text,
  recharged_at            timestamptz not null default now(),
  status                  recharge_status not null default 'pending',
  approved_by             uuid references residents(id),
  approved_at             timestamptz,
  reject_reason           text,
  note                    text,
  source                  text not null default 'web',
  created_at              timestamptz not null default now()
);
create index on recharges (status, recharged_at desc);

create table adjustments (          -- admin-only manual corrections, always with a reason
  id           uuid primary key default gen_random_uuid(),
  resident_id  uuid not null references residents(id),
  kwh_delta    numeric(12,3) not null,
  reason       text not null,
  created_by   uuid not null references residents(id),
  created_at   timestamptz not null default now()
);

create table settings (
  key    text primary key,
  value  jsonb not null
);

create table audit_log (
  id         uuid primary key default gen_random_uuid(),
  actor_id   uuid references residents(id),
  action     text not null,
  entity     text not null,
  entity_id  uuid,
  before     jsonb,
  after      jsonb,
  created_at timestamptz not null default now()
);

-- Seed default settings (spec §5).
insert into settings (key, value) values
  ('stale_days',                 '7'::jsonb),
  ('jump_threshold_kwh_per_day', '40'::jsonb),
  ('rounding_naira',             '100'::jsonb)
on conflict (key) do nothing;
