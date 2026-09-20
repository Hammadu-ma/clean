/* ---------------------------------------------------------------------
   0039 — configurable working days (timetable was hardcoded to Mon–Fri)

   The timetable grid's day columns came from a plain JS constant —
   DAYS = ["Monday", ..., "Friday"] — duplicated in both
   src/pages/academics.tsx and src/data/seed.ts, with no way for a school
   to add a working Saturday, drop a day, or otherwise run anything but
   exactly that fixed five-day week.

   working_days stores which of the 7 weekdays count as working days — a
   subset toggle of a fixed, stable set, not a reorderable named list.
   That's deliberate: timetable_entries.day has always been a plain 0-6
   index (the DB's check constraint already allowed 0-6; only the client's
   5-element array ever limited it to 0-4), so this changes nothing about
   what an existing entry's day number means or how it's stored — no data
   migration, no risk of an old "Wednesday" entry silently becoming
   "Thursday" if a school removes a day from the middle of what used to be
   an arbitrary ordered list. Toggling Tuesday off just stops rendering
   column 2; it can never renumber Wednesday.

   Day 0 means Monday, not Sunday: the old 5-element DAYS array was
   ["Monday", ..., "Friday"], so day=0 in any timetable entry a real school
   has already entered means Monday today. The 7-day set here keeps that
   exact ordering (Mon=0..Fri=4, Sat=5, Sun=6) specifically so existing
   entries keep meaning what they've always meant — this is NOT
   JavaScript's Date.getDay() convention (which is Sunday-first), and
   using that instead would have silently relabeled every existing
   Wed/Thu/Fri entry as Tue/Wed/Thu.
   --------------------------------------------------------------------- */

alter table public.schools
  add column if not exists working_days jsonb not null default '[0,1,2,3,4]'::jsonb;

create or replace function public.get_app_bootstrap(p_year_id text default null)
returns jsonb
language sql
security invoker
stable
as $$
  select jsonb_build_object(
    'schools', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,name,motto,bank_accounts,working_days from public.schools) x), '[]'::jsonb),
    'academic_years', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,name,start_date,end_date,is_active from public.academic_years) x), '[]'::jsonb),
    'terms', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,year_id,name,seq from public.terms) x), '[]'::jsonb),
    'classes', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,name,level from public.classes) x), '[]'::jsonb),
    'sections', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,class_id,name from public.sections) x), '[]'::jsonb),
    'subjects', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,name,code,color from public.subjects) x), '[]'::jsonb),
    'teachers', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,name,phone,email,specialty from public.teachers) x), '[]'::jsonb),
    'teacher_assignments', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,year_id,class_id,section_id,subject_id,teacher_id from public.teacher_assignments where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'students', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,reg_no,first_name,middle_name,last_name,gender,dob,phone,email,address,photo_path,guardian_name,mother_name,guardian_relation,guardian_phone,guardian_address,admission_no,admission_date,previous_school,admission_type from public.students) x), '[]'::jsonb),
    'enrollments', coalesce((select jsonb_agg(to_jsonb(x)) from (select student_id,year_id,class_id,section_id,roll_number,status,enrolled_on from public.enrollments) x), '[]'::jsonb),
    'profiles', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,full_name,username,role,role_def_id,status,email,phone,teacher_id,student_id,created_at from public.profiles) x), '[]'::jsonb),
    'guardian_students', coalesce((select jsonb_agg(to_jsonb(x)) from (select guardian_id,student_id from public.guardian_students) x), '[]'::jsonb),
    'timetable_entries', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,class_id,section_id,day,period,subject_id,room from public.timetable_entries where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'homework', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,year_id,class_id,section_id,subject_id,title,description,issued,due,submitted_students from public.homework where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'assessment_structures', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,year_id,class_id,subject_id,term_id from public.assessment_structures where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'assessment_items', coalesce((select jsonb_agg(to_jsonb(x)) from (select ai.id,ai.structure_id,ai.name,ai.max_mark,ai.weight,ai.sort from public.assessment_items ai join public.assessment_structures s on s.id = ai.structure_id where s.year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'mark_submissions', coalesce((select jsonb_agg(to_jsonb(x)) from (select ms.id,ms.structure_id,ms.status,ms.submitted_by,ms.submitted_at,ms.approved_by,ms.approved_at,ms.returned_by,ms.returned_at,ms.return_reason,ms.published_by,ms.published_at,ms.reopen_reason from public.mark_submissions ms join public.assessment_structures s on s.id = ms.structure_id where s.year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'attendance_registers', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,day,class_id,section_id,recorded_by from public.attendance_registers where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'announcements', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,title,body,category,sender_id,audience,status,created_at,scheduled_for,published_at,pinned from public.announcements) x), '[]'::jsonb),
    'announcement_reads', coalesce((select jsonb_agg(to_jsonb(x)) from (select announcement_id,profile_id from public.announcement_reads) x), '[]'::jsonb),
    'role_defs', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,name,description,is_system,all_permissions,applies_to,status from public.role_defs) x), '[]'::jsonb),
    'role_permissions', coalesce((select jsonb_agg(to_jsonb(x)) from (select role_def_id,permission_id from public.role_permissions) x), '[]'::jsonb)
  );
