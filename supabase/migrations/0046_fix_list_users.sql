/* ---------------------------------------------------------------------
   0046 — list_users: fix "42501 not permitted" and
          "column reference \"id\" is ambiguous"

   The live list_users() was never captured in a migration, so this
   rebuilds it from what the client contract requires (src/lib/api.ts
   UserRow + api/_lib/allowlist.ts argument list).

   What changed vs. the broken versions
   - Every column is table-qualified, and `#variable_conflict use_column`
     is set, so the RETURNS TABLE column names (id, role, ...) can no
     longer collide with plpgsql output variables.
   - Explicit REVOKE/GRANT: authenticated may EXECUTE; anon/public may not.
     A missing EXECUTE grant is the classic cause of 42501 on an RPC.
   - Visibility uses the SAME rule as get_app_bootstrap (0043): admins and
     users.manage holders see everyone; everybody else sees themselves
     plus whoever can_message_user() says they are connected to. This
     also serves the "new message" recipient picker for teachers,
     students and guardians without exposing the whole school.

   REVIEW BEFORE APPLYING: if the old function deliberately hid the list
   from non-admin roles, tighten the WHERE clause below.
   --------------------------------------------------------------------- */

-- Drop every existing overload so a differing old signature can't linger.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = 'list_users'
  loop
    execute 'drop function ' || r.sig;
  end loop;
end $$;

create function public.list_users(
  p_year_id    text    default null,
  p_role       text    default null,
  p_status     text    default null,
  p_search     text    default null,
  p_class_id   text    default null,
  p_section_id text    default null,
  p_limit      integer default 50,
  p_offset     integer default 0)
returns table (
  id uuid, full_name text, username text, role text, role_def_id text,
  status text, email text, phone text, teacher_id text, student_id text,
  created_at timestamptz, children_ids text[], linked_name text,
  linked_class_id text, linked_section_id text, total_count bigint)
language plpgsql
security definer
stable
set search_path = public
as $$
#variable_conflict use_column
declare
  yr  text    := coalesce(p_year_id, public.current_year_id());
  lim integer := least(greatest(coalesce(p_limit, 50), 1), 200);
  skip_n integer := greatest(coalesce(p_offset, 0), 0);
  q   text    := nullif(btrim(coalesce(p_search, '')), '');
begin
  if auth.uid() is null
     or not exists (select 1 from public.profiles me
                    where me.id = auth.uid() and me.status = 'active') then
    raise exception 'not authenticated' using errcode = '28000';
  end if;

  return query
  with visible as (
    select pr.id, pr.full_name, pr.username, pr.role, pr.role_def_id, pr.status,
           pr.email, pr.phone, pr.teacher_id, pr.student_id, pr.created_at
    from public.profiles pr
    where (public.is_admin() or public.has_perm('users.manage')
           or pr.id = auth.uid() or public.can_message_user(pr.id))
      and (p_role   is null or pr.role   = p_role)
      and (p_status is null or pr.status = p_status)
      and (q is null or pr.full_name ilike '%' || q || '%'
                     or pr.username  ilike '%' || q || '%'
                     or coalesce(pr.email, '') ilike '%' || q || '%')
  ),
  kids as (
    select gs.guardian_id, array_agg(gs.student_id::text order by gs.student_id) as ids
    from public.guardian_students gs
    join visible v on v.id = gs.guardian_id
    group by gs.guardian_id
  ),
  shaped as (
    select v.*,
           coalesce(k.ids, '{}'::text[]) as children_ids,
           -- students relate to themselves, guardians to their children
           case when v.student_id is not null then array[v.student_id::text]
                else coalesce(k.ids, '{}'::text[]) end as rel_ids
    from visible v
    left join kids k on k.guardian_id = v.id
  ),
  filtered as (
    select s.*
    from shaped s
    where (p_class_id is null and p_section_id is null)
       or exists (select 1 from public.enrollments e
                  where e.year_id = yr and e.status = 'active'
                    and e.student_id::text = any (s.rel_ids)
                    and (p_class_id   is null or e.class_id   = p_class_id)
                    and (p_section_id is null or e.section_id = p_section_id))
  )
  select f.id::uuid, f.full_name::text, f.username::text, f.role::text,
         f.role_def_id::text, f.status::text, f.email::text, f.phone::text,
         f.teacher_id::text, f.student_id::text, f.created_at::timestamptz,
         f.children_ids,
         case
           when f.teacher_id is not null then
             (select t.name::text from public.teachers t where t.id::text = f.teacher_id::text)
           when f.student_id is not null then
             (select btrim(coalesce(st.first_name, '') || ' ' || coalesce(st.last_name, ''))
              from public.students st where st.id::text = f.student_id::text)
         end,
         (select en.class_id::text from public.enrollments en
          where en.year_id = yr and en.status = 'active'
            and en.student_id::text = f.rel_ids[1] limit 1),
         (select en.section_id::text from public.enrollments en
          where en.year_id = yr and en.status = 'active'
            and en.student_id::text = f.rel_ids[1] limit 1),
         count(*) over ()
  from filtered f
  order by f.full_name, f.id
  limit lim offset skip_n;
end
$$;

revoke all on function public.list_users(text, text, text, text, text, text, integer, integer) from public, anon;
grant execute on function public.list_users(text, text, text, text, text, text, integer, integer) to authenticated;

-- PostgREST caches function signatures; make it pick up the new one now.
notify pgrst, 'reload schema';
