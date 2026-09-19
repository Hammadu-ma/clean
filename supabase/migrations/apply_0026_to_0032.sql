-- Applies migrations 0026-0032 (the write API) in order. Safe to re-run.
-- Paste the whole file into the Supabase SQL Editor and run it once.

-- =================== 0026_write_api.sql ===================
-- ===========================================================================
-- 0026_write_api.sql — every write becomes one intentional statement
--
-- THE PROBLEM THIS SOLVES
-- `sync()` in src/lib/backend.ts takes the previous in-memory DB and the new
-- one, diffs ~22 tables, and applies the delta. Changing a single mark means
-- serialising every student, every fee, every homework row and every
-- announcement in the school — twice — to discover that one number moved.
-- That is the write-path equivalent of the bootstrap problem: correct at 300
-- students, untenable at 5,000, and it gets worse every year.
--
-- It also has a correctness problem that has nothing to do with size. Two
-- people editing different students at the same time each hold a full
-- snapshot; whoever saves second writes their entire snapshot over the first
-- person's change. Last-writer-wins across the whole database, silently.
--
-- The functions below each do one thing, take only what changed, run in a
-- single transaction, and check permission themselves. `save_student_marks`
-- in 0002 was already the right shape — this extends that pattern to the
-- rest of the write surface.
--
-- All are SECURITY DEFINER with an explicit permission check as the first
-- statement. That check is not optional decoration; it is the authorization.
-- ===========================================================================

/* =========================================================================
   Attendance — one register, one statement.
   p_marks: {"st1":"present","st2":"absent",…}
   ========================================================================= */

create or replace function public.save_register(
  p_year_id text, p_class_id text, p_section_id text, p_day date, p_marks jsonb)
returns jsonb language plpgsql security definer as $$
declare reg_id text; n int := 0;
begin
  if not public.has_perm('attendance.manage') and not public.is_admin() then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if not public.can_see_section(p_class_id, p_section_id) then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if not public.year_is_open(p_year_id) then
    raise exception 'academic year % is closed', p_year_id using errcode = '42501';
  end if;

  reg_id := p_year_id || '-' || to_char(p_day, 'YYYYMMDD') || '-' || p_class_id || '-' || p_section_id;

  insert into public.attendance_registers (id, year_id, day, class_id, section_id, recorded_by)
  values (reg_id, p_year_id, p_day, p_class_id, p_section_id, auth.uid())
  on conflict (year_id, day, class_id, section_id) do update
    set recorded_by = auth.uid()
  returning id into reg_id;

  -- Only students actually enrolled in this section this year can be marked,
  -- however the client built its payload.
  with incoming as (
    select key as student_id, value #>> '{}' as status
    from jsonb_each(p_marks)
  ), valid as (
    select i.student_id, i.status
    from incoming i
    join public.enrollments e
      on e.student_id = i.student_id and e.year_id = p_year_id
     and e.class_id = p_class_id and e.section_id = p_section_id and e.status = 'active'
    where i.status in ('present','absent','late')
  ), written as (
    insert into public.attendance_entries (id, register_id, student_id, status)
    select reg_id || '-' || v.student_id, reg_id, v.student_id, v.status from valid v
    on conflict (register_id, student_id) do update set status = excluded.status
    returning 1
  ) select count(*) into n from written;

  -- Anyone removed from the payload is no longer marked.
  delete from public.attendance_entries ae
  where ae.register_id = reg_id and not (p_marks ? ae.student_id);

  perform public.log_action('attendance.save', reg_id, format('%s students marked', n));
  return jsonb_build_object('registerId', reg_id, 'saved', n);
end $$;
grant execute on function public.save_register(text,text,text,date,jsonb) to authenticated;

/* =========================================================================
   Messaging
   ========================================================================= */

create or replace function public.send_message(p_conversation_id text, p_body text)
returns jsonb language plpgsql security definer as $$
declare new_id uuid; recipients uuid[];
begin
  if not public.has_perm('communication.send') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if not public.is_conversation_member(p_conversation_id) then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if btrim(coalesce(p_body, '')) = '' then
    raise exception 'message body is empty';
  end if;

  insert into public.messages (conversation_id, sender_id, body, read_by)
  values (p_conversation_id, auth.uid(), btrim(p_body), array[auth.uid()])
  returning id into new_id;

  update public.conversations set updated_at = now() where id = p_conversation_id;

  select array_agg(profile_id) into recipients
  from public.conversation_participants
  where conversation_id = p_conversation_id and profile_id <> auth.uid();

  if recipients is not null then
    perform public.notify_users(recipients, 'message', 'New message',
      left(btrim(p_body), 120));
  end if;

  return jsonb_build_object('id', new_id);
end $$;
grant execute on function public.send_message(text,text) to authenticated;

create or replace function public.mark_notifications_read(p_ids text[] default null)
returns integer language plpgsql security definer as $$
declare n int;
begin
  update public.notifications
     set is_read = true
   where profile_id = auth.uid()
     and not is_read
     and (p_ids is null or id::text = any(p_ids));
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function public.mark_notifications_read(text[]) to authenticated;

/* =========================================================================
   Fees — payments are money, so this one is deliberately strict.
   ========================================================================= */

create or replace function public.record_fee_payment(
  p_fee_item_id text, p_amount numeric, p_note text default null)
