/* ---------------------------------------------------------------------
   0044 — notifications are created by the database, not the browser

   Homework, announcements and events used to build their recipient list in
   the browser (db.users / db.students) and send one notify_users() call per
   recipient. Since the bounded bootstrap (0023/0043) the browser only holds
   the signed-in user, so those lists came back empty and nobody was
   notified. Fee items never notified anyone at all.

   The database knows who the recipients are, so it now creates the
   notifications itself with AFTER triggers. This works no matter which
   client or RPC wrote the row. Safe to re-run.
   --------------------------------------------------------------------- */

-- Insert one notification per distinct, active profile.
create or replace function public._notify_profiles(
  p_ids uuid[], p_type text, p_title text, p_body text)
returns void language sql security definer set search_path = public as $$
  insert into public.notifications (profile_id, type, title, body)
  select distinct pr.id, p_type, p_title, p_body
  from unnest(coalesce(p_ids, '{}'::uuid[])) u(id)
  join public.profiles pr on pr.id = u.id and pr.status = 'active';
$$;

-- Profiles for a student: the student's own login plus every linked guardian.
create or replace function public._student_profile_ids(p_student_ids text[])
returns uuid[] language sql stable security definer set search_path = public as $$
  select coalesce(array_agg(distinct id), '{}'::uuid[]) from (
    select pr.id from public.profiles pr
      where pr.role = 'student' and pr.student_id = any(p_student_ids)
    union
    select gs.guardian_id from public.guardian_students gs
      where gs.student_id = any(p_student_ids)
  ) x;
$$;

-- Resolve an announcement/event audience (same shapes as the app's Audience
-- type) to profile ids. Sections are matched against the ACTIVE year.
create or replace function public._audience_profile_ids(p_aud jsonb)
returns uuid[] language plpgsql stable security definer set search_path = public as $$
declare
  kind text := coalesce(p_aud->>'kind', 'everyone');
  cls  text := coalesce(p_aud->>'classId',  p_aud->>'class_id');
  sec  text := coalesce(p_aud->>'sectionId', p_aud->>'section_id');
  yr   text := (select id from public.academic_years where is_active limit 1);
  ids  uuid[];
begin
  if kind = 'everyone' then
    select array_agg(id) into ids from public.profiles where status = 'active';
  elsif kind in ('teachers', 'students', 'guardians') then
    select array_agg(id) into ids from public.profiles
      where status = 'active' and role = rtrim(kind, 's');
  elsif kind in ('section-students', 'section-guardians') then
    select public._student_profile_ids(array_agg(e.student_id)) into ids
      from public.enrollments e
      where e.year_id = yr and e.class_id = cls and e.section_id = sec and e.status = 'active';
    -- keep only the role the audience asked for
    select array_agg(pr.id) into ids from public.profiles pr
      where pr.id = any(coalesce(ids, '{}'::uuid[]))
        and pr.role = case when kind = 'section-students' then 'student' else 'guardian' end;
  end if;
  return coalesce(ids, '{}'::uuid[]);
end $$;

/* ---------------- homework ---------------- */
create or replace function public.trg_notify_homework()
returns trigger language plpgsql security definer set search_path = public as $$
declare ids uuid[];
begin
  select public._student_profile_ids(array_agg(e.student_id)) into ids
    from public.enrollments e
    where e.year_id = new.year_id and e.class_id = new.class_id
      and e.section_id = new.section_id and e.status = 'active';
  perform public._notify_profiles(ids, 'homework', 'New homework',
    new.title || ' — due ' || to_char(new.due, 'DD Mon YYYY') || '.');
  return null;
end $$;
drop trigger if exists notify_homework on public.homework;
create trigger notify_homework after insert on public.homework
  for each row execute function public.trg_notify_homework();

/* ---------------- fees ---------------- */
create or replace function public.trg_notify_fee_item()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public._notify_profiles(
    public._student_profile_ids(array[new.student_id]), 'fee', 'New fee added',
    new.label || ' — ' || trim(to_char(new.amount, 'FM999,999,990.00'))
      || coalesce(' (due ' || to_char(new.due_date, 'DD Mon YYYY') || ')', ''));
  return null;
end $$;
drop trigger if exists notify_fee_item on public.fee_items;
create trigger notify_fee_item after insert on public.fee_items
  for each row execute function public.trg_notify_fee_item();

/* ---------------- announcements (on becoming published) ---------------- */
create or replace function public.trg_notify_announcement()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'published'
     and (tg_op = 'INSERT' or old.status is distinct from 'published') then
    perform public._notify_profiles(
      array(select x from unnest(public._audience_profile_ids(new.audience)) x
            where x is distinct from new.sender_id),
      'announcement', new.title, left(new.body, 110));
  end if;
  return null;
end $$;
drop trigger if exists notify_announcement on public.announcements;
create trigger notify_announcement after insert or update of status on public.announcements
  for each row execute function public.trg_notify_announcement();

/* ---------------- events ---------------- */
create or replace function public.trg_notify_event()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  perform public._notify_profiles(
    array(select x from unnest(public._audience_profile_ids(new.audience)) x
          where x is distinct from new.created_by),
    'event', 'New school event',
    new.title || ' — ' || to_char(new.day, 'DD Mon YYYY')
      || coalesce(' at ' || new.time_of_day, '') || coalesce(', ' || new.location, ''));
  return null;
end $$;
drop trigger if exists notify_event on public.events;
create trigger notify_event after insert on public.events
  for each row execute function public.trg_notify_event();

notify pgrst, 'reload schema';