$$;
grant execute on function public.get_app_bootstrap(text) to authenticated;

create or replace function public.get_app_snapshot(p_year_id text default null)
returns jsonb
language sql
security invoker
stable
as $$
  select jsonb_build_object(
    'schools', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.schools) x), '[]'::jsonb),
    'academic_years', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.academic_years) x), '[]'::jsonb),
    'terms', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.terms) x), '[]'::jsonb),
    'classes', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.classes) x), '[]'::jsonb),
    'sections', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.sections) x), '[]'::jsonb),
    'subjects', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.subjects) x), '[]'::jsonb),
    'teachers', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.teachers) x), '[]'::jsonb),
    'teacher_assignments', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.teacher_assignments where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'students', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.students) x), '[]'::jsonb),
    'enrollments', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.enrollments) x), '[]'::jsonb),
    'student_documents', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.student_documents where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'assessment_structures', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.assessment_structures where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'assessment_items', coalesce((select jsonb_agg(to_jsonb(x)) from (select ai.* from public.assessment_items ai join public.assessment_structures s on s.id = ai.structure_id where s.year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'assessment_marks', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.assessment_marks where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'mark_submissions', coalesce((select jsonb_agg(to_jsonb(x)) from (select ms.* from public.mark_submissions ms join public.assessment_structures s on s.id = ms.structure_id where s.year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'grade_bands', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.grade_bands where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'attendance_registers', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.attendance_registers where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'attendance_entries', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.attendance_entries where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'fee_items', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.fee_items where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'fee_payment_requests', coalesce((select jsonb_agg(to_jsonb(x)) from (select r.* from public.fee_payment_requests r join public.fee_items fi on fi.id = r.fee_item_id where fi.year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'homework', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.homework where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'timetable_entries', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.timetable_entries where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'role_defs', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.role_defs) x), '[]'::jsonb),
    'role_permissions', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.role_permissions) x), '[]'::jsonb),
    'profiles', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.profiles) x), '[]'::jsonb),
    'guardian_students', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.guardian_students) x), '[]'::jsonb),
    'announcements', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.announcements) x), '[]'::jsonb),
    'announcement_reads', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.announcement_reads) x), '[]'::jsonb),
    'conversations', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.conversations) x), '[]'::jsonb),
    'conversation_participants', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.conversation_participants) x), '[]'::jsonb),
    'messages', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.messages) x), '[]'::jsonb),
    'notifications', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.notifications) x), '[]'::jsonb),
    'events', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.events) x), '[]'::jsonb),
    'audit_log', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.audit_log) x), '[]'::jsonb),
    'message_reports', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.message_reports) x), '[]'::jsonb)
  );
$$;
grant execute on function public.get_app_snapshot(text) to authenticated;

create or replace function public.update_school_settings(
  p_name text default null, p_motto text default null, p_bank_accounts text default null,
  p_working_days text default null)
returns jsonb language plpgsql security definer as $$
declare sch text; accounts jsonb; days jsonb;
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
  if p_working_days is not null then
    begin
      days := p_working_days::jsonb;
    exception when others then
      raise exception 'working days payload is not valid JSON';
    end;
    if jsonb_typeof(days) <> 'array' or jsonb_array_length(days) = 0 then
      raise exception 'working days must be a non-empty JSON array';
    end if;
    if exists (
      select 1 from jsonb_array_elements(days) v
      where jsonb_typeof(v) <> 'number' or (v::text)::int not between 0 and 6
    ) then
      raise exception 'working days must be integers 0-6 (Sunday-Saturday)';
    end if;
  end if;

  select id into sch from public.schools order by id limit 1;
  update public.schools set
    name = coalesce(p_name, name),
    motto = coalesce(p_motto, motto),
    bank_accounts = coalesce(accounts, bank_accounts),
    working_days = coalesce(days, working_days)
  where id = sch;
  perform public.log_action('settings.update', sch, p_name);
  return jsonb_build_object('schoolId', sch);
end $$;
grant execute on function public.update_school_settings(text,text,text,text) to authenticated;
drop function if exists public.update_school_settings(text,text,text);
