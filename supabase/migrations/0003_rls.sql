-- Row Level Security (spec §5).
-- Service-layer privileged writes use the service-role key and bypass RLS;
-- these policies govern what signed-in residents can do directly.

-- ---------------------------------------------------------------------------
-- Helper functions (security definer so they can read `residents` without
-- triggering recursive RLS on that table).
-- ---------------------------------------------------------------------------
create or replace function current_resident_id() returns uuid
  language sql stable security definer set search_path = public as $$
  select id from residents where auth_user_id = auth.uid()
$$;

create or replace function is_admin() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from residents
    where auth_user_id = auth.uid() and role = 'admin' and is_active
  )
$$;

create or replace function is_active_resident() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from residents where auth_user_id = auth.uid() and is_active
  )
$$;

-- Views honour the querying user's RLS on the underlying tables.
alter view resident_balances set (security_invoker = true);
alter view reading_intervals set (security_invoker = true);

-- ---------------------------------------------------------------------------
-- Enable RLS
-- ---------------------------------------------------------------------------
alter table residents     enable row level security;
alter table price_history enable row level security;
alter table readings      enable row level security;
alter table recharges     enable row level security;
alter table adjustments   enable row level security;
alter table settings      enable row level security;
alter table audit_log     enable row level security;

-- ---------------------------------------------------------------------------
-- residents: all active residents can see the roster; only admin manages it.
-- ---------------------------------------------------------------------------
create policy residents_select on residents
  for select to authenticated
  using (is_active_resident() or is_admin());

create policy residents_admin_write on residents
  for all to authenticated
  using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------------
-- price_history: everyone reads; admin inserts; rows are never edited/deleted.
-- ---------------------------------------------------------------------------
create policy price_select on price_history
  for select to authenticated
  using (is_active_resident() or is_admin());

create policy price_admin_insert on price_history
  for insert to authenticated
  with check (is_admin());

-- ---------------------------------------------------------------------------
-- readings: accepted readings are visible to everyone (transparency); a
-- resident also sees their own non-accepted ones; only the owner/admin insert;
-- only admin edits/rejects after the fact.
-- ---------------------------------------------------------------------------
create policy readings_select on readings
  for select to authenticated
  using (
    (status = 'accepted' and is_active_resident())
    or resident_id = current_resident_id()
    or is_admin()
  );

create policy readings_insert_own on readings
  for insert to authenticated
  with check (resident_id = current_resident_id() or is_admin());

create policy readings_admin_update on readings
  for update to authenticated
  using (is_admin()) with check (is_admin());

create policy readings_admin_delete on readings
  for delete to authenticated
  using (is_admin());

-- ---------------------------------------------------------------------------
-- recharges: approved recharges visible to everyone; owner sees their own
-- pending/rejected; owner/admin insert; only admin approves/rejects.
-- ---------------------------------------------------------------------------
create policy recharges_select on recharges
  for select to authenticated
  using (
    (status = 'approved' and is_active_resident())
    or paid_by = current_resident_id()
    or is_admin()
  );

create policy recharges_insert_own on recharges
  for insert to authenticated
  with check (paid_by = current_resident_id() or is_admin());

create policy recharges_admin_update on recharges
  for update to authenticated
  using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------------
-- adjustments: visible to everyone in a resident's history; admin-only writes.
-- ---------------------------------------------------------------------------
create policy adjustments_select on adjustments
  for select to authenticated
  using (is_active_resident() or is_admin());

create policy adjustments_admin_write on adjustments
  for all to authenticated
  using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------------
-- settings: everyone reads; admin writes.
-- ---------------------------------------------------------------------------
create policy settings_select on settings
  for select to authenticated
  using (is_active_resident() or is_admin());

create policy settings_admin_write on settings
  for all to authenticated
  using (is_admin()) with check (is_admin());

-- ---------------------------------------------------------------------------
-- audit_log: admin-only.
-- ---------------------------------------------------------------------------
create policy audit_admin_select on audit_log
  for select to authenticated
  using (is_admin());
