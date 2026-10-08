-- Private storage for receipt and meter photos (spec §5).
-- Files are stored under a top-level folder equal to the uploader's auth uid,
-- e.g. "<auth_user_id>/readings/<uuid>.jpg". A resident can read/write only
-- their own folder; admins can read everything.

insert into storage.buckets (id, name, public)
values ('proofs', 'proofs', false)
on conflict (id) do nothing;

create policy proofs_read_own on storage.objects
  for select to authenticated
  using (
    bucket_id = 'proofs'
    and ((storage.foldername(name))[1] = auth.uid()::text or is_admin())
  );

create policy proofs_insert_own on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'proofs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy proofs_update_own on storage.objects
  for update to authenticated
  using (
    bucket_id = 'proofs'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy proofs_delete_own on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'proofs'
    and ((storage.foldername(name))[1] = auth.uid()::text or is_admin())
  );
