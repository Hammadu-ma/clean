/* ---------------------------------------------------------------------
   0035 — year-scope the legacy bootstrap/snapshot reads

   WHY THIS EXISTS
   get_app_bootstrap() and get_app_snapshot() (0012) are what the frontend
   actually calls on every login and on first use of any feature group,
   respectively (0023/0024 built proper replacements — get_bootstrap() and
   the list_*() functions — but the frontend was never migrated onto them;
   that's a separate, much larger change touching most pages, tracked
   separately). Both of the legacy functions select every row in every
   per-year table for every year the school has ever run, every single
   time. That's the "downloads everything, for every role, every time"
   problem: it doesn't just cost bandwidth once, it gets slower and
   heavier every single year the school keeps using the app.

   This migration narrows both functions to the current academic year for
   tables that are genuinely per-year *operational* data (this year's
   timetable, this year's homework, this year's attendance, this year's
   marks, this year's fee items) — the exact same boundary
   0023's get_bootstrap()/my_scope() already use for the tables it covers.

   Deliberately NOT year-filtered, because people reasonably expect them to
   persist across a year boundary rather than vanish the moment the active
   year rolls over:
     - students (demographic record — also, the frontend derives the next
       admission number from this array's length; filtering it would silently
       start colliding with old admission numbers)
     - enrollments (people.tsx renders a student's full multi-year enrollment
       history, and registration.tsx reads past entries when re-enrolling a
       returning student — both are real, existing features)
     - profiles / guardian_students (identity & relationships, not activity)
     - announcements, events (moderate volume; still worth reading last year's)
     - conversations, messages, notifications, audit_log (audit trails and
       conversation history exist specifically to be looked back on)

   Same JSON field names and shapes come back either way, so nothing in the
   frontend needs to change for this migration to take effect — it only
   ever returns a subset of what it returned before.
   --------------------------------------------------------------------- */

create or replace function public.get_app_bootstrap()
returns jsonb
language sql
security invoker
stable
as $$
  select jsonb_build_object(
    'schools', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,name,motto,bank_accounts from public.schools) x), '[]'::jsonb),
    'academic_years', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,name,start_date,end_date,is_active from public.academic_years) x), '[]'::jsonb),
    'terms', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,year_id,name,seq from public.terms) x), '[]'::jsonb),
    'classes', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,name,level from public.classes) x), '[]'::jsonb),
    'sections', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,class_id,name from public.sections) x), '[]'::jsonb),
    'subjects', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,name,code,color from public.subjects) x), '[]'::jsonb),
    'teachers', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,name,phone,email,specialty from public.teachers) x), '[]'::jsonb),
    -- year-scoped: an assignment is "this teacher teaches this section this
    -- year" — last year's assignments aren't part of how the school runs today.
    'teacher_assignments', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,year_id,class_id,section_id,subject_id,teacher_id from public.teacher_assignments where year_id = public.current_year_id()) x), '[]'::jsonb),
    -- NOT year-scoped: the demographic record. Filtering this by enrollment
    -- year would also silently break the admission-number counter, which
    -- reads this array's total length.
    'students', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,reg_no,first_name,middle_name,last_name,gender,dob,phone,email,address,photo_path,guardian_name,mother_name,guardian_relation,guardian_phone,guardian_address,admission_no,admission_date,previous_school,admission_type from public.students) x), '[]'::jsonb),
    -- NOT year-scoped: people.tsx renders a student's full multi-year
    -- enrollment history (a real feature), and registration.tsx reads past
    -- entries when re-enrolling a returning student. Unlike the other
    -- per-year tables, "last year's" rows here are actively displayed.
    'enrollments', coalesce((select jsonb_agg(to_jsonb(x)) from (select student_id,year_id,class_id,section_id,roll_number,status,enrolled_on from public.enrollments) x), '[]'::jsonb),
    'profiles', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,full_name,username,role,role_def_id,status,email,phone,teacher_id,student_id,created_at from public.profiles) x), '[]'::jsonb),
    'guardian_students', coalesce((select jsonb_agg(to_jsonb(x)) from (select guardian_id,student_id from public.guardian_students) x), '[]'::jsonb),
    'timetable_entries', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,class_id,section_id,day,period,subject_id,room from public.timetable_entries where year_id = public.current_year_id()) x), '[]'::jsonb),
    'homework', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,year_id,class_id,section_id,subject_id,title,description,issued,due,submitted_students from public.homework where year_id = public.current_year_id()) x), '[]'::jsonb),
    'assessment_structures', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,year_id,class_id,subject_id,term_id from public.assessment_structures where year_id = public.current_year_id()) x), '[]'::jsonb),
    'assessment_items', coalesce((select jsonb_agg(to_jsonb(x)) from (select ai.id,ai.structure_id,ai.name,ai.max_mark,ai.weight,ai.sort from public.assessment_items ai join public.assessment_structures s on s.id = ai.structure_id where s.year_id = public.current_year_id()) x), '[]'::jsonb),
    'mark_submissions', coalesce((select jsonb_agg(to_jsonb(x)) from (select ms.id,ms.structure_id,ms.status,ms.submitted_by,ms.submitted_at,ms.approved_by,ms.approved_at,ms.returned_by,ms.returned_at,ms.return_reason,ms.published_by,ms.published_at,ms.reopen_reason from public.mark_submissions ms join public.assessment_structures s on s.id = ms.structure_id where s.year_id = public.current_year_id()) x), '[]'::jsonb),
    'attendance_registers', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,day,class_id,section_id,recorded_by from public.attendance_registers where year_id = public.current_year_id()) x), '[]'::jsonb),
    -- NOT year-scoped: announcements are low-volume enough (dozens to
    -- hundreds a year) that last year's are still worth reading, not worth
    -- the risk of hiding something someone expects to still be there.
    'announcements', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,title,body,category,sender_id,audience,status,created_at,scheduled_for,published_at,pinned from public.announcements) x), '[]'::jsonb),
    'announcement_reads', coalesce((select jsonb_agg(to_jsonb(x)) from (select announcement_id,profile_id from public.announcement_reads) x), '[]'::jsonb),
    'role_defs', coalesce((select jsonb_agg(to_jsonb(x)) from (select id,name,description,is_system,all_permissions,applies_to,status from public.role_defs) x), '[]'::jsonb),
    'role_permissions', coalesce((select jsonb_agg(to_jsonb(x)) from (select role_def_id,permission_id from public.role_permissions) x), '[]'::jsonb)
  );
