-- =====================================================================
-- Negative Data Archive — image storage
--
-- Run after schema.sql, in the Supabase SQL Editor.
--
-- Images (FACS plots, blots, stained sections) go in one public bucket.
-- Public here means readable without a login, which is what the open
-- archive needs; writing is still restricted by the policies below.
--
-- Object paths are "<user id>/<uuid>.jpg". The first folder segment is
-- the uploader's id, which is what lets a policy tell one person's
-- uploads from another's.
-- =====================================================================

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'record-images',
  'record-images',
  true,
  5242880,                                  -- 5 MB; the page downscales before upload
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update
  set public             = excluded.public,
      file_size_limit    = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;


-- Anyone may read, matching the open archive.
drop policy if exists record_images_read on storage.objects;
create policy record_images_read
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'record-images');

-- Only KU members upload, and only under their own folder.
drop policy if exists record_images_insert on storage.objects;
create policy record_images_insert
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'record-images'
    and public.is_ku_member()
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists record_images_update on storage.objects;
create policy record_images_update
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'record-images'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  )
  with check (
    bucket_id = 'record-images'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );

-- An operator can remove someone else's image; a member only their own.
drop policy if exists record_images_delete on storage.objects;
create policy record_images_delete
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'record-images'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.is_admin())
  );
