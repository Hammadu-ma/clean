/* ---------------------------------------------------------------------
   0043 — profiles was the one table nothing ever scoped, at all

   Prompted by: this app needs to work for a genuinely large school
   (5,000+ students) on Supabase's free tier, where both egress and
   compute are real, hard limits, not just nice-to-haves.

   Checking every table get_app_bootstrap()/get_app_snapshot() touch
   against its own RLS policy turned up good news first: most of the
   tables that scale with student count are already correctly scoped by
   existing, working RLS —
     - students / enrollments / student_documents: can_view_student(id)
       (admin: everyone; teacher: their assigned students; student:
       themselves; guardian: their linked children)
     - attendance_registers / attendance_entries: can_see_section(...)
     - guardian_students: guardian_id = auth.uid() or can_view_student(...)
   All of these already silently return a small, correctly-scoped set for
   every role except admin, purely because these functions run
   `security invoker` — RLS applies exactly as if the caller queried the
   table directly, with no code change needed. That was already true
   before this migration.

   profiles was the one real gap: `create policy profiles_sel ... using
   (true)` (0002) — every authenticated account can read every other
   account's row, full stop, no role-based limiting at all. At 5,000+
   students that's roughly 8,000-15,000 profile rows (students, their
   guardians, staff) downloaded in full by literally every login, every
   time — the dominant cost by far, and the one table where "genuinely
   large school" turns into "everyone's login gets slower and heavier
   forever," independent of which year is active.

   Fixed the same way as the already-working tables above: scoped in the
   bootstrap/snapshot queries themselves (not by tightening the
   underlying RLS policy, which other features may depend on staying
   open — e.g. an admin's user-management tooling, or name lookups this
   migration didn't audit) to yourself, plus anyone can_message_user()
   already says you're connected to — the same proven relationship
   matrix messaging already uses (teacher <-> their students/guardians,
   colleagues, everyone <-> admin). Reusing it here means no new
   relationship rules to get wrong, and it already handles admin
   correctly (sees everyone).
   --------------------------------------------------------------------- */

create or replace function public.get_app_bootstrap(p_year_id text default null)
returns jsonb
language sql
security invoker
stable
as $$
  select jsonb_build_object(
    'schools', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,name,motto,bank_accounts,working_days,periods from public.schools) x), '[]'::jsonb),
    'academic_years', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,name,start_date,end_date,is_active from public.academic_years) x), '[]'::jsonb),
    'terms', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,year_id,name,seq from public.terms) x), '[]'::jsonb),
    'classes', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,name,level from public.classes) x), '[]'::jsonb),
    'sections', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,class_id,name from public.sections) x), '[]'::jsonb),
    'subjects', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,name,code,color from public.subjects) x), '[]'::jsonb),
    'teachers', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,name,phone,email,specialty from public.teachers) x), '[]'::jsonb),
    'teacher_assignments', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,year_id,class_id,section_id,subject_id,teacher_id from public.teacher_assignments where year_id = coalesce(p_year_id, public.current_year_id())) x), '[]'::jsonb),
    'students', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,reg_no,first_name,middle_name,last_name,gender,dob,phone,email,address,photo_path,guardian_name,mother_name,guardian_relation,guardian_phone,guardian_address,admission_no,admission_date,previous_school,admission_type from public.students) x), '[]'::jsonb),
    'enrollments', coalesce((select jsonb_agg(to_jsonb(x)) from (select student_id,year_id,class_id,section_id,roll_number,status,enrolled_on from public.enrollments) x), '[]'::jsonb),
    -- Scoped: see this migration's header comment. Own row always
    -- included even if can_message_user(id) would say no (e.g.
    -- communication.send revoked) — you can always see yourself.
    'profiles', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select id,full_name,username,role,role_def_id,status,email,phone,teacher_id,student_id,created_at
      from public.profiles
      where public.is_admin() or id = auth.uid() or public.can_message_user(id)
    ) x), '[]'::jsonb),
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
    'profiles', coalesce((select jsonb_agg(to_jsonb(x)) from (
      select * from public.profiles
      where public.is_admin() or id = auth.uid() or public.can_message_user(id)
    ) x), '[]'::jsonb),
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