$$;

create or replace function public.get_app_snapshot()
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
    'teacher_assignments', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.teacher_assignments where year_id = public.current_year_id()) x), '[]'::jsonb),
    'students', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.students) x), '[]'::jsonb),
    'enrollments', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.enrollments) x), '[]'::jsonb),
    'student_documents', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.student_documents where year_id = public.current_year_id()) x), '[]'::jsonb),
    'assessment_structures', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.assessment_structures where year_id = public.current_year_id()) x), '[]'::jsonb),
    'assessment_items', coalesce((select jsonb_agg(to_jsonb(x)) from (select ai.* from public.assessment_items ai join public.assessment_structures s on s.id = ai.structure_id where s.year_id = public.current_year_id()) x), '[]'::jsonb),
    'assessment_marks', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.assessment_marks where year_id = public.current_year_id()) x), '[]'::jsonb),
    'mark_submissions', coalesce((select jsonb_agg(to_jsonb(x)) from (select ms.* from public.mark_submissions ms join public.assessment_structures s on s.id = ms.structure_id where s.year_id = public.current_year_id()) x), '[]'::jsonb),
    'grade_bands', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.grade_bands where year_id = public.current_year_id()) x), '[]'::jsonb),
    'attendance_registers', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.attendance_registers where year_id = public.current_year_id()) x), '[]'::jsonb),
    'attendance_entries', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.attendance_entries where year_id = public.current_year_id()) x), '[]'::jsonb),
    'fee_items', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.fee_items where year_id = public.current_year_id()) x), '[]'::jsonb),
    'homework', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.homework where year_id = public.current_year_id()) x), '[]'::jsonb),
    'timetable_entries', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.timetable_entries where year_id = public.current_year_id()) x), '[]'::jsonb),
    'role_defs', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.role_defs) x), '[]'::jsonb),
    'role_permissions', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.role_permissions) x), '[]'::jsonb),
    'profiles', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.profiles) x), '[]'::jsonb),
    'guardian_students', coalesce((select jsonb_agg(to_jsonb(x)) from (select * from public.guardian_students) x), '[]'::jsonb),
    -- Left unscoped below: announcements, events, conversations, messages,
    -- notifications and audit_log are things people expect to still find
    -- after the school's active year rolls over (a compliance trail, a
    -- chat thread, a notification history) — see the header comment.
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

grant execute on function public.get_app_bootstrap() to authenticated;
grant execute on function public.get_app_snapshot() to authenticated;

comment on function public.get_app_bootstrap() is
  'Year-scoped as of 0035 for per-year operational tables (teacher assignments, timetable, homework, assessments, attendance). Still unbounded for students/enrollments/profiles/announcements — see 0035 header comment for why. Superseded long-term by get_bootstrap(year_id) once the frontend migrates onto it.';
comment on function public.get_app_snapshot() is
  'Year-scoped as of 0035 the same way as get_app_bootstrap(). Still a full-table read for anything not per-year (messages, notifications, audit, announcements, events) — intended only as the rare recovery resync, never the hot path.';
