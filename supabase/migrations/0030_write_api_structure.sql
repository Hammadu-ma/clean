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
