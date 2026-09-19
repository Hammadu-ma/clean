/* ---------------------------------------------------------------------
   0037 — fee_payment_requests was never in get_app_snapshot()

   Found while working on 0035/0036: hydrateGroup()'s "fees" case (backend.ts)
   has always called sel("fee_payment_requests") — a guardian's pending
   bank-transfer submission awaiting fees.manage review (0015) — but that
   key has never once existed in get_app_snapshot()'s output, in any of its
   versions (0012 through 0036). sel() silently falls back to [] and logs a
   console warning when a requested table isn't in the snapshot, so this
   never surfaced as an error anywhere — db.paymentRequests has just always
   been empty for anyone reading it through this path, with no visible sign
   why. Concretely: an admin reviewing "pending fee payments" would never
   see any a guardian had actually submitted.

   Fix: add the missing key. Scoped by year the same way as the rest of the
   "fees" group (0035) — a payment request is for one fee_item, and
   fee_items already carries year_id, so that's joined through rather than
   added as a new column on fee_payment_requests itself.
   --------------------------------------------------------------------- */

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
    -- Was missing entirely before this migration — see header comment.
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
