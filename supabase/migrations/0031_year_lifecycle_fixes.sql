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