returns jsonb language plpgsql security definer as $$
declare f public.fee_items; new_paid numeric;
begin
  if not public.has_perm('fees.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'payment amount must be positive';
  end if;

  -- Row lock: two bursars posting against the same fee at the same moment
  -- would otherwise both read the old `paid` and the second would overwrite
  -- the first. This is exactly the class of bug snapshot-diffing produced.
  select * into f from public.fee_items where id = p_fee_item_id for update;
  if f.id is null then raise exception 'unknown fee item %', p_fee_item_id; end if;
  if not public.year_is_open(f.year_id) then
    raise exception 'academic year % is closed', f.year_id using errcode = '42501';
  end if;

  new_paid := f.paid + p_amount;
  if new_paid > f.amount then
    raise exception 'payment of % exceeds the % outstanding', p_amount, f.amount - f.paid;
  end if;

  update public.fee_items set paid = new_paid where id = f.id;

  perform public.log_action('fees.payment', f.id,
    format('%s recorded against %s%s', p_amount, f.label,
           case when p_note is null then '' else ' — ' || p_note end));

  return jsonb_build_object('feeItemId', f.id, 'paid', new_paid,
                            'outstanding', f.amount - new_paid);
end $$;
grant execute on function public.record_fee_payment(text,numeric,text) to authenticated;

/* =========================================================================
   Mark submission workflow — the state machine, server-side.
   The existing tg_submission_state trigger validates transitions; this is
   the single entry point that drives them.
   ========================================================================= */

create or replace function public.set_submission_status(
  p_structure_id text, p_status text, p_reason text default null)
returns jsonb language plpgsql security definer as $$
declare cur text;
begin
  cur := public.structure_status(p_structure_id);

  -- Who may make which move. Deliberately explicit rather than a generic
  -- "can edit marks" check: publishing results is not the same authority as
  -- entering them, and conflating the two is how marks reach families early.
  if p_status = 'submitted' then
    if not public.teacher_can_write_structure(p_structure_id) and not public.is_admin() then
      raise exception 'not permitted' using errcode = '42501';
    end if;
  elsif p_status in ('approved','returned') then
    if not public.has_perm('results.manage') then
      raise exception 'not permitted' using errcode = '42501';
    end if;
  elsif p_status = 'published' then
    if not public.has_perm('results.publish') then
      raise exception 'not permitted' using errcode = '42501';
    end if;
  elsif p_status = 'draft' then
    if not public.has_perm('results.manage') then
      raise exception 'not permitted' using errcode = '42501';
    end if;
  else
    raise exception 'unknown status %', p_status;
  end if;

  insert into public.mark_submissions (id, structure_id, status)
  values ('ms-' || p_structure_id, p_structure_id, p_status)
  on conflict (structure_id) do update set
    status        = p_status,
    submitted_by  = case when p_status = 'submitted' then auth.uid() else public.mark_submissions.submitted_by end,
    submitted_at  = case when p_status = 'submitted' then now()      else public.mark_submissions.submitted_at end,
    approved_by   = case when p_status = 'approved'  then auth.uid() else public.mark_submissions.approved_by end,
    approved_at   = case when p_status = 'approved'  then now()      else public.mark_submissions.approved_at end,
    returned_by   = case when p_status = 'returned'  then auth.uid() else public.mark_submissions.returned_by end,
    returned_at   = case when p_status = 'returned'  then now()      else public.mark_submissions.returned_at end,
    return_reason = case when p_status = 'returned'  then p_reason   else public.mark_submissions.return_reason end,
    published_by  = case when p_status = 'published' then auth.uid() else public.mark_submissions.published_by end,
    published_at  = case when p_status = 'published' then now()      else public.mark_submissions.published_at end,
    reopen_reason = case when p_status = 'draft'     then p_reason   else public.mark_submissions.reopen_reason end;

  perform public.log_action('marks.' || p_status, p_structure_id,
    coalesce(p_reason, format('%s → %s', cur, p_status)));

  return jsonb_build_object('structureId', p_structure_id, 'from', cur, 'to', p_status);
end $$;
grant execute on function public.set_submission_status(text,text,text) to authenticated;

/* =========================================================================
   Students — create/update through one door, with an explicit column
   whitelist. A client cannot set `id`, `school_id`, or `status` by smuggling
   them into the payload, because only the keys named below are ever read.
   ========================================================================= */

create or replace function public.save_student(p_payload jsonb, p_year_id text default null)
returns jsonb language plpgsql security definer as $$
declare
  sid text := nullif(p_payload->>'id', '');
  yr  text := coalesce(p_year_id, public.current_year_id());
  sch text;
  is_new boolean := sid is null;
begin
  if is_new then
    if not public.has_perm('students.create') then
      raise exception 'not permitted' using errcode = '42501';
    end if;
  else
    if not public.has_perm('students.edit') then
      raise exception 'not permitted' using errcode = '42501';
    end if;
  end if;

  select id into sch from public.schools order by id limit 1;
  if is_new then sid := 'st-' || replace(gen_random_uuid()::text, '-', ''); end if;

  insert into public.students (
    id, school_id, reg_no, admission_no, first_name, middle_name, last_name,
    gender, dob, phone, email, address, guardian_name, guardian_relation,
    guardian_phone, guardian_address, mother_name, admission_date,
    previous_school, admission_type, photo_path)
  values (
    sid, sch,
    coalesce(p_payload->>'reg_no', sid),
    p_payload->>'admission_no',
    p_payload->>'first_name', p_payload->>'middle_name', p_payload->>'last_name',
    coalesce(p_payload->>'gender', 'Male'),
    (p_payload->>'dob')::date,
    p_payload->>'phone', p_payload->>'email', p_payload->>'address',
    p_payload->>'guardian_name', p_payload->>'guardian_relation',
    p_payload->>'guardian_phone', p_payload->>'guardian_address',
    p_payload->>'mother_name',
    nullif(p_payload->>'admission_date','')::date,
    p_payload->>'previous_school', p_payload->>'admission_type',
    p_payload->>'photo_path')
  on conflict (id) do update set
    reg_no            = coalesce(excluded.reg_no, public.students.reg_no),
    admission_no      = excluded.admission_no,
    first_name        = excluded.first_name,
    middle_name       = excluded.middle_name,
    last_name         = excluded.last_name,
    gender            = excluded.gender,
    dob               = excluded.dob,
    phone             = excluded.phone,
    email             = excluded.email,
    address           = excluded.address,
    guardian_name     = excluded.guardian_name,
    guardian_relation = excluded.guardian_relation,
    guardian_phone    = excluded.guardian_phone,
    guardian_address  = excluded.guardian_address,
    mother_name       = excluded.mother_name,
    admission_date    = excluded.admission_date,
    previous_school   = excluded.previous_school,
    admission_type    = excluded.admission_type,
    photo_path        = coalesce(excluded.photo_path, public.students.photo_path);

  -- Enrollment for the selected year, if the caller supplied a placement.
  if (p_payload ? 'class_id') and (p_payload ? 'section_id') then
    insert into public.enrollments (id, student_id, year_id, class_id, section_id, roll_number, status, enrolled_on)
    values (yr || '-' || sid, sid, yr,
            p_payload->>'class_id', p_payload->>'section_id',
            nullif(p_payload->>'roll_number','')::integer, 'active', current_date)
    on conflict (student_id, year_id) do update set
      class_id    = excluded.class_id,
      section_id  = excluded.section_id,
      roll_number = excluded.roll_number;
  end if;

  perform public.log_action(
    case when is_new then 'student.create' else 'student.update' end, sid,
    btrim(coalesce(p_payload->>'first_name','') || ' ' || coalesce(p_payload->>'last_name','')));

  return jsonb_build_object('studentId', sid, 'created', is_new);
end $$;
grant execute on function public.save_student(jsonb,text) to authenticated;

create or replace function public.set_student_status(p_student_id text, p_status text)
returns jsonb language plpgsql security definer as $$
begin
  if not public.has_perm('students.edit') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if p_status not in ('active','transferred','withdrawn','graduated') then
    raise exception 'unknown status %', p_status;
  end if;
  update public.students set status = p_status where id = p_student_id;
  perform public.log_action('student.status', p_student_id, p_status);
  return jsonb_build_object('studentId', p_student_id, 'status', p_status);
end $$;
grant execute on function public.set_student_status(text,text) to authenticated;

/* =========================================================================
   File metadata — the browser used to insert into and delete from
   `file_objects` directly. It can't any more (there is no table surface), so
   these are the two named operations that replace it. Both re-check the
   owner relationship rather than trusting the caller's word for it.
   ========================================================================= */

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

  -- All three current owner types hang off a student, so the same check
  -- covers them. Add a branch here when a new owner type is introduced —
  -- and note that failing to do so denies access rather than granting it.
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
  perform public.log_action('file.delete', p_storage_key, f.original_name);
  return jsonb_build_object('deleted', 1);
end $$;
grant execute on function public.unregister_file(text) to authenticated;

/* =========================================================================
   Roles and user accounts — the last two things the browser used to write
   directly. Both are privilege-adjacent, which is exactly why they should
   never have been a raw table write: `profiles.role` and
   `role_permissions` decide what everyone else can do.
   ========================================================================= */

create or replace function public.save_role(p_payload jsonb)
returns jsonb language plpgsql security definer as $$
declare rid text := p_payload->>'id'; perms text[];
begin
  if not public.has_perm('roles.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if rid is null or btrim(rid) = '' then raise exception 'role id is required'; end if;

  -- A system role's identity is fixed; only its permission set may move.
  if exists (select 1 from public.role_defs where id = rid and is_system) then
    if coalesce(p_payload->>'name','') <> '' and
       (select name from public.role_defs where id = rid) <> (p_payload->>'name') then
      raise exception 'built-in roles cannot be renamed';
    end if;
  end if;

  insert into public.role_defs (id, name, description, is_system, all_permissions, applies_to, status)
  values (rid,
          coalesce(p_payload->>'name', rid),
          p_payload->>'description',
          false,
          coalesce((p_payload->>'all_permissions')::boolean, false),
          coalesce(array(select jsonb_array_elements_text(p_payload->'applies_to')), '{}'),
          coalesce(p_payload->>'status', 'active'))
  on conflict (id) do update set
    name            = excluded.name,
    description     = excluded.description,
    all_permissions = excluded.all_permissions,
    applies_to      = excluded.applies_to,
    status          = excluded.status;

  -- Replace the permission set atomically, and only with permissions that
  -- actually exist — a typo silently granting nothing is better than a typo
  -- inserting a row nothing ever checks.
  if p_payload ? 'permissions' then
    perms := array(select jsonb_array_elements_text(p_payload->'permissions'));
    delete from public.role_permissions where role_def_id = rid;
    insert into public.role_permissions (role_def_id, permission_id)
    select rid, p.id from public.permissions p where p.id = any(perms);
  end if;

  perform public.log_action('role.save', rid, p_payload->>'name');
  return jsonb_build_object('roleId', rid);
end $$;
grant execute on function public.save_role(jsonb) to authenticated;

create or replace function public.update_user_account(p_payload jsonb)
returns jsonb language plpgsql security definer as $$
declare uid uuid := (p_payload->>'id')::uuid; target public.profiles;
begin
  if not public.has_perm('users.manage') and not public.is_admin() then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  select * into target from public.profiles where id = uid;
  if target.id is null then raise exception 'unknown user'; end if;

  -- You cannot disable or demote yourself. Locking the last administrator
  -- out of their own system is a support call nobody enjoys.
  if uid = auth.uid() and (
       coalesce(p_payload->>'status', target.status) <> 'active'
       or coalesce(p_payload->>'role_def_id', target.role_def_id) <> target.role_def_id) then
    raise exception 'you cannot change your own role or status';
  end if;

  update public.profiles set
    full_name   = coalesce(p_payload->>'full_name', full_name),
    email       = coalesce(p_payload->>'email', email),
    phone       = coalesce(p_payload->>'phone', phone),
    role_def_id = coalesce(p_payload->>'role_def_id', role_def_id),
    status      = coalesce(p_payload->>'status', status)
  where id = uid;

  -- Guardian-to-child links, replaced as a set when supplied.
  if p_payload ? 'children' then
    delete from public.guardian_students where guardian_id = uid;
    insert into public.guardian_students (guardian_id, student_id)
    select uid, s.id from public.students s
    where s.id = any(array(select jsonb_array_elements_text(p_payload->'children')))
    on conflict do nothing;
  end if;

  perform public.log_action('user.update', uid::text, target.username);
  return jsonb_build_object('userId', uid);
end $$;
grant execute on function public.update_user_account(jsonb) to authenticated;


-- =================== 0027_fee_payment_detail.sql ===================
-- ===========================================================================
-- 0027_fee_payment_detail.sql — record_fee_payment keeps the transaction,
-- not just the new total.
--
-- WHY THIS EXISTS
-- 0006_fee_payments.sql added a `payments jsonb` column to fee_items so each
-- payment keeps its own method (cash / telebirr / cbe_birr / bank_transfer /
-- cheque), a reference number, and — for bank transfers — which bank it came
-- through. The UI (FeesPage.recordPayment) has always collected all of that.
--
-- But 0026_write_api.sql's record_fee_payment(fee_item_id, amount, note) only
-- ever touched the `paid` running total — it never appended to `payments`.
-- There was no server-side way to save the method/reference/bank at all, so
-- receipts and audit trails would have shown a number with no transaction
-- behind it. This replaces that function with one that does both, in the
-- same row-locked transaction.
--
-- The 3-argument signature is dropped rather than left as a second overload:
-- both versions accept (text, numeric, text) as their first three
-- parameters, and PostgREST/PostgreSQL can pick either when called by
-- argument name, so keeping both risks calling the wrong one silently.
-- ===========================================================================

drop function if exists public.record_fee_payment(text, numeric, text);

create or replace function public.record_fee_payment(
  p_fee_item_id text,
  p_amount numeric,
  p_method text default 'cash',
  p_reference text default null,
  p_bank text default null,
  p_note text default null)
returns jsonb language plpgsql security definer as $$
declare
  f public.fee_items;
  new_paid numeric;
  entry jsonb;
  recorder text;
begin
  if not public.has_perm('fees.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'payment amount must be positive';
  end if;
  if p_method not in ('cash','telebirr','cbe_birr','bank_transfer','cheque') then
    raise exception 'unknown payment method %', p_method;
  end if;
  if p_method <> 'cash' and coalesce(btrim(p_reference), '') = '' then
    raise exception '% requires a transaction reference', p_method;
  end if;

  -- Row lock: two bursars posting against the same fee at the same moment
  -- would otherwise both read the old `paid` and the second would overwrite
  -- the first. This is exactly the class of bug snapshot-diffing produced.
  select * into f from public.fee_items where id = p_fee_item_id for update;
  if f.id is null then raise exception 'unknown fee item %', p_fee_item_id; end if;
  if not public.year_is_open(f.year_id) then
    raise exception 'academic year % is closed', f.year_id using errcode = '42501';
  end if;

  new_paid := f.paid + p_amount;
  if new_paid > f.amount then
    raise exception 'payment of % exceeds the % outstanding', p_amount, f.amount - f.paid;
  end if;

  select full_name into recorder from public.profiles where id = auth.uid();

  entry := jsonb_build_object(
    'id', 'pay-' || replace(gen_random_uuid()::text, '-', ''),
    'amount', p_amount,
    'method', p_method,
    'reference', nullif(btrim(coalesce(p_reference, '')), ''),
    'bank', case when p_method = 'bank_transfer' then p_bank else null end,
    'date', to_char(now(), 'YYYY-MM-DD'),
    'recordedBy', recorder);

  update public.fee_items
     set paid = new_paid,
         payments = coalesce(payments, '[]'::jsonb) || jsonb_build_array(entry)
   where id = f.id;

  perform public.log_action('fees.payment', f.id,
    format('%s recorded against %s%s', p_amount, f.label,
           case when p_note is null then '' else ' — ' || p_note end));

  return jsonb_build_object(
    'feeItemId', f.id, 'paid', new_paid,
    'outstanding', f.amount - new_paid, 'entry', entry);
end $$;
grant execute on function public.record_fee_payment(text,numeric,text,text,text,text) to authenticated;


-- =================== 0028_fee_item_crud.sql ===================
-- ===========================================================================
-- 0028_fee_item_crud.sql — creating and removing a fee item, as named ops
--
-- 0026_write_api.sql gave `record_fee_payment` a real home but never covered
-- the other two fee_items writes the Fees page performs: billing a student
-- for a new item ("Add fee") and removing one that was added in error.
-- Both went through the generic upsert()/remove(), which 0026 disabled for
-- every table — so, same as students/marks/attendance/messages before this
-- round, they currently fail with "no longer go through snapshot syncing."
--
-- `apply_fee_template()` (0025) already covers billing a whole class at
-- once; `create_fee_item` is the one-student equivalent for a one-off charge
-- outside any template.
-- ===========================================================================

create or replace function public.create_fee_item(
  p_student_id text, p_label text, p_amount numeric, p_due_date date default null,
  p_year_id text default null)
returns jsonb language plpgsql security definer as $$
declare
  fid text := 'fee-' || replace(gen_random_uuid()::text, '-', '');
  yr text := coalesce(p_year_id, public.current_year_id());
begin
  if not public.has_perm('fees.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if not public.can_view_student(p_student_id) then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if coalesce(btrim(p_label), '') = '' then raise exception 'a label is required'; end if;
  if p_amount is null or p_amount <= 0 then raise exception 'amount must be positive'; end if;
  if not public.year_is_open(yr) then
    raise exception 'academic year % is closed', yr using errcode = '42501';
  end if;

  insert into public.fee_items (id, student_id, label, amount, paid, due_date, year_id, payments)
  values (fid, p_student_id, btrim(p_label), p_amount, 0, p_due_date, yr, '[]'::jsonb);

  perform public.log_action('fees.create', fid, format('%s — %s', btrim(p_label), p_amount));
  return jsonb_build_object('feeItemId', fid);
end $$;
grant execute on function public.create_fee_item(text,text,numeric,date,text) to authenticated;

-- ===========================================================================
-- mark_message_read — the other half of 0026's send_message.
--
-- send_message() covers sending; nothing covered a message's read_by flip
-- (sent → read), so it went through the same disabled generic upsert as
-- everything else in this file. Realtime (0013) streams the change once
-- it happens — this is what makes it happen.
-- ===========================================================================

create or replace function public.mark_message_read(p_conversation_id text)
returns integer language plpgsql security definer as $$
declare n int;
begin
  if not public.is_conversation_member(p_conversation_id) then
    raise exception 'not permitted' using errcode = '42501';
  end if;

  update public.messages
     set read_by = read_by || array[auth.uid()]
   where conversation_id = p_conversation_id
     and sender_id <> auth.uid()
     and not (auth.uid() = any(read_by));
  get diagnostics n = row_count;
  return n;
end $$;
grant execute on function public.mark_message_read(text) to authenticated;

-- ===========================================================================
-- delete_role — RolesPage has always offered to delete a custom (non-system)
-- role. 0026's save_role covers create/update; nothing covered delete, so it
-- fell through to the same disabled generic remove() as everything else.
-- ===========================================================================

create or replace function public.delete_role(p_role_id text)
returns jsonb language plpgsql security definer as $$
declare r public.role_defs;
begin
  if not public.has_perm('roles.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  select * into r from public.role_defs where id = p_role_id;
  if r.id is null then return jsonb_build_object('deleted', 0); end if;
  if r.is_system then raise exception 'system roles cannot be deleted'; end if;
  if exists (select 1 from public.profiles where role_def_id = r.id) then
    raise exception 'cannot delete a role that is still assigned to a user';
  end if;

  delete from public.role_defs where id = r.id; -- role_permissions cascades
  perform public.log_action('role.delete', p_role_id, r.name);
  return jsonb_build_object('deleted', 1);
end $$;
grant execute on function public.delete_role(text) to authenticated;

create or replace function public.delete_fee_item(p_fee_item_id text)
returns jsonb language plpgsql security definer as $$
declare f public.fee_items;
begin
  if not public.has_perm('fees.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  select * into f from public.fee_items where id = p_fee_item_id;
  if f.id is null then return jsonb_build_object('deleted', 0); end if;
  if f.paid > 0 then
    raise exception 'cannot delete a fee item that already has payments recorded against it';
  end if;

  delete from public.fee_items where id = f.id;
  perform public.log_action('fees.delete', p_fee_item_id, f.label);
  return jsonb_build_object('deleted', 1);
end $$;
grant execute on function public.delete_fee_item(text) to authenticated;


-- =================== 0029_save_student_stable_id.sql ===================
-- ===========================================================================
-- 0029_save_student_stable_id.sql — a new student keeps the id the client
-- already gave it.
--
-- THE PROBLEM
-- save_student() (0026) decided "is this a create or an edit?" by whether
-- p_payload had an `id`: no id → generate one server-side. That matches a
-- UUID-keyed table, but students are the one entity this schema's own header
-- comment (0001_schema.sql) says keeps client-assigned short text ids
-- ("Text PKs preserve the application's existing identifiers"), and the
-- Registration wizard has always generated that id up front — before the
-- record is saved, and before it's known whether a login account will be
-- created in the same action.
--
-- Sending no id to let the server mint its own would leave the client
-- holding one id (used locally, and already wired into a new login
-- account's student_id in the same save) while the server used a different
-- one — a silent mismatch that would only surface later as a guardian or
-- teacher whose account points at a student that doesn't exist.
--
-- THE FIX
-- Always accept the client's id. "Is this new?" is now answered by whether
-- a row with that id already exists, not by whether an id was supplied —
-- which also means students.create vs students.edit is checked against
-- reality, not against what the client happened to send.
-- ===========================================================================

create or replace function public.save_student(p_payload jsonb, p_year_id text default null)
returns jsonb language plpgsql security definer as $$
declare
  sid text := nullif(p_payload->>'id', '');
  yr  text := coalesce(p_year_id, public.current_year_id());
  sch text;
  is_new boolean;
begin
  if sid is null then
    raise exception 'a student id is required';
  end if;
  is_new := not exists (select 1 from public.students where id = sid);

  if is_new then
    if not public.has_perm('students.create') then
      raise exception 'not permitted' using errcode = '42501';
    end if;
  else
    if not public.has_perm('students.edit') then
      raise exception 'not permitted' using errcode = '42501';
    end if;
  end if;

  select id into sch from public.schools order by id limit 1;

  insert into public.students (
    id, school_id, reg_no, admission_no, first_name, middle_name, last_name,
    gender, dob, phone, email, address, guardian_name, guardian_relation,
    guardian_phone, guardian_address, mother_name, admission_date,
    previous_school, admission_type, photo_path)
  values (
    sid, sch,
    coalesce(p_payload->>'reg_no', sid),
    p_payload->>'admission_no',
    p_payload->>'first_name', p_payload->>'middle_name', p_payload->>'last_name',
    coalesce(p_payload->>'gender', 'Male'),
    (p_payload->>'dob')::date,
    p_payload->>'phone', p_payload->>'email', p_payload->>'address',
    p_payload->>'guardian_name', p_payload->>'guardian_relation',
    p_payload->>'guardian_phone', p_payload->>'guardian_address',
    p_payload->>'mother_name',
    nullif(p_payload->>'admission_date','')::date,
    p_payload->>'previous_school', p_payload->>'admission_type',
    p_payload->>'photo_path')
  on conflict (id) do update set
    reg_no            = coalesce(excluded.reg_no, public.students.reg_no),
    admission_no      = excluded.admission_no,
    first_name        = excluded.first_name,
    middle_name       = excluded.middle_name,
    last_name         = excluded.last_name,
    gender            = excluded.gender,
    dob               = excluded.dob,
    phone             = excluded.phone,
    email             = excluded.email,
    address           = excluded.address,
    guardian_name     = excluded.guardian_name,
    guardian_relation = excluded.guardian_relation,
    guardian_phone    = excluded.guardian_phone,
    guardian_address  = excluded.guardian_address,
    mother_name       = excluded.mother_name,
    admission_date    = excluded.admission_date,
    previous_school   = excluded.previous_school,
    admission_type    = excluded.admission_type,
    photo_path        = coalesce(excluded.photo_path, public.students.photo_path);

  if (p_payload ? 'class_id') and (p_payload ? 'section_id') then
    insert into public.enrollments (id, student_id, year_id, class_id, section_id, roll_number, status, enrolled_on)
    values (yr || '-' || sid, sid, yr,
            p_payload->>'class_id', p_payload->>'section_id',
            nullif(p_payload->>'roll_number','')::integer, 'active', current_date)
    on conflict (student_id, year_id) do update set
      class_id    = excluded.class_id,
      section_id  = excluded.section_id,
      roll_number = excluded.roll_number;
  end if;

  perform public.log_action(
    case when is_new then 'student.create' else 'student.update' end, sid,
    btrim(coalesce(p_payload->>'first_name','') || ' ' || coalesce(p_payload->>'last_name','')));

  return jsonb_build_object('studentId', sid, 'created', is_new);
end $$;
grant execute on function public.save_student(jsonb,text) to authenticated;


-- =================== 0030_write_api_structure.sql ===================
-- ===========================================================================
-- 0030_write_api_structure.sql — the rest of the write surface
--
-- 0026/0027/0028/0029 covered students, marks, attendance, fees, roles,
-- messages and user accounts. Everything else the app can save — classes,
-- sections, subjects, teachers, teacher assignments, homework, timetable
-- entries, announcements, events, starting a conversation, and reviewing a
-- guardian's bank-transfer receipt — still fell through to the same
-- disabled generic upsert()/remove() as those did before this round. Same
-- fix, same pattern, applied to what's left.
--
-- A few of these add a guard 0026 didn't need: deleting a class, subject or
-- teacher that's still in active use (an enrollment, an assignment) is
-- refused with a clear reason rather than silently orphaning rows that
-- foreign keys would otherwise cascade-delete out from under a live
-- school — e.g. deleting a class quietly un-enrolling every student in it.
-- ===========================================================================

/* ============================= classes ============================= */

create or replace function public.save_class(p_payload jsonb)
returns jsonb language plpgsql security definer as $$
declare cid text := p_payload->>'id'; sch text; sec jsonb;
begin
  if not public.has_perm('academics.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if coalesce(btrim(p_payload->>'name'), '') = '' then raise exception 'a class name is required'; end if;
  if cid is null or btrim(cid) = '' then raise exception 'a class id is required'; end if;

  select id into sch from public.schools order by id limit 1;

  insert into public.classes (id, school_id, name, level)
  values (cid, sch, btrim(p_payload->>'name'), coalesce((p_payload->>'level')::integer, 0))
  on conflict (id) do update set name = excluded.name, level = excluded.level, updated_at = now();

  if p_payload ? 'sections' then
    delete from public.sections s
    where s.class_id = cid
      and not (s.id = any(array(select jsonb_array_elements(p_payload->'sections') ->> 'id')));
    for sec in select jsonb_array_elements(p_payload->'sections') loop
      insert into public.sections (id, class_id, name)
      values (sec->>'id', cid, sec->>'name')
      on conflict (id) do update set name = excluded.name;
    end loop;
  end if;

  perform public.log_action('class.save', cid, p_payload->>'name');
  return jsonb_build_object('classId', cid);
end $$;
grant execute on function public.save_class(jsonb) to authenticated;

create or replace function public.delete_class(p_class_id text)
returns jsonb language plpgsql security definer as $$
begin
  if not public.has_perm('academics.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if exists (select 1 from public.enrollments where class_id = p_class_id and status = 'active') then
    raise exception 'cannot delete a class with actively enrolled students';
  end if;
  delete from public.classes where id = p_class_id;
  perform public.log_action('class.delete', p_class_id);
  return jsonb_build_object('deleted', 1);
end $$;
grant execute on function public.delete_class(text) to authenticated;

/* ============================= subjects ============================= */

create or replace function public.save_subject(p_payload jsonb)
returns jsonb language plpgsql security definer as $$
declare sid text := p_payload->>'id'; sch text;
begin
  if not public.has_perm('academics.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if sid is null or btrim(sid) = '' then raise exception 'a subject id is required'; end if;
  if coalesce(btrim(p_payload->>'name'), '') = '' then raise exception 'a subject name is required'; end if;
  if coalesce(btrim(p_payload->>'code'), '') = '' then raise exception 'a subject code is required'; end if;

  select id into sch from public.schools order by id limit 1;

  insert into public.subjects (id, school_id, code, name, color)
  values (sid, sch, upper(btrim(p_payload->>'code')), btrim(p_payload->>'name'), p_payload->>'color')
  on conflict (id) do update set
    code = excluded.code, name = excluded.name, color = excluded.color, updated_at = now();

  perform public.log_action('subject.save', sid, p_payload->>'name');
  return jsonb_build_object('subjectId', sid);
end $$;
grant execute on function public.save_subject(jsonb) to authenticated;

create or replace function public.delete_subject(p_subject_id text)
returns jsonb language plpgsql security definer as $$
begin
  if not public.has_perm('academics.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if exists (select 1 from public.teacher_assignments where subject_id = p_subject_id) then
    raise exception 'cannot delete a subject that still has teacher assignments';
  end if;
  delete from public.subjects where id = p_subject_id;
  perform public.log_action('subject.delete', p_subject_id);
  return jsonb_build_object('deleted', 1);
end $$;
grant execute on function public.delete_subject(text) to authenticated;

/* ============================= teachers ============================= */

create or replace function public.save_teacher(p_payload jsonb)
returns jsonb language plpgsql security definer as $$
declare tid text := p_payload->>'id'; sch text;
begin
  if not public.has_perm('teachers.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if tid is null or btrim(tid) = '' then raise exception 'a teacher id is required'; end if;
  if coalesce(btrim(p_payload->>'name'), '') = '' then raise exception 'a teacher name is required'; end if;

  select id into sch from public.schools order by id limit 1;

  insert into public.teachers (id, school_id, name, phone, email, specialty)
  values (tid, sch, btrim(p_payload->>'name'), p_payload->>'phone', p_payload->>'email', p_payload->>'specialty')
  on conflict (id) do update set
    name = excluded.name, phone = excluded.phone, email = excluded.email,
    specialty = excluded.specialty, updated_at = now();

  perform public.log_action('teacher.save', tid, p_payload->>'name');
  return jsonb_build_object('teacherId', tid);
end $$;
grant execute on function public.save_teacher(jsonb) to authenticated;

create or replace function public.delete_teacher(p_teacher_id text)
returns jsonb language plpgsql security definer as $$
begin
  if not public.has_perm('teachers.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if exists (select 1 from public.teacher_assignments where teacher_id = p_teacher_id) then
    raise exception 'cannot delete a teacher with active class assignments';
  end if;
  delete from public.teachers where id = p_teacher_id;
  perform public.log_action('teacher.delete', p_teacher_id);
  return jsonb_build_object('deleted', 1);
end $$;
grant execute on function public.delete_teacher(text) to authenticated;

/* ======================= teacher assignments ======================= */

create or replace function public.save_assignment(p_payload jsonb)
returns jsonb language plpgsql security definer as $$
declare aid text := coalesce(p_payload->>'id', 'asg-' || replace(gen_random_uuid()::text, '-', ''));
begin
  if not public.has_perm('academics.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  insert into public.teacher_assignments (id, year_id, class_id, section_id, subject_id, teacher_id)
  values (aid, p_payload->>'year_id', p_payload->>'class_id', p_payload->>'section_id',
          p_payload->>'subject_id', p_payload->>'teacher_id')
  on conflict (id) do update set
    class_id = excluded.class_id, section_id = excluded.section_id,
    subject_id = excluded.subject_id, teacher_id = excluded.teacher_id;
  perform public.log_action('assignment.save', aid, null);
  return jsonb_build_object('assignmentId', aid);
end $$;
grant execute on function public.save_assignment(jsonb) to authenticated;

create or replace function public.delete_assignment(p_assignment_id text)
returns jsonb language plpgsql security definer as $$
begin
  if not public.has_perm('academics.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  delete from public.teacher_assignments where id = p_assignment_id;
  perform public.log_action('assignment.delete', p_assignment_id);
  return jsonb_build_object('deleted', 1);
end $$;
grant execute on function public.delete_assignment(text) to authenticated;

/* ============================= homework ============================= */

create or replace function public.save_homework(p_payload jsonb)
returns jsonb language plpgsql security definer as $$
declare hid text := coalesce(p_payload->>'id', 'hw-' || replace(gen_random_uuid()::text, '-', ''));
begin
  if not public.has_perm('homework.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  insert into public.homework (id, year_id, class_id, section_id, subject_id, title, description, issued, due)
  values (hid, p_payload->>'year_id', p_payload->>'class_id', p_payload->>'section_id', p_payload->>'subject_id',
          btrim(p_payload->>'title'), p_payload->>'description',
          coalesce((p_payload->>'issued')::date, current_date), (p_payload->>'due')::date)
  on conflict (id) do update set
    class_id = excluded.class_id, section_id = excluded.section_id, subject_id = excluded.subject_id,
    title = excluded.title, description = excluded.description, due = excluded.due, updated_at = now();
  perform public.log_action('homework.save', hid, p_payload->>'title');
  return jsonb_build_object('homeworkId', hid);
end $$;
grant execute on function public.save_homework(jsonb) to authenticated;

-- A separate, narrower operation from save_homework() on purpose: marking
-- a homework item submitted is done by two different kinds of caller — a
-- teacher/admin ticking off the class roster, and a student marking their
-- own — and the second group will never hold homework.manage. Gating the
-- whole row (title/description/due) behind homework.manage while gating
-- just this one array behind "is this your own submission" keeps a
-- student's access exactly as wide as it needs to be and no wider.
create or replace function public.toggle_homework_submission(p_homework_id text, p_student_id text)
returns jsonb language plpgsql security definer as $$
declare h public.homework; now_submitted boolean;
begin
  if not public.has_perm('homework.manage') then
    if not exists (select 1 from public.profiles where id = auth.uid() and student_id = p_student_id) then
      raise exception 'not permitted' using errcode = '42501';
    end if;
  end if;

  select * into h from public.homework where id = p_homework_id;
  if h.id is null then raise exception 'unknown homework %', p_homework_id; end if;

  if p_student_id = any(h.submitted_students) then
    update public.homework set submitted_students = array_remove(submitted_students, p_student_id) where id = h.id;
    now_submitted := false;
  else
    update public.homework set submitted_students = array_append(submitted_students, p_student_id) where id = h.id;
    now_submitted := true;
  end if;

  return jsonb_build_object('homeworkId', h.id, 'studentId', p_student_id, 'submitted', now_submitted);
end $$;
grant execute on function public.toggle_homework_submission(text,text) to authenticated;

create or replace function public.delete_homework(p_homework_id text)
returns jsonb language plpgsql security definer as $$
begin
  if not public.has_perm('homework.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  delete from public.homework where id = p_homework_id;
  perform public.log_action('homework.delete', p_homework_id);
  return jsonb_build_object('deleted', 1);
end $$;
grant execute on function public.delete_homework(text) to authenticated;

/* =========================== timetable =========================== */

create or replace function public.save_timetable_entry(p_payload jsonb)
returns jsonb language plpgsql security definer as $$
declare eid text := coalesce(p_payload->>'id', 'tt-' || replace(gen_random_uuid()::text, '-', ''));
begin
  if not public.has_perm('academics.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  insert into public.timetable_entries (id, class_id, section_id, day, period, subject_id, room)
  values (eid, p_payload->>'class_id', p_payload->>'section_id',
          (p_payload->>'day')::integer, (p_payload->>'period')::integer,
          p_payload->>'subject_id', p_payload->>'room')
  on conflict (id) do update set subject_id = excluded.subject_id, room = excluded.room;
  perform public.log_action('timetable.save', eid, null);
  return jsonb_build_object('entryId', eid);
end $$;
grant execute on function public.save_timetable_entry(jsonb) to authenticated;

create or replace function public.delete_timetable_entry(
  p_class_id text, p_section_id text, p_day integer, p_period integer)
returns jsonb language plpgsql security definer as $$
begin
  if not public.has_perm('academics.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  delete from public.timetable_entries
   where class_id = p_class_id and section_id = p_section_id and day = p_day and period = p_period;
  perform public.log_action('timetable.delete', p_class_id || '/' || p_section_id, format('day %s period %s', p_day, p_period));
  return jsonb_build_object('deleted', 1);
end $$;
grant execute on function public.delete_timetable_entry(text,text,integer,integer) to authenticated;

/* ===================== assessment structures ===================== */

create or replace function public.save_assessment_structure(p_payload jsonb)
returns jsonb language plpgsql security definer as $$
declare sid text := coalesce(p_payload->>'id', 'as-' || replace(gen_random_uuid()::text, '-', '')); it jsonb;
begin
  if not public.has_perm('exams.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  insert into public.assessment_structures (id, year_id, class_id, subject_id, term_id)
  values (sid, p_payload->>'year_id', p_payload->>'class_id', p_payload->>'subject_id', p_payload->>'term_id')
  on conflict (id) do update set
    class_id = excluded.class_id, subject_id = excluded.subject_id, term_id = excluded.term_id, updated_at = now();

  if p_payload ? 'items' then
    delete from public.assessment_items i
    where i.structure_id = sid
      and not (i.id = any(array(select jsonb_array_elements(p_payload->'items') ->> 'id')));
    for it in select jsonb_array_elements(p_payload->'items') loop
      insert into public.assessment_items (id, structure_id, name, max_mark, weight, sort)
      values (it->>'id', sid, it->>'name', (it->>'max')::numeric, (it->>'weight')::numeric,
              coalesce((it->>'sort')::integer, 0))
      on conflict (id) do update set
        name = excluded.name, max_mark = excluded.max_mark, weight = excluded.weight, sort = excluded.sort;
    end loop;
  end if;

  perform public.log_action('assessment.save', sid, p_payload->>'period');
  return jsonb_build_object('structureId', sid);
end $$;
grant execute on function public.save_assessment_structure(jsonb) to authenticated;

create or replace function public.delete_assessment_structure(p_structure_id text)
returns jsonb language plpgsql security definer as $$
begin
  if not public.has_perm('exams.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if exists (select 1 from public.assessment_marks where structure_id = p_structure_id) then
    raise exception 'cannot delete an assessment that already has marks entered against it';
  end if;
  delete from public.assessment_structures where id = p_structure_id;
  perform public.log_action('assessment.delete', p_structure_id);
  return jsonb_build_object('deleted', 1);
end $$;
grant execute on function public.delete_assessment_structure(text) to authenticated;

/* =========================== communication =========================== */

create or replace function public.save_announcement(p_payload jsonb)
returns jsonb language plpgsql security definer as $$
declare aid text := p_payload->>'id'; is_new boolean;
begin
  is_new := aid is null or btrim(aid) = '';
  if is_new then
    if not public.has_perm('communication.create_announcement') then
      raise exception 'not permitted' using errcode = '42501';
    end if;
    aid := 'ann-' || replace(gen_random_uuid()::text, '-', '');
  else
    if not public.has_perm('communication.manage_announcement') and not public.has_perm('communication.create_announcement') then
      raise exception 'not permitted' using errcode = '42501';
    end if;
  end if;

  insert into public.announcements (id, title, body, category, sender_id, audience, status, scheduled_for, published_at, pinned)
  values (aid, p_payload->>'title', p_payload->>'body', p_payload->>'category', auth.uid(),
          coalesce(p_payload->'audience', '{"kind":"everyone"}'::jsonb),
          coalesce(p_payload->>'status', 'draft'),
          nullif(p_payload->>'scheduled_for','')::timestamptz,
          case when p_payload->>'status' = 'published' then now() else nullif(p_payload->>'published_at','')::timestamptz end,
          coalesce((p_payload->>'pinned')::boolean, false))
  on conflict (id) do update set
    title = excluded.title, body = excluded.body, category = excluded.category,
    audience = excluded.audience, status = excluded.status,
    scheduled_for = excluded.scheduled_for,
    published_at = coalesce(public.announcements.published_at, excluded.published_at),
    pinned = excluded.pinned, updated_at = now();

  perform public.log_action(case when is_new then 'announcement.create' else 'announcement.update' end, aid, p_payload->>'title');
  return jsonb_build_object('announcementId', aid);
end $$;
grant execute on function public.save_announcement(jsonb) to authenticated;

create or replace function public.save_event(p_payload jsonb)
returns jsonb language plpgsql security definer as $$
declare eid text := coalesce(nullif(p_payload->>'id',''), 'evt-' || replace(gen_random_uuid()::text, '-', ''));
begin
  if not public.has_perm('events.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  insert into public.events (id, title, description, day, time_of_day, location, category, audience, created_by)
  values (eid, p_payload->>'title', p_payload->>'description', (p_payload->>'day')::date,
          p_payload->>'time_of_day', p_payload->>'location', p_payload->>'category',
          coalesce(p_payload->'audience', '{"kind":"everyone"}'::jsonb), auth.uid())
  on conflict (id) do update set
    title = excluded.title, description = excluded.description, day = excluded.day,
    time_of_day = excluded.time_of_day, location = excluded.location, category = excluded.category,
    audience = excluded.audience, updated_at = now();
  perform public.log_action('event.save', eid, p_payload->>'title');
  return jsonb_build_object('eventId', eid);
end $$;
grant execute on function public.save_event(jsonb) to authenticated;

create or replace function public.delete_event(p_event_id text)
returns jsonb language plpgsql security definer as $$
begin
  if not public.has_perm('events.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  delete from public.events where id = p_event_id;
  perform public.log_action('event.delete', p_event_id);
  return jsonb_build_object('deleted', 1);
end $$;
grant execute on function public.delete_event(text) to authenticated;

/* ========================= conversations ========================= */

create or replace function public.start_conversation(
  p_other_profile_id uuid, p_related_student_id text default null,
  p_related_class_id text default null, p_related_section_id text default null,
  p_related_subject_id text default null)
returns jsonb language plpgsql security definer as $$
declare cid text; existing text;
begin
  if not public.has_perm('communication.send') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if p_other_profile_id is null or p_other_profile_id = auth.uid() then
    raise exception 'a conversation needs a real other participant';
  end if;

  -- Reuse an existing direct conversation between exactly these two people
  -- rather than spawning a duplicate every time "message" is clicked.
  select c.id into existing
  from public.conversations c
  where c.type = 'direct'
    and exists (select 1 from public.conversation_participants p1 where p1.conversation_id = c.id and p1.profile_id = auth.uid())
    and exists (select 1 from public.conversation_participants p2 where p2.conversation_id = c.id and p2.profile_id = p_other_profile_id)
    and (select count(*) from public.conversation_participants p where p.conversation_id = c.id) = 2
  limit 1;

  if existing is not null then
    return jsonb_build_object('conversationId', existing, 'created', false);
  end if;

  cid := 'conv-' || replace(gen_random_uuid()::text, '-', '');
  insert into public.conversations (id, type, related_student_id, related_class_id, related_section_id, related_subject_id, status)
  values (cid, 'direct', p_related_student_id, p_related_class_id, p_related_section_id, p_related_subject_id, 'active');
  insert into public.conversation_participants (conversation_id, profile_id) values (cid, auth.uid()), (cid, p_other_profile_id);

  perform public.log_action('conversation.start', cid, null);
  return jsonb_build_object('conversationId', cid, 'created', true);
end $$;
grant execute on function public.start_conversation(uuid,text,text,text,text) to authenticated;

create or replace function public.set_conversation_status(p_conversation_id text, p_status text)
returns jsonb language plpgsql security definer as $$
begin
  if not public.is_conversation_member(p_conversation_id) then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if p_status not in ('active','archived','hidden') then raise exception 'unknown status %', p_status; end if;
  update public.conversations set status = p_status, updated_at = now() where id = p_conversation_id;
  return jsonb_build_object('conversationId', p_conversation_id, 'status', p_status);
end $$;
grant execute on function public.set_conversation_status(text,text) to authenticated;

/* ================= fee payment request review ================= */

create or replace function public.review_fee_payment_request(
  p_request_id text, p_status text, p_note text default null)
returns jsonb language plpgsql security definer as $$
declare r public.fee_payment_requests; f public.fee_items; entry jsonb; new_paid numeric;
begin
  if not public.has_perm('fees.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if p_status not in ('approved','rejected') then raise exception 'unknown status %', p_status; end if;

  select * into r from public.fee_payment_requests where id = p_request_id for update;
  if r.id is null then raise exception 'unknown payment request %', p_request_id; end if;
  if r.status <> 'pending' then raise exception 'this request has already been reviewed'; end if;

  update public.fee_payment_requests set
    status = p_status, reviewed_by = auth.uid(),
    reviewed_by_name = (select full_name from public.profiles where id = auth.uid()),
    reviewed_at = now(), review_note = p_note
  where id = r.id;

  if p_status = 'approved' then
    select * into f from public.fee_items where id = r.fee_item_id for update;
    if f.id is null then raise exception 'the fee item this request was for no longer exists'; end if;
    new_paid := least(f.amount, f.paid + r.amount);

    entry := jsonb_build_object(
      'id', 'pay-' || replace(gen_random_uuid()::text, '-', ''),
      'amount', r.amount, 'method', 'bank_transfer', 'reference', r.reference, 'bank', r.bank_name,
      'date', to_char(now(), 'YYYY-MM-DD'),
      'recordedBy', (select full_name from public.profiles where id = auth.uid()));

    update public.fee_items
       set paid = new_paid, payments = coalesce(payments, '[]'::jsonb) || jsonb_build_array(entry)
     where id = f.id;
  end if;

  perform public.log_action('fees.payment.' || p_status, p_request_id, p_note);
  return jsonb_build_object('requestId', p_request_id, 'status', p_status);
end $$;
grant execute on function public.review_fee_payment_request(text,text,text) to authenticated;

/* ============================= settings ============================= */

create or replace function public.update_school_settings(
  p_name text default null, p_motto text default null, p_bank_accounts text default null)
returns jsonb language plpgsql security definer as $$
declare sch text; accounts jsonb;
begin
  if not public.has_perm('settings.manage') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if p_bank_accounts is not null then
    begin
      accounts := p_bank_accounts::jsonb;
    exception when others then
      raise exception 'bank accounts payload is not valid JSON';
    end;
    if jsonb_typeof(accounts) <> 'array' then
      raise exception 'bank accounts must be a JSON array';
    end if;
  end if;

  select id into sch from public.schools order by id limit 1;
  update public.schools set
    name = coalesce(p_name, name),
    motto = coalesce(p_motto, motto),
    bank_accounts = coalesce(accounts, bank_accounts)
  where id = sch;
  perform public.log_action('settings.update', sch, p_name);
  return jsonb_build_object('schoolId', sch);
end $$;
grant execute on function public.update_school_settings(text,text,text) to authenticated;


-- =================== 0031_year_lifecycle_fixes.sql ===================
-- ===========================================================================
-- 0031_year_lifecycle_fixes.sql
--
-- TWO PROBLEMS, ONE FILE
--
-- 1. A real permission bug, not just a missing operation. 0010 deliberately
--    split "manage academic years & terms" into its own permission
--    (academics.manage_years) so a school could grant "manage classes"
--    without also granting "restructure the academic calendar" — and wired
--    the RLS policies on academic_years/terms to check it. But
--    0025_year_lifecycle.sql, written after 0010, checks the broader
--    academics.manage in set_active_year, close_year, rollover_year and
--    create_academic_year instead. A role holding only
--    academics.manage_years — exactly the case 0010 exists to support —
--    would see the Academic Years page (the client checks the right
--    permission) and then get "not permitted" from every action on it.
--    This redefines all four with the permission 0010 actually introduced.
--
-- 2. Missing operations. AcademicYearsPage has always supported editing an
--    existing year's name/dates, and creating/editing/deleting individual
--    terms one at a time — none of which 0025 or 0026 gave a named
--    operation to. update_academic_year, delete_academic_year, save_term
--    and delete_term fill that in, with the same in-use guards the client
--    already checks re-verified server-side rather than trusted from the
--    client alone.
-- ===========================================================================

create or replace function public.set_active_year(p_year_id text)
returns void language plpgsql security definer as $$
declare sid text;
begin
  if not public.has_perm('academics.manage_years') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  select school_id into sid from public.academic_years where id = p_year_id;
  if sid is null then raise exception 'unknown academic year %', p_year_id; end if;

  update public.academic_years set is_active = false where school_id = sid and is_active;
  update public.academic_years set is_active = true, status = 'open' where id = p_year_id;

  perform public.log_action('year.activate', p_year_id, 'Active academic year switched');
end $$;
grant execute on function public.set_active_year(text) to authenticated;

create or replace function public.close_year(p_year_id text)
returns void language plpgsql security definer as $$
begin
  if not public.has_perm('academics.manage_years') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if (select is_active from public.academic_years where id = p_year_id) then
    raise exception 'cannot close the active year — activate the next year first';
  end if;
  update public.academic_years set status = 'closed' where id = p_year_id;
  perform public.log_action('year.close', p_year_id, 'Academic year closed to further edits');
end $$;
grant execute on function public.close_year(text) to authenticated;

create or replace function public.rollover_year(
  p_from_year text,
  p_to_year   text,
  p_copy_assignments boolean default true,
  p_copy_timetable   boolean default true,
  p_copy_structures  boolean default true,
  p_copy_fees        boolean default true
)
returns jsonb language plpgsql security definer as $$
declare
  n_assign int := 0; n_time int := 0; n_struct int := 0;
  n_items int := 0; n_bands int := 0; n_fees int := 0;
  term_map jsonb := '{}'::jsonb;
begin
  if not public.has_perm('academics.manage_years') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if p_from_year = p_to_year then raise exception 'source and target year are the same'; end if;
  if not exists (select 1 from public.academic_years where id = p_from_year) then
    raise exception 'unknown source year %', p_from_year; end if;
  if not public.year_is_open(p_to_year) then
    raise exception 'target year % is closed', p_to_year; end if;

  select coalesce(jsonb_object_agg(f.id, t.id), '{}'::jsonb) into term_map
  from public.terms f
  join public.terms t on t.year_id = p_to_year and t.seq = f.seq
  where f.year_id = p_from_year;

  if p_copy_assignments then
    insert into public.teacher_assignments (id, year_id, class_id, section_id, subject_id, teacher_id)
    select p_to_year || '-' || md5(a.class_id || a.section_id || a.subject_id),
           p_to_year, a.class_id, a.section_id, a.subject_id, a.teacher_id
    from public.teacher_assignments a
    where a.year_id = p_from_year
    on conflict (year_id, class_id, section_id, subject_id) do nothing;
    get diagnostics n_assign = row_count;
  end if;

  if p_copy_timetable then
    insert into public.timetable_entries (id, year_id, class_id, section_id, day, period, subject_id, room)
    select p_to_year || '-tt-' || md5(t.class_id || t.section_id || t.day || t.period),
           p_to_year, t.class_id, t.section_id, t.day, t.period, t.subject_id, t.room
    from public.timetable_entries t
    where t.year_id = p_from_year
    on conflict do nothing;
    get diagnostics n_time = row_count;
  end if;

  insert into public.grade_bands (id, school_id, year_id, min_pct, max_pct, grade, remark, sort)
  select p_to_year || '-gb-' || g.sort, g.school_id, p_to_year,
         g.min_pct, g.max_pct, g.grade, g.remark, g.sort
  from public.grade_bands g
  where g.year_id = p_from_year
  on conflict do nothing;
  get diagnostics n_bands = row_count;

  if p_copy_structures then
    insert into public.assessment_structures (id, year_id, class_id, subject_id, term_id)
    select p_to_year || '-as-' || md5(s.class_id || s.subject_id || coalesce(s.term_id,'')),
           p_to_year, s.class_id, s.subject_id, (term_map->>s.term_id)
    from public.assessment_structures s
    where s.year_id = p_from_year
      and (s.term_id is null or term_map ? s.term_id)
    on conflict (year_id, class_id, subject_id, term_id) do nothing;
    get diagnostics n_struct = row_count;

    insert into public.assessment_items (id, structure_id, name, max_mark, weight, sort)
    select md5(ns.id || i.name || i.sort), ns.id, i.name, i.max_mark, i.weight, i.sort
    from public.assessment_structures os
    join public.assessment_items i on i.structure_id = os.id
    join public.assessment_structures ns
      on ns.year_id = p_to_year and ns.class_id = os.class_id
     and ns.subject_id = os.subject_id
     and ns.term_id is not distinct from (term_map->>os.term_id)
    where os.year_id = p_from_year
    on conflict do nothing;
    get diagnostics n_items = row_count;
  end if;

  if p_copy_fees then
    insert into public.fee_templates (id, year_id, class_id, term_id, label, amount, due_date)
    select p_to_year || '-ft-' || md5(coalesce(f.class_id,'*') || f.label),
           p_to_year, f.class_id, (term_map->>f.term_id), f.label, f.amount, null
    from public.fee_templates f
    where f.year_id = p_from_year
    on conflict (year_id, class_id, term_id, label) do nothing;
    get diagnostics n_fees = row_count;
  end if;

  perform public.log_action('year.rollover', p_to_year, format('Structure copied from %s', p_from_year));

  return jsonb_build_object(
    'fromYear', p_from_year, 'toYear', p_to_year,
    'assignments', n_assign, 'timetable', n_time, 'gradeBands', n_bands,
    'structures', n_struct, 'assessmentItems', n_items, 'feeTemplates', n_fees);
end $$;
grant execute on function public.rollover_year(text,text,boolean,boolean,boolean,boolean) to authenticated;

create or replace function public.create_academic_year(
  p_id text, p_name text, p_start date, p_end date, p_terms text[] default '{}')
returns jsonb language plpgsql security definer as $$
declare sid text; i int;
begin
  if not public.has_perm('academics.manage_years') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  select id into sid from public.schools order by id limit 1;

  insert into public.academic_years (id, school_id, name, start_date, end_date, is_active, status)
  values (p_id, sid, p_name, p_start, p_end, false, 'planned')
  on conflict (id) do nothing;

  for i in 1 .. coalesce(array_length(p_terms, 1), 0) loop
    insert into public.terms (id, year_id, name, seq)
    values (p_id || '-t' || i, p_id, p_terms[i], i)
    on conflict (year_id, name) do nothing;
  end loop;

  perform public.log_action('year.create', p_id, p_name);
  return jsonb_build_object('yearId', p_id, 'terms', coalesce(array_length(p_terms, 1), 0));
end $$;
grant execute on function public.create_academic_year(text,text,date,date,text[]) to authenticated;

-- Editing an EXISTING year's name/dates never had an operation — only
-- creating one did. Deliberately does not touch is_active or status;
-- set_active_year() and close_year() own those.
create or replace function public.update_academic_year(p_year_id text, p_name text, p_start date, p_end date)
returns jsonb language plpgsql security definer as $$
begin
  if not public.has_perm('academics.manage_years') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if not exists (select 1 from public.academic_years where id = p_year_id) then
    raise exception 'unknown academic year %', p_year_id;
  end if;
  if p_end <= p_start then raise exception 'end date must be after the start date'; end if;

  update public.academic_years set name = p_name, start_date = p_start, end_date = p_end where id = p_year_id;
  perform public.log_action('year.update', p_year_id, p_name);
  return jsonb_build_object('yearId', p_year_id);
end $$;
grant execute on function public.update_academic_year(text,text,date,date) to authenticated;

create or replace function public.delete_academic_year(p_year_id text)
returns jsonb language plpgsql security definer as $$
declare y public.academic_years;
begin
  if not public.has_perm('academics.manage_years') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  select * into y from public.academic_years where id = p_year_id;
  if y.id is null then return jsonb_build_object('deleted', 0); end if;
  if y.is_active then raise exception 'set a different year as active before deleting this one'; end if;
  if exists (select 1 from public.enrollments where year_id = p_year_id)
    or exists (select 1 from public.assessment_structures where year_id = p_year_id)
    or exists (select 1 from public.homework where year_id = p_year_id) then
    raise exception 'this year has enrollment, assessment structures or homework tied to it — remove those first';
  end if;

  delete from public.academic_years where id = p_year_id; -- terms cascade
  perform public.log_action('year.delete', p_year_id, y.name);
  return jsonb_build_object('deleted', 1);
end $$;
grant execute on function public.delete_academic_year(text) to authenticated;

create or replace function public.save_term(p_payload jsonb)
returns jsonb language plpgsql security definer as $$
declare tid text := p_payload->>'id'; yid text := p_payload->>'year_id';
begin
  if not public.has_perm('academics.manage_years') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  if coalesce(btrim(p_payload->>'name'), '') = '' then raise exception 'a term name is required'; end if;
  if exists (
    select 1 from public.terms
    where year_id = yid and lower(btrim(name)) = lower(btrim(p_payload->>'name')) and id <> coalesce(tid, '')
  ) then
    raise exception 'this year already has a term with that name';
  end if;

  if tid is null or btrim(tid) = '' then
    tid := yid || '-t-' || replace(gen_random_uuid()::text, '-', '');
  end if;

  insert into public.terms (id, year_id, name, seq)
  values (tid, yid, btrim(p_payload->>'name'), coalesce((p_payload->>'seq')::integer, 1))
  on conflict (id) do update set name = excluded.name, seq = excluded.seq;

  perform public.log_action('term.save', tid, p_payload->>'name');
  return jsonb_build_object('termId', tid);
end $$;
grant execute on function public.save_term(jsonb) to authenticated;

create or replace function public.delete_term(p_term_id text)
returns jsonb language plpgsql security definer as $$
declare t public.terms;
begin
  if not public.has_perm('academics.manage_years') then
    raise exception 'not permitted' using errcode = '42501';
  end if;
  select * into t from public.terms where id = p_term_id;
  if t.id is null then return jsonb_build_object('deleted', 0); end if;
  if exists (
    select 1 from public.assessment_structures
    where year_id = t.year_id and term_id = t.id
  ) then
    raise exception 'this term has assessment structures using it — remove those first';
  end if;

  delete from public.terms where id = t.id;
  perform public.log_action('term.delete', p_term_id, t.name);
  return jsonb_build_object('deleted', 1);
end $$;
grant execute on function public.delete_term(text) to authenticated;


-- =================== 0032_reconcile_student_documents.sql ===================
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


-- make the API see the new functions
notify pgrst, 'reload schema';
