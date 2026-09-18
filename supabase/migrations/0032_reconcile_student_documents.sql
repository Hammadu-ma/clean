-- ===========================================================================
-- 0032_reconcile_student_documents.sql
--
-- THE SPLIT (flagged, not fixed, in the previous round)
-- Uploads have always gone through register_file()/unregister_file()
-- (0026), which write to `file_objects` — the newer, R2-backed storage
-- table. But the read path (hydrateCoreViaBootstrap / hydrateCoreViaTables
-- in src/lib/backend.ts) has always read a student's documents from the
-- older `student_documents` table. A document a registrar just uploaded
-- would sit in file_objects, invisible, until someone thought to look in
-- two different tables for "a student's documents."
--
-- THE FIX, AND WHY THIS SHAPE
-- Two ways to close this: change the read path to query file_objects
-- instead, or make the write path keep both tables in sync. The read path
-- was left alone on purpose — get_app_bootstrap()/get_app_snapshot() are
-- the two most security-sensitive functions in the schema (they decide
-- what an entire login sees), and reshaping either of them blind, without
-- a live database to verify the RLS-scoping still behaves correctly for
-- every role, is a worse risk than it's worth. Instead, register_file()
-- and unregister_file() now mirror student_document rows into
-- student_documents using the *same id* as the file_objects row, so the
-- existing, already-correct read path sees them immediately. photo and
-- fee-receipt uploads are untouched — student_documents was never meant to
-- hold those, so mirroring is scoped to owner_type = 'student_document'.
--
-- This is the pragmatic fix under a deadline, not the final architecture.
-- The honest next step, once there's a live database to test the change
-- against, is to migrate the read path onto file_objects as the single
-- source of truth and retire student_documents outright.
-- ===========================================================================

create or replace function public.register_file(
  p_owner_type text, p_owner_id text, p_storage_key text,
  p_original_name text default null, p_mime_type text default null,
  p_size_bytes bigint default null, p_kind text default null)
returns jsonb language plpgsql security definer as $$
declare new_id uuid;
begin
  if p_owner_type not in ('student_photo','student_document','fee_receipt') then
    raise exception 'unsupported owner type %', p_owner_type;
  end if;

  if not public.can_view_student(p_owner_id) then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if p_owner_type = 'student_photo' and not public.has_perm('students.edit') then
    raise exception 'not permitted' using errcode = '42501';
  end if;

  insert into public.file_objects (
    owner_type, owner_id, storage_key, original_name, mime_type, size_bytes, kind, uploaded_by)
  values (p_owner_type, p_owner_id, p_storage_key, p_original_name, p_mime_type,
          p_size_bytes, p_kind, auth.uid())
  on conflict (storage_key) do update set
    original_name = excluded.original_name,
    mime_type     = excluded.mime_type,
    size_bytes    = excluded.size_bytes,
    kind          = excluded.kind
  returning id into new_id;

  if p_owner_type = 'student_document' then
    insert into public.student_documents (id, student_id, name, kind, size, doc_date, storage_path)
    values (new_id::text, p_owner_id, coalesce(p_original_name, p_storage_key), p_kind,
            p_size_bytes::text, current_date, p_storage_key)
    on conflict (id) do update set
      name = excluded.name, kind = excluded.kind, size = excluded.size, storage_path = excluded.storage_path;
  end if;

  perform public.log_action('file.upload', p_storage_key, coalesce(p_original_name, p_owner_type));
  return jsonb_build_object('fileId', new_id, 'key', p_storage_key);
end $$;
grant execute on function public.register_file(text,text,text,text,text,bigint,text) to authenticated;

create or replace function public.unregister_file(p_storage_key text)
returns jsonb language plpgsql security definer as $$
declare f public.file_objects;
begin
  select * into f from public.file_objects where storage_key = p_storage_key;
  if f.id is null then return jsonb_build_object('deleted', 0); end if;

  if not public.can_view_student(f.owner_id) or not public.has_perm('students.edit') then
    raise exception 'not permitted' using errcode = '42501';
  end if;

  delete from public.file_objects where id = f.id;
  delete from public.student_documents where id = f.id::text;
  perform public.log_action('file.delete', p_storage_key, f.original_name);
  return jsonb_build_object('deleted', 1);
end $$;
grant execute on function public.unregister_file(text) to authenticated;

-- Back-fill: any student_document already sitting in file_objects from
-- before this migration (i.e. uploaded, then never visible) becomes
-- visible the moment this migration runs, without needing a re-upload.
insert into public.student_documents (id, student_id, name, kind, size, doc_date, storage_path)
select f.id::text, f.owner_id, coalesce(f.original_name, f.storage_key), f.kind,
       f.size_bytes::text, f.created_at::date, f.storage_key
from public.file_objects f
where f.owner_type = 'student_document'
on conflict (id) do nothing;
