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
